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
import type { Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { McpServerSpec } from './types.ts';
/**
 * Derive the profile's patch-file path from the root include entry:
 * `<profile>/cordis.yml` (the include config path) → sibling `cordis.patch.yml`.
 * @param loader - the live Loader service.
 * @returns absolute path of the profile patch file.
 */
export declare function profilePatchPath(loader: Loader): string;
/**
 * List row ids of mcp-client rows this patch layer contributes via `insert`.
 * These are exactly the rows that `removeServer` can delete.
 * @param patchPath - absolute profile patch-file path.
 * @returns row ids owned by the patch layer.
 */
export declare function listPatchOwnedRows(patchPath: string): Set<string>;
/**
 * List row ids carrying a `disabled: true` override in a top-level patch item.
 * A missing or unparsable file yields an empty set.
 * @param patchPath - absolute profile patch-file path.
 * @returns row ids persisted as disabled.
 */
export declare function listPersistedDisabled(patchPath: string): Set<string>;
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
export declare function appendDisable(patchPath: string, rowId: string): boolean;
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
export declare function removeDisable(patchPath: string, rowId: string): boolean;
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
export declare function addServer(patchPath: string, rowId: string, spec: McpServerSpec): void;
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
export declare function removeServer(patchPath: string, rowId: string): boolean;
