import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Document, isMap, isSeq, parseDocument } from "yaml";
import { homedir } from "node:os";
//#region lib/types/shared.js
/**
* Shared runtime primitives used by BOTH the projection layer and the patch
* writer. They live here rather than in either module so the two never import
* each other (a cycle ESM tolerates but which makes load order load-bearing).
* `types.ts` stays type-only, so these runtime values cannot live there.
*/
/** Package name every managed row must carry. */
const MCP_CLIENT_PACKAGE = "@deepseek-ai/dsh-mcp-client";
/** A stable, patch-targetable row id. */
const STABLE_ROW_ID = /^[A-Za-z0-9_.-]+$/;
/**
* Loader-generated ids are 8 hex chars and are re-minted every boot, so a
* patch written against one would target nothing after a restart.
*/
const GENERATED_ROW_ID = /^[0-9a-f]{8}$/;
/** Whether a row id can be targeted by a patch across restarts. */
function isStableRowId(rowId) {
	return STABLE_ROW_ID.test(rowId) && !GENERATED_ROW_ID.test(rowId);
}
/** mcp-client's `serverName` constraint, enforced before a write. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** Whether a server name satisfies mcp-client's namespace contract. */
function isValidServerName(serverName) {
	return SERVER_NAME_PATTERN.test(serverName);
}
/**
* Derive a stable patch row id from a server name (`tavily` → `mcp-tavily`),
* de-duplicated against ids already present.
* @param serverName - the validated MCP namespace.
* @param taken - row ids already used in the tree or the patch file.
* @returns an unused, stable row id.
*/
function deriveRowId(serverName, taken) {
	const base = `mcp-${serverName}`;
	if (!taken.has(base)) return base;
	for (let n = 2; n < 1e3; n += 1) {
		const candidate = `${base}-${n}`;
		if (!taken.has(candidate)) return candidate;
	}
	throw new Error(`mcp-manager: cannot derive a free row id for "${serverName}"`);
}
//#endregion
//#region lib/types/inventory.js
/**
* Read-only projection of MCP loader entries into panel rows. The Loader
* remains the sole lifecycle authority: every list() call re-reads the live
* entry tree and the tool registry — no cache, no mirror state.
*
* One piece of derived state is NOT readable from the loader: whether a
* server that reports zero tools is still connecting or will never connect.
* mcp-client defaults `failOnStartupError` to false, so a server whose
* endpoint is dead keeps an ACTIVE fiber with zero tools indefinitely, and its
* connection errors only reach ctx.logger (the ConnectionHandle is a local in
* mcp-client's apply and is never published on a context). This module
* therefore tracks how long each entry has been active-but-toolless and
* reports `unreachable` past a dwell threshold.
*/
/**
* How long an active fiber may report zero tools before the row is called
* `unreachable`. mcp-client's own first reconnect delay is 500ms doubling to a
* 30s ceiling, so a server that is merely slow normally publishes tools well
* inside this window; one that is dead never will.
*/
const UNREACHABLE_DWELL_MS = 2e4;
/** Runtime mirror of cordis's cross-package const-enum FiberState (numeric at runtime). */
const FIBER_PHASE = {
	0: "pending",
	1: "loading",
	2: "active",
	3: "failed",
	4: null,
	5: "unloading"
};
/** Create a dwell tracker over a clock (injectable for tests). */
function createDwellTracker(now = Date.now) {
	const since = /* @__PURE__ */ new Map();
	return {
		observe(entryId, toolless) {
			if (!toolless) {
				since.delete(entryId);
				return;
			}
			const existing = since.get(entryId);
			if (existing !== void 0) return existing;
			const started = now();
			since.set(entryId, started);
			return started;
		},
		forget(entryId) {
			since.delete(entryId);
		}
	};
}
/** A loader-resolved entry id (`include:mcp-x`); the patch-layer row id is its last segment. */
function rowIdOf(entryId) {
	return entryId.split(":").at(-1) ?? entryId;
}
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
/** Whether one loader entry is a manageable mcp-client row. */
function isMcpEntry(entry) {
	return entry.options.name === MCP_CLIENT_PACKAGE;
}
/** Public tool name prefix owned by one server namespace. */
function toolPrefix(serverName) {
	return `mcp__${serverName}__`;
}
/** Project one mcp-client entry into a panel row. */
function projectEntry(ctx, entry, projection = {}) {
	const { persisted = /* @__PURE__ */ new Set(), patchOwned = /* @__PURE__ */ new Set(), dwell, probes, now = Date.now } = projection;
	const raw = isRecord(entry.options.config) ? entry.options.config : {};
	const serverName = typeof raw.serverName === "string" ? raw.serverName : "";
	const transport = raw.transport === "streamable-http" ? "streamable-http" : "stdio";
	let endpoint;
	if (transport === "streamable-http") endpoint = typeof raw.url === "string" ? raw.url : "";
	else {
		const args = Array.isArray(raw.args) ? raw.args.filter((a) => typeof a === "string").join(" ") : "";
		const command = typeof raw.command === "string" ? raw.command : "";
		endpoint = args === "" ? command : `${command} ${args}`;
	}
	const prefix = toolPrefix(serverName);
	const tools = serverName === "" ? [] : ctx.tools.schemas().map((s) => s.name).filter((name) => name.startsWith(prefix)).sort();
	const fiberPhase = entry.fiber === void 0 ? null : FIBER_PHASE[entry.fiber.state] ?? null;
	const disabled = entry.disabled;
	const rowId = rowIdOf(entry.id);
	const toolless = !disabled && fiberPhase === "active" && tools.length === 0;
	const stretchStart = dwell?.observe(entry.id, toolless);
	const stalledFor = toolless && stretchStart !== void 0 ? now() - stretchStart : 0;
	let state;
	if (disabled) state = "disabled";
	else if (fiberPhase === "failed") state = "failed";
	else if (fiberPhase === "active" && tools.length > 0) state = "connected";
	else if (toolless && stalledFor >= 2e4) state = "unreachable";
	else state = "connecting";
	const detail = state === "unreachable" ? probes?.get(entry.id) : void 0;
	return {
		entryId: entry.id,
		rowId,
		serverName,
		transport,
		endpoint,
		disabled,
		persistedDisabled: persisted.has(rowId),
		fiberPhase,
		state,
		origin: patchOwned.has(rowId) ? "patch" : "foreign",
		stableId: isStableRowId(rowId),
		toolCount: tools.length,
		tools,
		...detail === void 0 ? {} : { detail }
	};
}
/** Project every mcp-client entry in the loader tree, in loader order. */
function projectRows(ctx, projection = {}) {
	const rows = [];
	for (const entry of ctx.loader.entries()) {
		if (!isMcpEntry(entry)) continue;
		rows.push(projectEntry(ctx, entry, projection));
	}
	return rows;
}
//#endregion
//#region lib/types/patch-writer.js
/**
* Persistence writer for the profile's own patch layer
* (`<profile>/cordis.patch.yml`). That file is hot-reloaded by
* watchUserPatches, so a successful write is applied transactionally by the
* Loader itself — this plugin never restarts fibers on the persist path.
*
* Editing goes through yaml's Document AST (`parseDocument` → mutate →
* `toString()`), the same technique DSH's own settings-file service uses, so
* user comments, key order, and formatting survive every write. The previous
* regex/text approach could only append flat two-line blocks at EOF; it could
* neither add a row with nested `env:`/`headers:` maps nor remove a row from
* the nested `insert:` sequence real profiles use.
*
* Patch-layer semantics this writer relies on
* (see `@deepseek-ai/cordis-plugin-include`):
* - a top-level `- insert: [...]` patch appends rows to the entry list;
* - a top-level `- id: <row>` patch overrides fields of an existing row,
*   including rows a previous `insert` contributed;
* - there is NO delete patch — hence removal means deleting the row from the
*   `insert` sequence this writer owns, and rows from other layers can only
*   ever be disabled.
*/
/** Comment placed above the insert block this writer creates. */
const MANAGED_COMMENT = " MCP servers managed by dsh-mcp-skill-control.\n Rows added from the panel land here; edit freely — comments are preserved.";
/**
* Derive the profile's patch-file path from the root include entry:
* `<profile>/cordis.yml` (the include config path) → sibling `cordis.patch.yml`.
* @param loader - the live Loader service.
* @returns absolute path of the profile patch file.
*/
function profilePatchPath(loader) {
	const config = loader.resolve("include").options.config;
	const configPath = typeof config === "object" && config !== null ? config.path : void 0;
	if (typeof configPath !== "string" || !configPath.startsWith("file://")) throw new Error("mcp-manager: cannot derive the profile patch path from the root include entry");
	return join(dirname(fileURLToPath(configPath)), "cordis.patch.yml");
}
/**
* Parse the patch file into a Document whose root is a sequence.
* A missing file, or the bare `[]` template, yields an empty sequence
* Document so the caller can write into it uniformly.
*/
function readDocument(patchPath) {
	let text;
	try {
		text = readFileSync(patchPath, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") text = "";
		else throw error;
	}
	if (text.trim() === "") return new Document([]);
	const doc = parseDocument(text, { prettyErrors: true });
	if (doc.errors.length > 0) throw new Error(`mcp-manager: ${patchPath} is not valid YAML: ${doc.errors[0]?.message ?? "parse error"}`);
	if (!isSeq(doc.contents)) {
		const carried = doc.contents?.commentBefore;
		const empty = doc.createNode([]);
		if (carried != null) empty.commentBefore = carried;
		doc.contents = empty;
	} else doc.contents.flow = false;
	return doc;
}
/**
* Write a Document back, keeping YAML formatting stable and diff-friendly.
* `flowCollectionPadding: false` matters: without it every pre-existing flow
* sequence (`args: ['-y', 'pkg']`) is re-emitted as `[ '-y', 'pkg' ]`, so an
* unrelated row would show up in the user's diff on every write.
*/
function writeDocument(patchPath, doc) {
	writeFileSync(patchPath, doc.toString({
		lineWidth: 0,
		singleQuote: true,
		flowCollectionPadding: false
	}), "utf8");
}
/** The root patch sequence of a parsed document. */
function rootSeq(doc) {
	if (!isSeq(doc.contents)) throw new Error("mcp-manager: patch file root is not a sequence");
	return doc.contents;
}
/** Read a plain string field from a YAML map. */
function stringAt$1(node, key) {
	const value = node.get(key, false);
	return typeof value === "string" ? value : void 0;
}
/** Every `- insert:` patch item's insert sequence, in file order. */
function insertSeqs(doc) {
	const out = [];
	for (const item of rootSeq(doc).items) {
		if (!isMap(item)) continue;
		const insert = item.get("insert", false);
		if (isSeq(insert)) out.push(insert);
	}
	return out;
}
/** Whether a YAML map node is an mcp-client row. */
function isMcpRowNode(node) {
	return isMap(node) && stringAt$1(node, "name") === "@deepseek-ai/dsh-mcp-client";
}
/**
* List row ids of mcp-client rows this patch layer contributes via `insert`.
* These are exactly the rows that `removeServer` can delete.
* @param patchPath - absolute profile patch-file path.
* @returns row ids owned by the patch layer.
*/
function listPatchOwnedRows(patchPath) {
	const ids = /* @__PURE__ */ new Set();
	let doc;
	try {
		doc = readDocument(patchPath);
	} catch {
		return ids;
	}
	for (const seq of insertSeqs(doc)) for (const row of seq.items) {
		if (!isMcpRowNode(row)) continue;
		const id = stringAt$1(row, "id");
		if (id !== void 0) ids.add(id);
	}
	return ids;
}
/**
* List row ids carrying a `disabled: true` override in a top-level patch item.
* A missing or unparsable file yields an empty set.
* @param patchPath - absolute profile patch-file path.
* @returns row ids persisted as disabled.
*/
function listPersistedDisabled(patchPath) {
	const ids = /* @__PURE__ */ new Set();
	let doc;
	try {
		doc = readDocument(patchPath);
	} catch {
		return ids;
	}
	for (const item of rootSeq(doc).items) {
		if (!isMap(item)) continue;
		const id = stringAt$1(item, "id");
		if (id !== void 0 && item.get("disabled", false) === true) ids.add(id);
	}
	for (const seq of insertSeqs(doc)) for (const row of seq.items) {
		if (!isMap(row)) continue;
		const id = stringAt$1(row, "id");
		if (id !== void 0 && row.get("disabled", false) === true) ids.add(id);
	}
	return ids;
}
/** Locate a top-level override item for rowId (`- id: rowId` without insert). */
function findOverrideItem(doc, rowId) {
	for (const item of rootSeq(doc).items) {
		if (!isMap(item)) continue;
		if (item.has("insert")) continue;
		if (stringAt$1(item, "id") === rowId) return item;
	}
}
/** Locate an inserted mcp row node plus its owning sequence. */
function findInsertedRow(doc, rowId) {
	for (const seq of insertSeqs(doc)) {
		const index = seq.items.findIndex((row) => isMcpRowNode(row) && stringAt$1(row, "id") === rowId);
		if (index >= 0) return {
			seq,
			row: seq.items[index],
			index
		};
	}
}
/**
* Persist `disabled: true` for rowId. Idempotent.
*
* A row this layer inserted is disabled in place (one node, no duplicate id);
* any other row gets a top-level override item, which the include applies
* over whichever layer defined it.
* @param patchPath - absolute profile patch-file path.
* @param rowId - patch-layer row id to disable at boot.
* @returns true when the file changed.
*/
function appendDisable(patchPath, rowId) {
	const doc = readDocument(patchPath);
	const inserted = findInsertedRow(doc, rowId);
	if (inserted !== void 0) {
		if (inserted.row.get("disabled", false) === true) return false;
		inserted.row.set("disabled", true);
		writeDocument(patchPath, doc);
		return true;
	}
	const existing = findOverrideItem(doc, rowId);
	if (existing !== void 0) {
		if (existing.get("disabled", false) === true) return false;
		existing.set("disabled", true);
		writeDocument(patchPath, doc);
		return true;
	}
	rootSeq(doc).add(doc.createNode({
		id: rowId,
		disabled: true
	}));
	writeDocument(patchPath, doc);
	return true;
}
/**
* Remove the persisted disabled override for rowId.
*
* An override item this writer owns (`{id, disabled}` and nothing else) is
* dropped entirely; a richer user-authored item keeps its other keys and only
* loses `disabled`. An inserted row loses its `disabled` key in place.
* @param patchPath - absolute profile patch-file path.
* @param rowId - patch-layer row id to re-enable at boot.
* @returns true when the file changed.
*/
function removeDisable(patchPath, rowId) {
	const doc = readDocument(patchPath);
	let changed = false;
	const inserted = findInsertedRow(doc, rowId);
	if (inserted !== void 0 && inserted.row.has("disabled")) {
		inserted.row.delete("disabled");
		changed = true;
	}
	const override = findOverrideItem(doc, rowId);
	if (override !== void 0 && override.has("disabled")) {
		const keys = override.items.map((pair) => typeof pair.key === "object" && pair.key !== null ? pair.key.value : pair.key).filter((key) => typeof key === "string");
		if (keys.length === 2 && keys.includes("id") && keys.includes("disabled")) {
			const seq = rootSeq(doc);
			seq.items.splice(seq.items.indexOf(override), 1);
		} else override.delete("disabled");
		changed = true;
	}
	if (changed) writeDocument(patchPath, doc);
	return changed;
}
/** Build the `config:` mapping for one server spec, omitting defaults. */
function configOf(spec) {
	const config = {
		serverName: spec.serverName,
		transport: spec.transport
	};
	if (spec.transport === "stdio") {
		config.command = spec.command;
		if (spec.args !== void 0 && spec.args.length > 0) config.args = spec.args;
		if (spec.env !== void 0 && Object.keys(spec.env).length > 0) config.env = spec.env;
		if (spec.cwd !== void 0 && spec.cwd !== "") config.cwd = spec.cwd;
	} else {
		config.url = spec.url;
		if (spec.headers !== void 0 && Object.keys(spec.headers).length > 0) config.headers = spec.headers;
	}
	if (spec.toolCallTimeoutMs !== void 0) config.toolCallTimeoutMs = spec.toolCallTimeoutMs;
	if (spec.failOnStartupError === true) config.failOnStartupError = true;
	if (spec.reconnect !== void 0 && Object.keys(spec.reconnect).length > 0) config.reconnect = spec.reconnect;
	return config;
}
/**
* Append one mcp-client row to the patch layer's insert block.
*
* The row is added to the LAST existing `insert:` sequence that already holds
* mcp rows (so panel-added servers stay grouped with the user's own), or a new
* commented insert item is created when none exists.
* @param patchPath - absolute profile patch-file path.
* @param rowId - stable patch-layer row id (must not already exist).
* @param spec - the server definition to write.
*/
function addServer(patchPath, rowId, spec) {
	const doc = readDocument(patchPath);
	if (findInsertedRow(doc, rowId) !== void 0) throw new Error(`row id "${rowId}" already exists in ${patchPath}`);
	const row = doc.createNode({
		id: rowId,
		name: MCP_CLIENT_PACKAGE,
		config: configOf(spec)
	});
	const target = insertSeqs(doc).filter((seq) => seq.items.some(isMcpRowNode)).at(-1);
	if (target !== void 0) target.add(row);
	else {
		const item = doc.createNode({ insert: [row] });
		item.commentBefore = MANAGED_COMMENT;
		rootSeq(doc).add(item);
	}
	writeDocument(patchPath, doc);
}
/**
* Delete one mcp-client row from the patch layer's insert block, plus any
* top-level override item that targeted it (a leftover override would emit a
* "patch: entry not found" warning on the next boot).
*
* Only rows this layer inserted can be deleted — the patch grammar has no
* delete operation for rows contributed by other layers.
* @param patchPath - absolute profile patch-file path.
* @param rowId - patch-layer row id to delete.
* @returns true when the file changed.
*/
function removeServer(patchPath, rowId) {
	const doc = readDocument(patchPath);
	const found = findInsertedRow(doc, rowId);
	if (found === void 0) return false;
	found.seq.items.splice(found.index, 1);
	const seqs = insertSeqs(doc);
	for (const seq of seqs) {
		if (seq.items.length > 0) continue;
		const root = rootSeq(doc);
		const owner = root.items.findIndex((item) => isMap(item) && item.get("insert", false) === seq);
		if (owner >= 0) root.items.splice(owner, 1);
	}
	const override = findOverrideItem(doc, rowId);
	if (override !== void 0) {
		const root = rootSeq(doc);
		root.items.splice(root.items.indexOf(override), 1);
	}
	writeDocument(patchPath, doc);
	return true;
}
//#endregion
//#region lib/types/skill-io.js
/**
* Skill enable/disable persistence over the USER skill roots that
* `@deepseek-ai/dsh-skill-filesystem` discovers (its `roots()` contract):
*
* | rank | source      | path                                  |
* |------|-------------|---------------------------------------|
* | 400  | user-dsh    | `$DSH_HOME/skills` (default ~/.dsh)   |
* | 500  | user-agents | `$DSH_AGENTS_HOME` (default ~/.agents)|
*
* Project roots are deliberately NOT managed: they resolve against the
* session's cwd and drift per conversation. The panel only flips the model
* surface, which the provider reads from frontmatter:
*
* - disable  → `disable-model-invocation: true` is written into frontmatter
* - enable   → that key is removed (both invocation surfaces default to on)
*
* Both discovery shapes are honoured (`<name>/SKILL.md` and flat `<name>.md`),
* one level deep, exactly like the provider. Symlinked roots are realpath'd
* and merged, so a machine where ~/.dsh/skills and ~/.agents/skills point at
* one physical directory lists each skill once and edits one file.
*
* Writes are surgical: only the frontmatter block is re-serialized (through
* yaml's Document AST, preserving comments/key order); the Markdown body is
* spliced back byte-for-byte.
*/
/** frontmatter key the skill provider interprets as "hide from the model". */
const DISABLE_KEY = "disable-model-invocation";
/** A failure carrying a machine-readable reason for the envelope. */
var SkillIoError = class extends Error {
	reason;
	constructor(reason, message) {
		super(message);
		this.reason = reason;
		this.name = "SkillIoError";
	}
};
/**
* Resolve the managed user roots: logical paths from the environment (mirrors
* skill-filesystem's own resolution), realpath'd, missing ones skipped, and
* logical roots landing on the same physical directory merged.
* @param env - environment override (defaults to process.env).
* @returns physical roots in rank order (user-dsh before user-agents).
*/
function resolveSkillRoots(env = process.env) {
	const logical = [{
		source: "user-dsh",
		dir: join(env.DSH_HOME?.trim() || join(homedir(), ".dsh"), "skills")
	}, {
		source: "user-agents",
		dir: join(join(env.DSH_AGENTS_HOME?.trim() || join(homedir(), ".agents"), "skills"))
	}];
	const merged = /* @__PURE__ */ new Map();
	for (const { source, dir } of logical) {
		if (!existsSync(dir)) continue;
		let physical;
		try {
			physical = realpathSync(dir);
		} catch {
			continue;
		}
		if (!isDirectory(physical)) continue;
		const sources = merged.get(physical);
		if (sources === void 0) merged.set(physical, [source]);
		else if (!sources.includes(source)) sources.push(source);
	}
	return [...merged].map(([path, sources]) => ({
		path,
		sources: [...sources]
	}));
}
/** Whether a path exists and is a directory (symlinks followed). */
function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
/** Read a plain string field from a frontmatter map. */
function stringAt(node, key) {
	const value = node.get(key, false);
	return typeof value === "string" ? value : void 0;
}
/**
* Split a skill file into its frontmatter YAML text and body.
* Only a leading `---` opener with a matching closer counts; anything else is
* a body-only file (which the provider would reject, so callers treat it as
* invalid rather than inventing frontmatter).
* @returns line indexes of the fence pair plus the two slices, or undefined.
*/
function splitFrontmatter(text) {
	if (!/^---[^\S\r\n]*\r?\n/.test(text)) return void 0;
	const rest = text.slice(text.match(/^---[^\S\r\n]*\r?\n/)[0].length);
	const close = rest.search(/^---[^\S\r\n]*\r?\n?$/m);
	if (close < 0) return void 0;
	const fmText = rest.slice(0, close);
	const closer = rest.slice(close).match(/^---[^\S\r\n]*\r?\n?/);
	return {
		fmText,
		body: closer === null ? "" : rest.slice(close + closer[0].length)
	};
}
/** Parse frontmatter text into a YAML document whose root is a map. */
function parseFrontmatter(fmText, path) {
	const doc = parseDocument(fmText, { prettyErrors: true });
	if (doc.errors.length > 0) throw new SkillIoError("bad-frontmatter", `${path}: invalid frontmatter YAML: ${doc.errors[0]?.message ?? "parse error"}`);
	if (!isMap(doc.contents)) throw new SkillIoError("bad-frontmatter", `${path}: frontmatter is not a YAML mapping`);
	return doc;
}
/**
* Discover every managed skill across the physical roots.
*
* Mirrors the provider's discovery contract: one level deep, directory
* `<name>/SKILL.md` bundles and flat `<name>.md` files, dot-entries skipped,
* and entries without a valid frontmatter `name`+`description` dropped (the
* provider drops them from the catalog the same way).
* @param env - environment override forwarded to root resolution.
* @returns discovered rows sorted by name.
*/
function listSkills(env = process.env) {
	const rows = [];
	for (const root of resolveSkillRoots(env)) {
		let entries;
		try {
			entries = readdirSync(root.path, { withFileTypes: true }).filter((dirent) => !dirent.name.startsWith(".")).map((dirent) => dirent.name);
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(root.path, entry);
			let skillPath;
			let flat = false;
			if (isDirectory(full)) {
				const candidate = join(full, "SKILL.md");
				if (isFile(candidate)) skillPath = candidate;
			} else if (entry.endsWith(".md")) {
				skillPath = full;
				flat = true;
			}
			if (skillPath === void 0) continue;
			const file = readSkillFile(skillPath, root.sources, entry, flat);
			if (file !== void 0) rows.push(file.row);
		}
	}
	rows.sort((a, b) => a.name.localeCompare(b.name));
	return rows;
}
/** Whether a path exists and is a regular file (symlinks followed). */
function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}
/**
* Read and parse one skill file into a row; invalid entries yield undefined
* (matching the provider's drop-with-warning discovery behaviour).
*/
function readSkillFile(path, sources, dirName, flat) {
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return;
	}
	let parsed;
	let doc;
	try {
		parsed = splitFrontmatter(text);
		if (parsed === void 0) return void 0;
		doc = parseFrontmatter(parsed.fmText, path);
	} catch (error) {
		if (error instanceof SkillIoError) return void 0;
		throw error;
	}
	const fm = doc.contents;
	const name = stringAt(fm, "name");
	const description = stringAt(fm, "description");
	if (name === void 0 || description === void 0) return void 0;
	return {
		row: {
			name,
			description,
			sources: [...sources],
			dirName,
			path,
			flat,
			modelDisabled: fm.get(DISABLE_KEY, false) === true
		},
		doc,
		fm,
		body: parsed.body
	};
}
/**
* Flip one skill's model-invocation switch by editing its frontmatter.
*
* The write is surgical: the frontmatter block is re-serialized through the
* yaml AST (comments and key order preserved) while the Markdown body is
* spliced back byte-for-byte. Setting `disabled: false` removes the key
* entirely — the provider's default for an absent key is "enabled".
* @param path - absolute skill-file path as previously returned by listSkills.
* @param disabled - true writes `disable-model-invocation: true`; false removes the key.
* @returns true when the file changed.
*/
function setModelDisabled(path, disabled) {
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		throw new SkillIoError("skill-not-found", `cannot read ${path}: ${error.message}`);
	}
	const parsed = splitFrontmatter(text);
	if (parsed === void 0) throw new SkillIoError("bad-frontmatter", `${path} has no frontmatter block to edit`);
	const doc = parseFrontmatter(parsed.fmText, path);
	const fm = doc.contents;
	if (stringAt(fm, "name") === void 0) throw new SkillIoError("bad-frontmatter", `${path} has no frontmatter name — not a managed skill`);
	const current = fm.get(DISABLE_KEY, false);
	if (disabled) {
		if (current === true) return false;
		fm.set(DISABLE_KEY, true);
	} else {
		if (current !== true && !fm.has(DISABLE_KEY)) return false;
		if (!fm.has(DISABLE_KEY)) return false;
		fm.delete(DISABLE_KEY);
	}
	const fmOut = doc.toString({
		lineWidth: 0,
		singleQuote: true,
		flowCollectionPadding: false
	}).replace(/\n+$/, "\n");
	const eol = text.startsWith("---\r\n") ? "\r\n" : "\n";
	const next = `---${eol}${fmOut.replaceAll("\n", eol)}---${eol}${parsed.body}`;
	try {
		writeFileSync(path, next, "utf8");
	} catch (error) {
		throw new SkillIoError("io-error", `cannot write ${path}: ${error.message}`);
	}
	return true;
}
/**
* Resolve a caller-supplied path against the managed roots (guard for the
* RPC surface): the path must be a file a previous listing could have
* returned, i.e. realpath-equal to a discovered skill file.
* @param path - candidate path from the browser.
* @param env - environment override forwarded to root resolution.
* @returns the canonical discovered path.
*/
function resolveManagedSkillPath(path, env = process.env) {
	if (typeof path !== "string" || path === "") throw new SkillIoError("bad-request", "path must be a non-empty string");
	let canonical;
	try {
		canonical = realpathSync(path);
	} catch {
		throw new SkillIoError("skill-not-found", `skill file "${path}" does not exist`);
	}
	for (const row of listSkills(env)) if (row.path === canonical) return canonical;
	throw new SkillIoError("skill-not-found", `"${path}" is not a skill under a managed user root`);
}
//#endregion
//#region lib/types/service.js
/**
* MCP manager Host service: a TypertRemoteService whose @Remote methods are
* discovered dynamically by the API gateway's SRC fallback (no generated
* artifacts, no assembly wiring). A fallback plain-HTTP route on the
* webServer service mirrors the same operations for clients that cannot
* reach the /api RPC channel.
*
* Lifecycle semantics: every mutation goes through the profile's
* `cordis.patch.yml`, which the profile patch watcher applies transactionally
* (so the running process flips immediately AND the state survives restarts).
* A bare Entry-level update only reconciles drift between the patch layer and
* the live tree.
*
* | operation | patch-layer effect                      | reversible in UI |
* |-----------|------------------------------------------|------------------|
* | disable   | `disabled: true` on/for the row          | yes (enable)     |
* | enable    | that override removed                    | yes (disable)    |
* | restart   | none (runtime dispose + re-init)         | n/a              |
* | add       | row appended to the managed insert block | yes (remove)     |
* | remove    | row deleted from the insert block        | NO               |
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Timeout waiting for the HMR-applied patch write to flip entry.disabled (ms). */
const PERSIST_APPLY_TIMEOUT_MS = 3e3;
/** Timeout waiting for a disposed fiber to fully unload during restart (ms). */
const RESTART_DISPOSE_TIMEOUT_MS = 8e3;
/** Timeout waiting for a freshly added row to appear in the loader tree (ms). */
const ADD_APPLY_TIMEOUT_MS = 5e3;
/** Budget for one endpoint reachability probe (ms). */
const PROBE_TIMEOUT_MS = 4e3;
/** Minimum spacing between probes of the same entry (ms). */
const PROBE_INTERVAL_MS = 3e4;
/** Poll until pred() holds or the deadline passes. */
async function waitFor(pred, timeoutMs, what) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (pred()) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	if (!pred()) throw new Error(`mcp-manager: timed out waiting for ${what}`);
}
/** A failure carrying a machine-readable reason for the envelope. */
var ActionError = class extends Error {
	reason;
	constructor(reason, message) {
		super(message);
		this.reason = reason;
		this.name = "ActionError";
	}
};
/** MCP manager service. */
let McpManagerService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _list_decorators;
	let _add_decorators;
	let _remove_decorators;
	let _disable_decorators;
	let _enable_decorators;
	let _restart_decorators;
	let _skillList_decorators;
	let _skillSetDisabled_decorators;
	let _skillReveal_decorators;
	return class McpManagerService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_list_decorators = [Remote("list")];
			_add_decorators = [Remote("add")];
			_remove_decorators = [Remote("remove")];
			_disable_decorators = [Remote("disable")];
			_enable_decorators = [Remote("enable")];
			_restart_decorators = [Remote("restart")];
			_skillList_decorators = [Remote("skillList")];
			_skillSetDisabled_decorators = [Remote("skillSetDisabled")];
			_skillReveal_decorators = [Remote("skillReveal")];
			__esDecorate(this, null, _list_decorators, {
				kind: "method",
				name: "list",
				static: false,
				private: false,
				access: {
					has: (obj) => "list" in obj,
					get: (obj) => obj.list
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _add_decorators, {
				kind: "method",
				name: "add",
				static: false,
				private: false,
				access: {
					has: (obj) => "add" in obj,
					get: (obj) => obj.add
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _remove_decorators, {
				kind: "method",
				name: "remove",
				static: false,
				private: false,
				access: {
					has: (obj) => "remove" in obj,
					get: (obj) => obj.remove
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _disable_decorators, {
				kind: "method",
				name: "disable",
				static: false,
				private: false,
				access: {
					has: (obj) => "disable" in obj,
					get: (obj) => obj.disable
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _enable_decorators, {
				kind: "method",
				name: "enable",
				static: false,
				private: false,
				access: {
					has: (obj) => "enable" in obj,
					get: (obj) => obj.enable
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _restart_decorators, {
				kind: "method",
				name: "restart",
				static: false,
				private: false,
				access: {
					has: (obj) => "restart" in obj,
					get: (obj) => obj.restart
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _skillList_decorators, {
				kind: "method",
				name: "skillList",
				static: false,
				private: false,
				access: {
					has: (obj) => "skillList" in obj,
					get: (obj) => obj.skillList
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _skillSetDisabled_decorators, {
				kind: "method",
				name: "skillSetDisabled",
				static: false,
				private: false,
				access: {
					has: (obj) => "skillSetDisabled" in obj,
					get: (obj) => obj.skillSetDisabled
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _skillReveal_decorators, {
				kind: "method",
				name: "skillReveal",
				static: false,
				private: false,
				access: {
					has: (obj) => "skillReveal" in obj,
					get: (obj) => obj.skillReveal
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static inject = ["loader", "tools"];
		/** One in-flight lifecycle operation per entry id. */
		inFlight = (__runInitializers(this, _instanceExtraInitializers), /* @__PURE__ */ new Map());
		/** Tracks how long each row has been active-but-toolless. */
		dwell = createDwellTracker();
		/** Last probe diagnostic per entry id. */
		probes = /* @__PURE__ */ new Map();
		/** Last probe timestamp per entry id, to rate-limit outbound requests. */
		probedAt = /* @__PURE__ */ new Map();
		constructor(ctx) {
			super(ctx, "mcpManager");
			ctx.inject(["webServer"], (httpCtx) => {
				httpCtx.effect(() => httpCtx.webServer.register({
					kind: "prefix",
					path: "/mcp-manager/api",
					handler: (req, res) => this.handleHttp(req, res)
				}), "mcp-manager: fallback http route");
			});
		}
		/** List every mcp-client entry with its derived state. */
		list() {
			const patchPath = this.tryPatchPath();
			const rows = projectRows(this.ctx, {
				persisted: patchPath === void 0 ? /* @__PURE__ */ new Set() : this.safely(() => listPersistedDisabled(patchPath)),
				patchOwned: patchPath === void 0 ? /* @__PURE__ */ new Set() : this.safely(() => listPatchOwnedRows(patchPath)),
				dwell: this.dwell,
				probes: this.probes
			});
			for (const row of rows) if (row.state === "unreachable" && row.transport === "streamable-http") this.probe(row);
			return rows;
		}
		/**
		* Add one MCP server: validate, write the row into the profile patch layer,
		* and wait for the watcher to mount it.
		* @param spec - transport-discriminated server definition.
		*/
		async add(spec) {
			try {
				const patchPath = this.requirePatchPath();
				this.validateSpec(spec);
				const taken = /* @__PURE__ */ new Set([
					...[...this.ctx.loader.entries()].map((entry) => rowIdOf(entry.id)),
					...listPatchOwnedRows(patchPath),
					...listPersistedDisabled(patchPath)
				]);
				const requested = spec.rowId?.trim() ?? "";
				if (requested !== "") {
					if (!isStableRowId(requested)) throw new ActionError("bad-row-id", `row id "${requested}" must match [A-Za-z0-9_.-]+ and cannot look loader-generated`);
					if (taken.has(requested)) throw new ActionError("duplicate-row-id", `row id "${requested}" is already in use`);
				}
				const rowId = requested === "" ? deriveRowId(spec.serverName, taken) : requested;
				addServer(patchPath, rowId, spec);
				try {
					await waitFor(() => [...this.ctx.loader.entries()].some((entry) => isMcpEntry(entry) && rowIdOf(entry.id) === rowId), ADD_APPLY_TIMEOUT_MS, `row "${rowId}" to be mounted`);
				} catch (error) {
					throw new ActionError("add-not-applied", error instanceof Error ? error.message : String(error));
				}
				return {
					ok: true,
					rowId,
					serverName: spec.serverName
				};
			} catch (error) {
				return this.failure(error);
			}
		}
		/**
		* Remove one MCP server permanently by deleting its row from the patch
		* layer. Only rows this layer contributed can be removed.
		* @param entryId - loader entry id of the mcp-client row.
		*/
		async remove(entryId) {
			return this.guarded(entryId, async () => {
				const entry = this.resolveMcpEntry(entryId);
				const rowId = rowIdOf(entryId);
				const patchPath = this.requirePatchPath();
				if (!listPatchOwnedRows(patchPath).has(rowId)) throw new ActionError("not-removable", `row "${rowId}" is not defined in this profile's cordis.patch.yml — it comes from a bundle layer, which the patch grammar cannot delete. Disable it instead.`);
				if (!removeServer(patchPath, rowId)) throw new ActionError("not-removable", `row "${rowId}" was not found in ${patchPath}`);
				await waitFor(() => entry.fiber === void 0, PERSIST_APPLY_TIMEOUT_MS, `row "${rowId}" to be unmounted`);
				this.dwell.forget(entryId);
				this.probes.delete(entryId);
				this.probedAt.delete(entryId);
				return { ok: true };
			});
		}
		/**
		* Disable one MCP server, persisted: write the override into the profile
		* patch file; the patch watcher disposes the fiber (disconnect + tool
		* removal) and the state survives restarts.
		* @param entryId - loader entry id of the mcp-client row.
		*/
		async disable(entryId) {
			return this.guarded(entryId, () => this.transition(entryId, true));
		}
		/**
		* Enable one MCP server, persisted: remove the override from the profile
		* patch file; the patch watcher re-runs mcp-client connect + tool discovery.
		* @param entryId - loader entry id of the mcp-client row.
		*/
		async enable(entryId) {
			return this.guarded(entryId, () => this.transition(entryId, false));
		}
		/**
		* Restart one MCP server (runtime-only action): dispose, wait for full
		* fiber teardown, re-init. Persisted overrides are untouched.
		* @param entryId - loader entry id of the mcp-client row.
		*/
		async restart(entryId) {
			return this.guarded(entryId, async () => {
				const entry = this.resolveMcpEntry(entryId);
				if (entry.disabled) throw new ActionError("disabled", `entry "${entryId}" is disabled — enable it first`);
				await entry.update({ disabled: true });
				await waitFor(() => entry.fiber === void 0, RESTART_DISPOSE_TIMEOUT_MS, `fiber teardown of "${entryId}"`);
				await entry.update({ disabled: false });
				this.dwell.forget(entryId);
				this.probes.delete(entryId);
				this.probedAt.delete(entryId);
				return { ok: true };
			});
		}
		/**
		* List every skill under the managed user roots (see skill-io.ts for the
		* root-resolution contract). Pure read; invalid entries are skipped the
		* same way the skill provider's discovery drops them.
		*/
		skillList() {
			return listSkills();
		}
		/**
		* Flip one skill's model-invocation switch by editing its frontmatter
		* `disable-model-invocation` key. The filesystem watcher applies the new
		* catalog asynchronously, so no wait is performed here.
		* @param path - skill-file path as returned by skillList.
		* @param disabled - true hides the skill from the model catalog.
		*/
		async skillSetDisabled(path, disabled) {
			return this.guarded(`skill:${path}`, async () => {
				return setModelDisabled(resolveManagedSkillPath(path), disabled) ? { ok: true } : {
					ok: true,
					unchanged: true
				};
			});
		}
		/**
		* Reveal a managed skill (or its root) in the host platform's file manager.
		* Opens the containing skills ROOT directory — the directory the panel
		* manages — which is where a user goes to add or edit skills.
		* @param path - optional skill-file path; omitted opens the first root.
		*/
		async skillReveal(path) {
			try {
				let dir;
				if (path !== void 0 && path !== "") dir = dirname(resolveManagedSkillPath(path));
				else {
					const roots = resolveSkillRoots();
					if (roots.length === 0) throw new ActionError("skill-not-found", "no managed skill roots exist");
					dir = roots[0].path;
				}
				const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
				spawn(command, [dir], {
					stdio: "ignore",
					detached: true
				}).unref();
				return { ok: true };
			} catch (error) {
				return this.failure(error);
			}
		}
		/** Validate a create-spec against mcp-client's own contract before writing. */
		validateSpec(spec) {
			if (!isValidServerName(spec.serverName)) throw new ActionError("bad-server-name", `serverName "${spec.serverName}" must match [A-Za-z0-9_-]{1,32}`);
			for (const row of this.list()) if (row.serverName === spec.serverName) throw new ActionError("duplicate-server-name", `serverName "${spec.serverName}" is already used by row "${row.rowId}"`);
			if (spec.transport === "stdio") {
				if (spec.command.trim() === "") throw new ActionError("bad-command", "command must not be empty");
			} else {
				let url;
				try {
					url = new URL(spec.url);
				} catch {
					throw new ActionError("bad-url", `url "${spec.url}" is not a valid absolute URL`);
				}
				if (url.protocol !== "http:" && url.protocol !== "https:") throw new ActionError("bad-url", `url protocol "${url.protocol}" must be http or https`);
			}
			if (spec.toolCallTimeoutMs !== void 0 && !(spec.toolCallTimeoutMs > 0)) throw new ActionError("bad-timeout", "toolCallTimeoutMs must be a positive number");
		}
		/**
		* Probe a streamable-http endpoint to turn "no tools" into an actionable
		* diagnostic. Rate-limited per entry; a probe never changes lifecycle state.
		*
		* ⚠️ Security note: the probe replays the row's configured headers (which
		* carry its bearer/api-key) to the row's own configured URL only — the same
		* destination mcp-client already talks to, so no new credential exposure.
		*/
		async probe(row) {
			const last = this.probedAt.get(row.entryId) ?? 0;
			if (Date.now() - last < PROBE_INTERVAL_MS) return;
			this.probedAt.set(row.entryId, Date.now());
			const config = this.ctx.loader.resolve(row.entryId).options.config;
			const url = typeof config?.url === "string" ? config.url : row.endpoint;
			const headers = {};
			if (typeof config?.headers === "object" && config.headers !== null) {
				for (const [key, value] of Object.entries(config.headers)) if (typeof value === "string") headers[key] = value;
			}
			const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
			try {
				const response = await fetch(url, {
					method: "POST",
					signal,
					headers: {
						...headers,
						"content-type": "application/json",
						accept: "application/json, text/event-stream"
					},
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 0,
						method: "initialize",
						params: {
							protocolVersion: "2024-11-05",
							capabilities: {},
							clientInfo: {
								name: "dsh-mcp-skill-control-probe",
								version: "0"
							}
						}
					})
				});
				this.probes.set(row.entryId, response.ok ? `endpoint answered HTTP ${response.status} but no tools were registered — the server may speak legacy SSE rather than Streamable HTTP, or its initialize handshake failed` : `endpoint answered HTTP ${response.status} ${response.statusText}`);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				this.probes.set(row.entryId, `endpoint unreachable: ${reason}`);
			}
		}
		/** Serialize lifecycle operations per entry and normalize failures. */
		async guarded(entryId, op) {
			if (this.inFlight.has(entryId)) return {
				ok: false,
				reason: "transition-in-flight",
				message: `entry "${entryId}" already has an operation in flight`
			};
			const running = op().catch((error) => this.failure(error)).finally(() => {
				this.inFlight.delete(entryId);
			});
			this.inFlight.set(entryId, running);
			return running;
		}
		/** Normalize any thrown value into a failed result. */
		failure(error) {
			if (error instanceof ActionError) return {
				ok: false,
				reason: error.reason,
				message: error.message
			};
			if (error instanceof SkillIoError) return {
				ok: false,
				reason: error.reason,
				message: error.message
			};
			return {
				ok: false,
				reason: "operation-failed",
				message: error instanceof Error ? error.message : String(error)
			};
		}
		/** Run a patch-file read, treating any failure as "no data". */
		safely(read) {
			try {
				return read();
			} catch {
				return /* @__PURE__ */ new Set();
			}
		}
		/** The profile patch path, or undefined when it cannot be derived. */
		tryPatchPath() {
			try {
				return profilePatchPath(this.ctx.loader);
			} catch {
				return;
			}
		}
		/** The profile patch path, or a typed failure when it cannot be derived. */
		requirePatchPath() {
			const path = this.tryPatchPath();
			if (path === void 0) throw new ActionError("no-patch-file", "cannot derive this profile's cordis.patch.yml from the root include entry");
			return path;
		}
		/** Resolve an entry id to its Entry, validating it targets an mcp-client row. */
		resolveMcpEntry(entryId) {
			let entry;
			try {
				entry = this.ctx.loader.resolve(entryId);
			} catch {
				throw new ActionError("entry-missing", `entry "${entryId}" does not exist in the loader tree`);
			}
			if (!isMcpEntry(entry)) throw new ActionError("not-mcp-entry", `entry "${entryId}" is not an @deepseek-ai/dsh-mcp-client row`);
			return entry;
		}
		/**
		* Persisted enable/disable transition: bring the patch file to the desired
		* state (the watcher flips the live entry), then reconcile any remaining
		* runtime drift (e.g. a bare patch edit while the plugin was absent).
		*/
		async transition(entryId, disabled) {
			const entry = this.resolveMcpEntry(entryId);
			const rowId = rowIdOf(entryId);
			if (!isStableRowId(rowId)) throw new ActionError("unstable-id", `row id "${rowId}" is loader-generated and changes every boot — give the row a stable id in cordis.patch.yml first`);
			const patchPath = this.requirePatchPath();
			const persisted = listPersistedDisabled(patchPath).has(rowId);
			let changed = false;
			if (disabled && !persisted) {
				appendDisable(patchPath, rowId);
				await waitFor(() => entry.disabled, PERSIST_APPLY_TIMEOUT_MS, `patch override of "${rowId}" to be applied`);
				changed = true;
			} else if (!disabled && persisted) {
				removeDisable(patchPath, rowId);
				await waitFor(() => !entry.disabled, PERSIST_APPLY_TIMEOUT_MS, `patch override of "${rowId}" to be removed`);
				changed = true;
			}
			if (entry.disabled !== disabled) {
				await entry.update({ disabled });
				changed = true;
			}
			if (disabled) {
				this.dwell.forget(entryId);
				this.probes.delete(entryId);
			}
			return changed ? { ok: true } : {
				ok: true,
				unchanged: true
			};
		}
		/** Fallback plain-HTTP handler mirroring the Remote methods. */
		async handleHttp(req, res) {
			const reply = (status, body) => {
				res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
				res.end(JSON.stringify(body));
			};
			try {
				const sub = new URL(req.url ?? "/", "http://x").pathname.slice(16);
				let args = {};
				if (req.method === "POST") {
					const text = await readRequestText(req);
					if (text !== "") {
						const parsed = JSON.parse(text);
						if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
							reply(400, {
								ok: false,
								error: {
									code: "bad-request",
									message: "body must be a JSON object"
								}
							});
							return;
						}
						args = parsed;
					}
				}
				if (sub === "/list") {
					reply(200, {
						ok: true,
						value: this.list()
					});
					return;
				}
				if (sub === "/skillList") {
					reply(200, {
						ok: true,
						value: this.skillList()
					});
					return;
				}
				if (sub === "/skillSetDisabled") {
					const path = typeof args.path === "string" ? args.path : "";
					if (path === "") {
						reply(400, {
							ok: false,
							error: {
								code: "bad-request",
								message: "path must be a non-empty string"
							}
						});
						return;
					}
					if (typeof args.disabled !== "boolean") {
						reply(400, {
							ok: false,
							error: {
								code: "bad-request",
								message: "disabled must be a boolean"
							}
						});
						return;
					}
					reply(200, envelope(await this.skillSetDisabled(path, args.disabled)));
					return;
				}
				if (sub === "/skillReveal") {
					const path = typeof args.path === "string" && args.path !== "" ? args.path : void 0;
					reply(200, envelope(await this.skillReveal(path)));
					return;
				}
				if (sub === "/add") {
					const spec = args.spec;
					if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
						reply(400, {
							ok: false,
							error: {
								code: "bad-request",
								message: "spec must be a JSON object"
							}
						});
						return;
					}
					reply(200, envelope(await this.add(spec)));
					return;
				}
				const op = {
					"/disable": (entryId) => this.disable(entryId),
					"/enable": (entryId) => this.enable(entryId),
					"/restart": (entryId) => this.restart(entryId),
					"/remove": (entryId) => this.remove(entryId)
				}[sub];
				if (op !== void 0) {
					const entryId = typeof args.entryId === "string" ? args.entryId : "";
					if (entryId === "") {
						reply(400, {
							ok: false,
							error: {
								code: "bad-request",
								message: "entryId must be a non-empty string"
							}
						});
						return;
					}
					reply(200, envelope(await op(entryId)));
					return;
				}
				reply(404, {
					ok: false,
					error: {
						code: "not-found",
						message: `unknown endpoint ${sub}`
					}
				});
			} catch (error) {
				reply(500, {
					ok: false,
					error: {
						code: "internal",
						message: error instanceof Error ? error.message : String(error)
					}
				});
			}
		}
	};
})();
/** Map an action/add result onto the shared envelope shape. */
function envelope(result) {
	if (result.ok) return {
		ok: true,
		value: result
	};
	const failed = result;
	return {
		ok: false,
		error: {
			code: failed.reason,
			message: failed.message
		}
	};
}
/** Read one request body fully (bounded). */
async function readRequestText(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buf = chunk;
		size += buf.length;
		if (size > 65536) throw new Error("request body too large");
		chunks.push(buf);
	}
	return Buffer.concat(chunks).toString("utf8");
}
//#endregion
//#region lib/types/index.js
var types_default = McpManagerService;
//#endregion
export { MCP_CLIENT_PACKAGE, McpManagerService, UNREACHABLE_DWELL_MS, addServer, appendDisable, createDwellTracker, types_default as default, deriveRowId, isMcpEntry, isStableRowId, isValidServerName, listPatchOwnedRows, listPersistedDisabled, profilePatchPath, projectEntry, projectRows, removeDisable, removeServer, rowIdOf, toolPrefix };
