/**
 * Shared runtime primitives used by BOTH the projection layer and the patch
 * writer. They live here rather than in either module so the two never import
 * each other (a cycle ESM tolerates but which makes load order load-bearing).
 * `types.ts` stays type-only, so these runtime values cannot live there.
 */
/** Package name every managed row must carry. */
export declare const MCP_CLIENT_PACKAGE = "@deepseek-ai/dsh-mcp-client";
/** Whether a row id can be targeted by a patch across restarts. */
export declare function isStableRowId(rowId: string): boolean;
/** Whether a server name satisfies mcp-client's namespace contract. */
export declare function isValidServerName(serverName: string): boolean;
/**
 * Derive a stable patch row id from a server name (`tavily` → `mcp-tavily`),
 * de-duplicated against ids already present.
 * @param serverName - the validated MCP namespace.
 * @param taken - row ids already used in the tree or the patch file.
 * @returns an unused, stable row id.
 */
export declare function deriveRowId(serverName: string, taken: ReadonlySet<string>): string;
