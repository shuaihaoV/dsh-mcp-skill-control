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
import type { Context } from '@deepseek-ai/cordis';
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';
import type { McpServerRow } from './types.ts';
export { MCP_CLIENT_PACKAGE } from './shared.ts';
/**
 * How long an active fiber may report zero tools before the row is called
 * `unreachable`. mcp-client's own first reconnect delay is 500ms doubling to a
 * 30s ceiling, so a server that is merely slow normally publishes tools well
 * inside this window; one that is dead never will.
 */
export declare const UNREACHABLE_DWELL_MS = 20000;
/**
 * Per-entry observation of the current active-but-toolless stretch.
 * Keyed by entry id; reset whenever the row leaves that condition.
 */
export interface DwellTracker {
    /** Record the current observation and report the stretch's start, in ms. */
    observe(entryId: string, toolless: boolean): number | undefined;
    /** Forget one entry (used when the entry disappears or is disabled). */
    forget(entryId: string): void;
}
/** Create a dwell tracker over a clock (injectable for tests). */
export declare function createDwellTracker(now?: () => number): DwellTracker;
/** A loader-resolved entry id (`include:mcp-x`); the patch-layer row id is its last segment. */
export declare function rowIdOf(entryId: string): string;
/** Whether one loader entry is a manageable mcp-client row. */
export declare function isMcpEntry(entry: Entry): boolean;
/** Public tool name prefix owned by one server namespace. */
export declare function toolPrefix(serverName: string): string;
/** Inputs a projection needs beyond the entry itself. */
export interface ProjectionContext {
    /** Row ids carrying a persisted `disabled: true` override. */
    persisted?: ReadonlySet<string>;
    /** Row ids the profile patch layer contributes (hence removable). */
    patchOwned?: ReadonlySet<string>;
    /** Dwell tracker used to promote a stuck row to `unreachable`. */
    dwell?: DwellTracker;
    /** Last probe diagnostic per entry id, when the Host probed the endpoint. */
    probes?: ReadonlyMap<string, string>;
    /** Clock, injectable for tests. */
    now?: () => number;
}
/** Project one mcp-client entry into a panel row. */
export declare function projectEntry(ctx: Context, entry: Entry, projection?: ProjectionContext): McpServerRow;
/** Project every mcp-client entry in the loader tree, in loader order. */
export declare function projectRows(ctx: Context, projection?: ProjectionContext): McpServerRow[];
