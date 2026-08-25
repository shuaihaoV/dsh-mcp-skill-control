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

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, isMap, isSeq, parseDocument, type Node, type YAMLMap, type YAMLSeq } from 'yaml'
import type { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { MCP_CLIENT_PACKAGE } from './shared.ts'
import type { McpServerSpec } from './types.ts'

/** Comment placed above the insert block this writer creates. */
const MANAGED_COMMENT = ' MCP servers managed by dsh-mcp-skill-control.\n'
  + ' Rows added from the panel land here; edit freely — comments are preserved.'


/**
 * Derive the profile's patch-file path from the root include entry:
 * `<profile>/cordis.yml` (the include config path) → sibling `cordis.patch.yml`.
 * @param loader - the live Loader service.
 * @returns absolute path of the profile patch file.
 */
export function profilePatchPath(loader: Loader): string {
  const includeEntry = loader.resolve('include')
  const config = includeEntry.options.config
  const configPath = typeof config === 'object' && config !== null
    ? (config as { path?: unknown }).path
    : undefined
  if (typeof configPath !== 'string' || !configPath.startsWith('file://')) {
    throw new Error('mcp-manager: cannot derive the profile patch path from the root include entry')
  }
  return join(dirname(fileURLToPath(configPath)), 'cordis.patch.yml')
}

/**
 * Parse the patch file into a Document whose root is a sequence.
 * A missing file, or the bare `[]` template, yields an empty sequence
 * Document so the caller can write into it uniformly.
 */
function readDocument(patchPath: string): Document {
  let text: string
  try {
    text = readFileSync(patchPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') text = ''
    else throw error
  }
  if (text.trim() === '') return new Document([])
  // Widened to `Document` on purpose: `parseDocument` returns `Document.Parsed`,
  // whose `contents` only accepts ParsedNode, so normalizing a non-sequence
  // root would not typecheck against a node this code creates.
  const doc: Document = parseDocument(text, { prettyErrors: true })
  if (doc.errors.length > 0) {
    throw new Error(`mcp-manager: ${patchPath} is not valid YAML: ${doc.errors[0]?.message ?? 'parse error'}`)
  }
  // The shipped template is a bare `[]` flow sequence with a comment header;
  // some profiles even leave a null document. Normalize to a block sequence so
  // `add`/`splice` produce readable YAML, carrying the header comment over.
  if (!isSeq(doc.contents)) {
    const carried = (doc.contents as Node | null)?.commentBefore
    const empty = doc.createNode([]) as YAMLSeq
    if (carried != null) empty.commentBefore = carried
    doc.contents = empty
  } else {
    // A `[]` template parses as a FLOW sequence; rows appended to it would be
    // emitted inline. Block style is what every hand-written patch file uses.
    doc.contents.flow = false
  }
  return doc
}

/**
 * Write a Document back, keeping YAML formatting stable and diff-friendly.
 * `flowCollectionPadding: false` matters: without it every pre-existing flow
 * sequence (`args: ['-y', 'pkg']`) is re-emitted as `[ '-y', 'pkg' ]`, so an
 * unrelated row would show up in the user's diff on every write.
 */
function writeDocument(patchPath: string, doc: Document): void {
  writeFileSync(patchPath, doc.toString({
    lineWidth: 0,
    singleQuote: true,
    flowCollectionPadding: false,
  }), 'utf8')
}

/** The root patch sequence of a parsed document. */
function rootSeq(doc: Document): YAMLSeq {
  if (!isSeq(doc.contents)) throw new Error('mcp-manager: patch file root is not a sequence')
  return doc.contents
}

/** Read a plain string field from a YAML map. */
function stringAt(node: YAMLMap, key: string): string | undefined {
  const value = node.get(key, false) as unknown
  return typeof value === 'string' ? value : undefined
}

/** Every `- insert:` patch item's insert sequence, in file order. */
function insertSeqs(doc: Document): YAMLSeq[] {
  const out: YAMLSeq[] = []
  for (const item of rootSeq(doc).items) {
    if (!isMap(item)) continue
    const insert = item.get('insert', false) as unknown
    if (isSeq(insert)) out.push(insert)
  }
  return out
}

/** Whether a YAML map node is an mcp-client row. */
function isMcpRowNode(node: unknown): node is YAMLMap {
  return isMap(node) && stringAt(node, 'name') === MCP_CLIENT_PACKAGE
}

/**
 * List row ids of mcp-client rows this patch layer contributes via `insert`.
 * These are exactly the rows that `removeServer` can delete.
 * @param patchPath - absolute profile patch-file path.
 * @returns row ids owned by the patch layer.
 */
export function listPatchOwnedRows(patchPath: string): Set<string> {
  const ids = new Set<string>()
  let doc: Document
  try {
    doc = readDocument(patchPath)
  } catch {
    return ids
  }
  for (const seq of insertSeqs(doc)) {
    for (const row of seq.items) {
      if (!isMcpRowNode(row)) continue
      const id = stringAt(row, 'id')
      if (id !== undefined) ids.add(id)
    }
  }
  return ids
}

/**
 * List row ids carrying a `disabled: true` override in a top-level patch item.
 * A missing or unparsable file yields an empty set.
 * @param patchPath - absolute profile patch-file path.
 * @returns row ids persisted as disabled.
 */
export function listPersistedDisabled(patchPath: string): Set<string> {
  const ids = new Set<string>()
  let doc: Document
  try {
    doc = readDocument(patchPath)
  } catch {
    return ids
  }
  // Both shapes count: a dedicated `- id: x / disabled: true` override item,
  // and `disabled: true` written directly onto an inserted row.
  for (const item of rootSeq(doc).items) {
    if (!isMap(item)) continue
    const id = stringAt(item, 'id')
    if (id !== undefined && item.get('disabled', false) === true) ids.add(id)
  }
  for (const seq of insertSeqs(doc)) {
    for (const row of seq.items) {
      if (!isMap(row)) continue
      const id = stringAt(row, 'id')
      if (id !== undefined && row.get('disabled', false) === true) ids.add(id)
    }
  }
  return ids
}

/** Locate a top-level override item for rowId (`- id: rowId` without insert). */
function findOverrideItem(doc: Document, rowId: string): YAMLMap | undefined {
  for (const item of rootSeq(doc).items) {
    if (!isMap(item)) continue
    if (item.has('insert')) continue
    if (stringAt(item, 'id') === rowId) return item
  }
  return undefined
}

/** Locate an inserted mcp row node plus its owning sequence. */
function findInsertedRow(doc: Document, rowId: string): { seq: YAMLSeq; row: YAMLMap; index: number } | undefined {
  for (const seq of insertSeqs(doc)) {
    const index = seq.items.findIndex(row => isMcpRowNode(row) && stringAt(row, 'id') === rowId)
    if (index >= 0) return { seq, row: seq.items[index] as YAMLMap, index }
  }
  return undefined
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
export function appendDisable(patchPath: string, rowId: string): boolean {
  const doc = readDocument(patchPath)
  const inserted = findInsertedRow(doc, rowId)
  if (inserted !== undefined) {
    if (inserted.row.get('disabled', false) === true) return false
    inserted.row.set('disabled', true)
    writeDocument(patchPath, doc)
    return true
  }
  const existing = findOverrideItem(doc, rowId)
  if (existing !== undefined) {
    if (existing.get('disabled', false) === true) return false
    existing.set('disabled', true)
    writeDocument(patchPath, doc)
    return true
  }
  rootSeq(doc).add(doc.createNode({ id: rowId, disabled: true }))
  writeDocument(patchPath, doc)
  return true
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
export function removeDisable(patchPath: string, rowId: string): boolean {
  const doc = readDocument(patchPath)
  let changed = false
  const inserted = findInsertedRow(doc, rowId)
  if (inserted !== undefined && inserted.row.has('disabled')) {
    inserted.row.delete('disabled')
    changed = true
  }
  const override = findOverrideItem(doc, rowId)
  if (override !== undefined && override.has('disabled')) {
    const keys = override.items
      .map(pair => (typeof pair.key === 'object' && pair.key !== null ? (pair.key as { value?: unknown }).value : pair.key))
      .filter(key => typeof key === 'string')
    if (keys.length === 2 && keys.includes('id') && keys.includes('disabled')) {
      const seq = rootSeq(doc)
      seq.items.splice(seq.items.indexOf(override), 1)
    } else {
      override.delete('disabled')
    }
    changed = true
  }
  if (changed) writeDocument(patchPath, doc)
  return changed
}

/** Build the `config:` mapping for one server spec, omitting defaults. */
function configOf(spec: McpServerSpec): Record<string, unknown> {
  const config: Record<string, unknown> = {
    serverName: spec.serverName,
    transport: spec.transport,
  }
  if (spec.transport === 'stdio') {
    config.command = spec.command
    if (spec.args !== undefined && spec.args.length > 0) config.args = spec.args
    if (spec.env !== undefined && Object.keys(spec.env).length > 0) config.env = spec.env
    if (spec.cwd !== undefined && spec.cwd !== '') config.cwd = spec.cwd
  } else {
    config.url = spec.url
    if (spec.headers !== undefined && Object.keys(spec.headers).length > 0) config.headers = spec.headers
  }
  if (spec.toolCallTimeoutMs !== undefined) config.toolCallTimeoutMs = spec.toolCallTimeoutMs
  if (spec.failOnStartupError === true) config.failOnStartupError = true
  if (spec.reconnect !== undefined && Object.keys(spec.reconnect).length > 0) config.reconnect = spec.reconnect
  return config
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
export function addServer(patchPath: string, rowId: string, spec: McpServerSpec): void {
  const doc = readDocument(patchPath)
  if (findInsertedRow(doc, rowId) !== undefined) {
    throw new Error(`row id "${rowId}" already exists in ${patchPath}`)
  }
  const row = doc.createNode({ id: rowId, name: MCP_CLIENT_PACKAGE, config: configOf(spec) })
  const mcpSeqs = insertSeqs(doc).filter(seq => seq.items.some(isMcpRowNode))
  const target = mcpSeqs.at(-1)
  if (target !== undefined) {
    target.add(row)
  } else {
    const item = doc.createNode({ insert: [row] }) as YAMLMap
    item.commentBefore = MANAGED_COMMENT
    rootSeq(doc).add(item)
  }
  writeDocument(patchPath, doc)
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
export function removeServer(patchPath: string, rowId: string): boolean {
  const doc = readDocument(patchPath)
  const found = findInsertedRow(doc, rowId)
  if (found === undefined) return false
  found.seq.items.splice(found.index, 1)
  const seqs = insertSeqs(doc)
  // Drop an insert item that just became empty, so the file has no `insert: []`.
  for (const seq of seqs) {
    if (seq.items.length > 0) continue
    const root = rootSeq(doc)
    const owner = root.items.findIndex(item => isMap(item) && item.get('insert', false) === seq)
    if (owner >= 0) root.items.splice(owner, 1)
  }
  const override = findOverrideItem(doc, rowId)
  if (override !== undefined) {
    const root = rootSeq(doc)
    root.items.splice(root.items.indexOf(override), 1)
  }
  writeDocument(patchPath, doc)
  return true
}
