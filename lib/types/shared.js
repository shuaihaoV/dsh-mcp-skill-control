/**
 * Shared runtime primitives used by BOTH the projection layer and the patch
 * writer. They live here rather than in either module so the two never import
 * each other (a cycle ESM tolerates but which makes load order load-bearing).
 * `types.ts` stays type-only, so these runtime values cannot live there.
 */
/** Package name every managed row must carry. */
export const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client';
/** A stable, patch-targetable row id. */
const STABLE_ROW_ID = /^[A-Za-z0-9_.-]+$/;
/**
 * Loader-generated ids are 8 hex chars and are re-minted every boot, so a
 * patch written against one would target nothing after a restart.
 */
const GENERATED_ROW_ID = /^[0-9a-f]{8}$/;
/** Whether a row id can be targeted by a patch across restarts. */
export function isStableRowId(rowId) {
    return STABLE_ROW_ID.test(rowId) && !GENERATED_ROW_ID.test(rowId);
}
/** mcp-client's `serverName` constraint, enforced before a write. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** Whether a server name satisfies mcp-client's namespace contract. */
export function isValidServerName(serverName) {
    return SERVER_NAME_PATTERN.test(serverName);
}
/**
 * Derive a stable patch row id from a server name (`tavily` → `mcp-tavily`),
 * de-duplicated against ids already present.
 * @param serverName - the validated MCP namespace.
 * @param taken - row ids already used in the tree or the patch file.
 * @returns an unused, stable row id.
 */
export function deriveRowId(serverName, taken) {
    const base = `mcp-${serverName}`;
    if (!taken.has(base))
        return base;
    for (let n = 2; n < 1000; n += 1) {
        const candidate = `${base}-${n}`;
        if (!taken.has(candidate))
            return candidate;
    }
    throw new Error(`mcp-manager: cannot derive a free row id for "${serverName}"`);
}
//# sourceMappingURL=shared.js.map