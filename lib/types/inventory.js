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
import { isStableRowId, MCP_CLIENT_PACKAGE } from './shared.js';
export { MCP_CLIENT_PACKAGE } from './shared.js';
/**
 * How long an active fiber may report zero tools before the row is called
 * `unreachable`. mcp-client's own first reconnect delay is 500ms doubling to a
 * 30s ceiling, so a server that is merely slow normally publishes tools well
 * inside this window; one that is dead never will.
 */
export const UNREACHABLE_DWELL_MS = 20_000;
/** Runtime mirror of cordis's cross-package const-enum FiberState (numeric at runtime). */
const FIBER_PHASE = {
    0: 'pending',
    1: 'loading',
    2: 'active',
    3: 'failed',
    4: null,
    5: 'unloading',
};
/** Create a dwell tracker over a clock (injectable for tests). */
export function createDwellTracker(now = Date.now) {
    const since = new Map();
    return {
        observe(entryId, toolless) {
            if (!toolless) {
                since.delete(entryId);
                return undefined;
            }
            const existing = since.get(entryId);
            if (existing !== undefined)
                return existing;
            const started = now();
            since.set(entryId, started);
            return started;
        },
        forget(entryId) {
            since.delete(entryId);
        },
    };
}
/** A loader-resolved entry id (`include:mcp-x`); the patch-layer row id is its last segment. */
export function rowIdOf(entryId) {
    return entryId.split(':').at(-1) ?? entryId;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
/** Whether one loader entry is a manageable mcp-client row. */
export function isMcpEntry(entry) {
    return entry.options.name === MCP_CLIENT_PACKAGE;
}
/** Public tool name prefix owned by one server namespace. */
export function toolPrefix(serverName) {
    return `mcp__${serverName}__`;
}
/** Project one mcp-client entry into a panel row. */
export function projectEntry(ctx, entry, projection = {}) {
    const { persisted = new Set(), patchOwned = new Set(), dwell, probes, now = Date.now } = projection;
    const raw = isRecord(entry.options.config) ? entry.options.config : {};
    const serverName = typeof raw.serverName === 'string' ? raw.serverName : '';
    const transport = raw.transport === 'streamable-http' ? 'streamable-http' : 'stdio';
    let endpoint;
    if (transport === 'streamable-http') {
        endpoint = typeof raw.url === 'string' ? raw.url : '';
    }
    else {
        const args = Array.isArray(raw.args) ? raw.args.filter(a => typeof a === 'string').join(' ') : '';
        const command = typeof raw.command === 'string' ? raw.command : '';
        endpoint = args === '' ? command : `${command} ${args}`;
    }
    const prefix = toolPrefix(serverName);
    const tools = serverName === ''
        ? []
        : ctx.tools.schemas().map(s => s.name).filter(name => name.startsWith(prefix)).sort();
    const fiberPhase = entry.fiber === undefined ? null : (FIBER_PHASE[entry.fiber.state] ?? null);
    const disabled = entry.disabled;
    const rowId = rowIdOf(entry.id);
    // Only an enabled, active, tool-less row is a dwell candidate; anything else
    // clears the stretch so a later stall is timed from scratch.
    const toolless = !disabled && fiberPhase === 'active' && tools.length === 0;
    const stretchStart = dwell?.observe(entry.id, toolless);
    const stalledFor = toolless && stretchStart !== undefined ? now() - stretchStart : 0;
    let state;
    if (disabled)
        state = 'disabled';
    else if (fiberPhase === 'failed')
        state = 'failed';
    else if (fiberPhase === 'active' && tools.length > 0)
        state = 'connected';
    else if (toolless && stalledFor >= UNREACHABLE_DWELL_MS)
        state = 'unreachable';
    else
        state = 'connecting';
    const detail = state === 'unreachable' ? probes?.get(entry.id) : undefined;
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
        origin: (patchOwned.has(rowId) ? 'patch' : 'foreign'),
        stableId: isStableRowId(rowId),
        toolCount: tools.length,
        tools,
        ...detail === undefined ? {} : { detail },
    };
}
/** Project every mcp-client entry in the loader tree, in loader order. */
export function projectRows(ctx, projection = {}) {
    const rows = [];
    for (const entry of ctx.loader.entries()) {
        if (!isMcpEntry(entry))
            continue;
        rows.push(projectEntry(ctx, entry, projection));
    }
    return rows;
}
//# sourceMappingURL=inventory.js.map