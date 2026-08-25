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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { createDwellTracker, isMcpEntry, projectRows, rowIdOf } from './inventory.js';
import { addServer, appendDisable, listPatchOwnedRows, listPersistedDisabled, profilePatchPath, removeDisable, removeServer, } from './patch-writer.js';
import { deriveRowId, isStableRowId, isValidServerName } from './shared.js';
import { listSkills, resolveManagedSkillPath, resolveSkillRoots, setModelDisabled, SkillIoError } from './skill-io.js';
/** Timeout waiting for the HMR-applied patch write to flip entry.disabled (ms). */
const PERSIST_APPLY_TIMEOUT_MS = 3_000;
/** Timeout waiting for a disposed fiber to fully unload during restart (ms). */
const RESTART_DISPOSE_TIMEOUT_MS = 8_000;
/** Timeout waiting for a freshly added row to appear in the loader tree (ms). */
const ADD_APPLY_TIMEOUT_MS = 5_000;
/** Budget for one endpoint reachability probe (ms). */
const PROBE_TIMEOUT_MS = 4_000;
/** Minimum spacing between probes of the same entry (ms). */
const PROBE_INTERVAL_MS = 30_000;
/** Poll until pred() holds or the deadline passes. */
async function waitFor(pred, timeoutMs, what) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (pred())
            return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!pred())
        throw new Error(`mcp-manager: timed out waiting for ${what}`);
}
/** A failure carrying a machine-readable reason for the envelope. */
class ActionError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
        this.name = 'ActionError';
    }
}
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
            _list_decorators = [Remote('list')];
            _add_decorators = [Remote('add')];
            _remove_decorators = [Remote('remove')];
            _disable_decorators = [Remote('disable')];
            _enable_decorators = [Remote('enable')];
            _restart_decorators = [Remote('restart')];
            _skillList_decorators = [Remote('skillList')];
            _skillSetDisabled_decorators = [Remote('skillSetDisabled')];
            _skillReveal_decorators = [Remote('skillReveal')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _add_decorators, { kind: "method", name: "add", static: false, private: false, access: { has: obj => "add" in obj, get: obj => obj.add }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _remove_decorators, { kind: "method", name: "remove", static: false, private: false, access: { has: obj => "remove" in obj, get: obj => obj.remove }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _disable_decorators, { kind: "method", name: "disable", static: false, private: false, access: { has: obj => "disable" in obj, get: obj => obj.disable }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _enable_decorators, { kind: "method", name: "enable", static: false, private: false, access: { has: obj => "enable" in obj, get: obj => obj.enable }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _restart_decorators, { kind: "method", name: "restart", static: false, private: false, access: { has: obj => "restart" in obj, get: obj => obj.restart }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _skillList_decorators, { kind: "method", name: "skillList", static: false, private: false, access: { has: obj => "skillList" in obj, get: obj => obj.skillList }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _skillSetDisabled_decorators, { kind: "method", name: "skillSetDisabled", static: false, private: false, access: { has: obj => "skillSetDisabled" in obj, get: obj => obj.skillSetDisabled }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _skillReveal_decorators, { kind: "method", name: "skillReveal", static: false, private: false, access: { has: obj => "skillReveal" in obj, get: obj => obj.skillReveal }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['loader', 'tools'];
        /** One in-flight lifecycle operation per entry id. */
        inFlight = (__runInitializers(this, _instanceExtraInitializers), new Map());
        /** Tracks how long each row has been active-but-toolless. */
        dwell = createDwellTracker();
        /** Last probe diagnostic per entry id. */
        probes = new Map();
        /** Last probe timestamp per entry id, to rate-limit outbound requests. */
        probedAt = new Map();
        constructor(ctx) {
            super(ctx, 'mcpManager');
            // Fallback HTTP channel for clients off the typed RPC path.
            //
            // This MUST be a reactive injection, not a one-shot `ctx.get('webServer')`
            // in the constructor: this service activates as soon as its own `inject`
            // (loader, tools) is satisfied, which happens BEFORE the web server
            // service exists. A constructor-time lookup therefore saw `undefined` and
            // silently skipped registration for good — the route never existed even
            // though the plugin reported healthy. `ctx.inject` re-runs the callback
            // when the dependency appears and tears the route down if it goes away.
            ctx.inject(['webServer'], (httpCtx) => {
                httpCtx.effect(() => httpCtx.webServer.register({
                    kind: 'prefix',
                    path: '/mcp-manager/api',
                    handler: (req, res) => this.handleHttp(req, res),
                }), 'mcp-manager: fallback http route');
            });
        }
        /** List every mcp-client entry with its derived state. */
        list() {
            const patchPath = this.tryPatchPath();
            const rows = projectRows(this.ctx, {
                persisted: patchPath === undefined ? new Set() : this.safely(() => listPersistedDisabled(patchPath)),
                patchOwned: patchPath === undefined ? new Set() : this.safely(() => listPatchOwnedRows(patchPath)),
                dwell: this.dwell,
                probes: this.probes,
            });
            // Probe only rows we already believe are unreachable, so a healthy tree
            // never generates outbound traffic. Fire-and-forget: the diagnostic lands
            // in this.probes and surfaces on a later list().
            for (const row of rows) {
                if (row.state === 'unreachable' && row.transport === 'streamable-http')
                    void this.probe(row);
            }
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
                const taken = new Set([
                    ...[...this.ctx.loader.entries()].map(entry => rowIdOf(entry.id)),
                    ...listPatchOwnedRows(patchPath),
                    ...listPersistedDisabled(patchPath),
                ]);
                const requested = spec.rowId?.trim() ?? '';
                if (requested !== '') {
                    if (!isStableRowId(requested)) {
                        throw new ActionError('bad-row-id', `row id "${requested}" must match [A-Za-z0-9_.-]+ and cannot look loader-generated`);
                    }
                    if (taken.has(requested))
                        throw new ActionError('duplicate-row-id', `row id "${requested}" is already in use`);
                }
                const rowId = requested === '' ? deriveRowId(spec.serverName, taken) : requested;
                addServer(patchPath, rowId, spec);
                // The watcher remounts the include subtree; the new row shows up as a
                // fresh entry. Failing to appear means the patch did not apply.
                try {
                    await waitFor(() => [...this.ctx.loader.entries()].some(entry => isMcpEntry(entry) && rowIdOf(entry.id) === rowId), ADD_APPLY_TIMEOUT_MS, `row "${rowId}" to be mounted`);
                }
                catch (error) {
                    // Leave the written row in place: it is valid config that will mount on
                    // the next boot, and silently reverting a user's write is worse.
                    throw new ActionError('add-not-applied', error instanceof Error ? error.message : String(error));
                }
                return { ok: true, rowId, serverName: spec.serverName };
            }
            catch (error) {
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
                if (!listPatchOwnedRows(patchPath).has(rowId)) {
                    throw new ActionError('not-removable', `row "${rowId}" is not defined in this profile's cordis.patch.yml — it comes from a bundle layer, which the patch grammar cannot delete. Disable it instead.`);
                }
                if (!removeServer(patchPath, rowId)) {
                    throw new ActionError('not-removable', `row "${rowId}" was not found in ${patchPath}`);
                }
                await waitFor(() => entry.fiber === undefined, PERSIST_APPLY_TIMEOUT_MS, `row "${rowId}" to be unmounted`);
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
                if (entry.disabled) {
                    throw new ActionError('disabled', `entry "${entryId}" is disabled — enable it first`);
                }
                await entry.update({ disabled: true });
                await waitFor(() => entry.fiber === undefined, RESTART_DISPOSE_TIMEOUT_MS, `fiber teardown of "${entryId}"`);
                await entry.update({ disabled: false });
                // A restart is an explicit "try again", so the stall clock restarts too.
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
                const canonical = resolveManagedSkillPath(path);
                const changed = setModelDisabled(canonical, disabled);
                return changed ? { ok: true } : { ok: true, unchanged: true };
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
                if (path !== undefined && path !== '') {
                    // The skill's bundle directory (parent of SKILL.md / the flat file).
                    dir = dirname(resolveManagedSkillPath(path));
                }
                else {
                    const roots = resolveSkillRoots();
                    if (roots.length === 0)
                        throw new ActionError('skill-not-found', 'no managed skill roots exist');
                    dir = roots[0].path;
                }
                const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
                const child = spawn(command, [dir], { stdio: 'ignore', detached: true });
                child.unref();
                return { ok: true };
            }
            catch (error) {
                return this.failure(error);
            }
        }
        /** Validate a create-spec against mcp-client's own contract before writing. */
        validateSpec(spec) {
            if (!isValidServerName(spec.serverName)) {
                throw new ActionError('bad-server-name', `serverName "${spec.serverName}" must match [A-Za-z0-9_-]{1,32}`);
            }
            // mcp-client fails the instance on a duplicate namespace; catching it here
            // keeps the tree clean instead of writing config that cannot activate.
            for (const row of this.list()) {
                if (row.serverName === spec.serverName) {
                    throw new ActionError('duplicate-server-name', `serverName "${spec.serverName}" is already used by row "${row.rowId}"`);
                }
            }
            if (spec.transport === 'stdio') {
                if (spec.command.trim() === '')
                    throw new ActionError('bad-command', 'command must not be empty');
            }
            else {
                let url;
                try {
                    url = new URL(spec.url);
                }
                catch {
                    throw new ActionError('bad-url', `url "${spec.url}" is not a valid absolute URL`);
                }
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    throw new ActionError('bad-url', `url protocol "${url.protocol}" must be http or https`);
                }
            }
            if (spec.toolCallTimeoutMs !== undefined && !(spec.toolCallTimeoutMs > 0)) {
                throw new ActionError('bad-timeout', 'toolCallTimeoutMs must be a positive number');
            }
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
            if (Date.now() - last < PROBE_INTERVAL_MS)
                return;
            this.probedAt.set(row.entryId, Date.now());
            const entry = this.ctx.loader.resolve(row.entryId);
            const config = entry.options.config;
            const url = typeof config?.url === 'string' ? config.url : row.endpoint;
            const headers = {};
            if (typeof config?.headers === 'object' && config.headers !== null) {
                for (const [key, value] of Object.entries(config.headers)) {
                    if (typeof value === 'string')
                        headers[key] = value;
                }
            }
            const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
            try {
                // An MCP initialize POST is the cheapest request every compliant
                // Streamable HTTP server answers; the response body is irrelevant.
                const response = await fetch(url, {
                    method: 'POST',
                    signal,
                    headers: {
                        ...headers,
                        'content-type': 'application/json',
                        accept: 'application/json, text/event-stream',
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 0,
                        method: 'initialize',
                        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dsh-mcp-skill-control-probe', version: '0' } },
                    }),
                });
                this.probes.set(row.entryId, response.ok
                    ? `endpoint answered HTTP ${response.status} but no tools were registered — the server may speak legacy SSE rather than Streamable HTTP, or its initialize handshake failed`
                    : `endpoint answered HTTP ${response.status} ${response.statusText}`);
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.probes.set(row.entryId, `endpoint unreachable: ${reason}`);
            }
        }
        /** Serialize lifecycle operations per entry and normalize failures. */
        async guarded(entryId, op) {
            if (this.inFlight.has(entryId)) {
                return { ok: false, reason: 'transition-in-flight', message: `entry "${entryId}" already has an operation in flight` };
            }
            const running = op()
                .catch((error) => this.failure(error))
                .finally(() => { this.inFlight.delete(entryId); });
            this.inFlight.set(entryId, running);
            return running;
        }
        /** Normalize any thrown value into a failed result. */
        failure(error) {
            if (error instanceof ActionError)
                return { ok: false, reason: error.reason, message: error.message };
            if (error instanceof SkillIoError)
                return { ok: false, reason: error.reason, message: error.message };
            return {
                ok: false,
                reason: 'operation-failed',
                message: error instanceof Error ? error.message : String(error),
            };
        }
        /** Run a patch-file read, treating any failure as "no data". */
        safely(read) {
            try {
                return read();
            }
            catch {
                return new Set();
            }
        }
        /** The profile patch path, or undefined when it cannot be derived. */
        tryPatchPath() {
            try {
                return profilePatchPath(this.ctx.loader);
            }
            catch {
                return undefined;
            }
        }
        /** The profile patch path, or a typed failure when it cannot be derived. */
        requirePatchPath() {
            const path = this.tryPatchPath();
            if (path === undefined) {
                throw new ActionError('no-patch-file', 'cannot derive this profile\'s cordis.patch.yml from the root include entry');
            }
            return path;
        }
        /** Resolve an entry id to its Entry, validating it targets an mcp-client row. */
        resolveMcpEntry(entryId) {
            let entry;
            try {
                entry = this.ctx.loader.resolve(entryId);
            }
            catch {
                throw new ActionError('entry-missing', `entry "${entryId}" does not exist in the loader tree`);
            }
            if (!isMcpEntry(entry)) {
                throw new ActionError('not-mcp-entry', `entry "${entryId}" is not an @deepseek-ai/dsh-mcp-client row`);
            }
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
            if (!isStableRowId(rowId)) {
                throw new ActionError('unstable-id', `row id "${rowId}" is loader-generated and changes every boot — give the row a stable id in cordis.patch.yml first`);
            }
            const patchPath = this.requirePatchPath();
            const persisted = listPersistedDisabled(patchPath).has(rowId);
            let changed = false;
            if (disabled && !persisted) {
                appendDisable(patchPath, rowId);
                await waitFor(() => entry.disabled, PERSIST_APPLY_TIMEOUT_MS, `patch override of "${rowId}" to be applied`);
                changed = true;
            }
            else if (!disabled && persisted) {
                removeDisable(patchPath, rowId);
                await waitFor(() => !entry.disabled, PERSIST_APPLY_TIMEOUT_MS, `patch override of "${rowId}" to be removed`);
                changed = true;
            }
            // The patch layer now matches; reconcile the live entry when it drifted
            // (e.g. the patch was hand-edited to match while the fiber stayed as-is).
            if (entry.disabled !== disabled) {
                await entry.update({ disabled });
                changed = true;
            }
            if (disabled) {
                this.dwell.forget(entryId);
                this.probes.delete(entryId);
            }
            return changed ? { ok: true } : { ok: true, unchanged: true };
        }
        /** Fallback plain-HTTP handler mirroring the Remote methods. */
        async handleHttp(req, res) {
            const reply = (status, body) => {
                res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(body));
            };
            try {
                const sub = new URL(req.url ?? '/', 'http://x').pathname.slice('/mcp-manager/api'.length);
                let args = {};
                if (req.method === 'POST') {
                    const text = await readRequestText(req);
                    if (text !== '') {
                        const parsed = JSON.parse(text);
                        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                            reply(400, { ok: false, error: { code: 'bad-request', message: 'body must be a JSON object' } });
                            return;
                        }
                        args = parsed;
                    }
                }
                if (sub === '/list') {
                    reply(200, { ok: true, value: this.list() });
                    return;
                }
                if (sub === '/skillList') {
                    reply(200, { ok: true, value: this.skillList() });
                    return;
                }
                if (sub === '/skillSetDisabled') {
                    const path = typeof args.path === 'string' ? args.path : '';
                    if (path === '') {
                        reply(400, { ok: false, error: { code: 'bad-request', message: 'path must be a non-empty string' } });
                        return;
                    }
                    if (typeof args.disabled !== 'boolean') {
                        reply(400, { ok: false, error: { code: 'bad-request', message: 'disabled must be a boolean' } });
                        return;
                    }
                    reply(200, envelope(await this.skillSetDisabled(path, args.disabled)));
                    return;
                }
                if (sub === '/skillReveal') {
                    const path = typeof args.path === 'string' && args.path !== '' ? args.path : undefined;
                    reply(200, envelope(await this.skillReveal(path)));
                    return;
                }
                if (sub === '/add') {
                    const spec = args.spec;
                    if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
                        reply(400, { ok: false, error: { code: 'bad-request', message: 'spec must be a JSON object' } });
                        return;
                    }
                    reply(200, envelope(await this.add(spec)));
                    return;
                }
                const entryOps = {
                    '/disable': entryId => this.disable(entryId),
                    '/enable': entryId => this.enable(entryId),
                    '/restart': entryId => this.restart(entryId),
                    '/remove': entryId => this.remove(entryId),
                };
                const op = entryOps[sub];
                if (op !== undefined) {
                    const entryId = typeof args.entryId === 'string' ? args.entryId : '';
                    if (entryId === '') {
                        reply(400, { ok: false, error: { code: 'bad-request', message: 'entryId must be a non-empty string' } });
                        return;
                    }
                    reply(200, envelope(await op(entryId)));
                    return;
                }
                reply(404, { ok: false, error: { code: 'not-found', message: `unknown endpoint ${sub}` } });
            }
            catch (error) {
                reply(500, { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error) } });
            }
        }
    };
})();
export { McpManagerService };
/** Map an action/add result onto the shared envelope shape. */
function envelope(result) {
    if (result.ok)
        return { ok: true, value: result };
    const failed = result;
    return { ok: false, error: { code: failed.reason, message: failed.message } };
}
/** Read one request body fully (bounded). */
async function readRequestText(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buf = chunk;
        size += buf.length;
        if (size > 64 * 1024)
            throw new Error('request body too large');
        chunks.push(buf);
    }
    return Buffer.concat(chunks).toString('utf8');
}
export default McpManagerService;
//# sourceMappingURL=service.js.map