/**
 * Panel store: one observable snapshot (rows + read state + per-row busy
 * flags) driven by polling and post-action refreshes. The renderer binds it
 * as a `useInventory` hook from the inject hooks compartment.
 *
 * Two bugs in the previous revision shaped this design:
 *
 * 1. Busy flags were rebuilt from a stale closure (`{...snapshot.busy}` read
 *    in a `finally` that ran after `refresh()` had already replaced the
 *    snapshot), so concurrent operations could resurrect a cleared flag or
 *    drop a live one. Busy state is now kept in a mutable Set that is the
 *    single source of truth and projected into each snapshot.
 * 2. A failed action set `error` and then immediately called `refresh()`,
 *    whose success path built a fresh snapshot WITHOUT the error — so the
 *    reason for the failure vanished before it could be read. Read failures
 *    and action failures are therefore separate fields with separate
 *    lifetimes: `error` (transport/read) clears on the next good read, while
 *    `actionError` persists until dismissed or superseded.
 */
const EMPTY = { read: false, rows: [], busy: {}, adding: false };
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Create the inventory store. Polling is owned by the caller (apply), which
 * drives refresh() on an interval and on lifecycle events.
 * @param port - Host RPC port.
 * @param onError - sink for unexpected failures (console diagnostics).
 * @returns the inventory store.
 */
export function createMcpInventory(port, onError) {
    let snapshot = EMPTY;
    const listeners = new Set();
    // Authoritative busy state, independent of any snapshot generation.
    const busy = new Set();
    let adding = 0;
    const emit = () => {
        for (const fn of [...listeners])
            fn();
    };
    /** Project the mutable busy/adding state into a snapshot patch. */
    const flags = () => ({
        busy: Object.fromEntries([...busy].map(id => [id, true])),
        adding: adding > 0,
    });
    const set = (next) => {
        snapshot = { ...next, ...flags() };
        emit();
    };
    /** Re-emit with current flags, preserving the rest of the snapshot. */
    const touch = () => {
        snapshot = { ...snapshot, ...flags() };
        emit();
    };
    async function refresh() {
        try {
            const rows = await port.list();
            // A successful read clears `error` but must NOT clear `actionError`.
            set({
                read: true,
                rows,
                ...snapshot.actionError === undefined ? {} : { actionError: snapshot.actionError },
            });
        }
        catch (error) {
            onError(error);
            set({
                read: true,
                rows: snapshot.rows,
                error: messageOf(error),
                ...snapshot.actionError === undefined ? {} : { actionError: snapshot.actionError },
            });
        }
    }
    /** Record an action failure so it survives the refresh that follows. */
    const failAction = (message) => {
        set({
            read: snapshot.read,
            rows: snapshot.rows,
            ...snapshot.error === undefined ? {} : { error: snapshot.error },
            actionError: message,
        });
    };
    async function act(entryId, op) {
        busy.add(entryId);
        touch();
        try {
            const result = await op();
            if (!result.ok)
                failAction(result.message);
            return result;
        }
        catch (error) {
            const message = messageOf(error);
            failAction(message);
            return { ok: false, reason: 'transport', message };
        }
        finally {
            busy.delete(entryId);
            // Refresh AFTER clearing the flag so the fresh rows and the settled
            // busy state land in the same snapshot the renderer sees.
            await refresh();
        }
    }
    return {
        getSnapshot: () => snapshot,
        subscribe(fn) {
            listeners.add(fn);
            return () => { listeners.delete(fn); };
        },
        refresh,
        disable: entryId => act(entryId, () => port.disable(entryId)),
        enable: entryId => act(entryId, () => port.enable(entryId)),
        restart: entryId => act(entryId, () => port.restart(entryId)),
        remove: entryId => act(entryId, () => port.remove(entryId)),
        async add(spec) {
            adding += 1;
            touch();
            try {
                const result = await port.add(spec);
                if (!result.ok)
                    failAction(result.message);
                return result;
            }
            catch (error) {
                const message = messageOf(error);
                failAction(message);
                return { ok: false, reason: 'transport', message };
            }
            finally {
                adding -= 1;
                await refresh();
            }
        },
        reportActionError: message => failAction(message),
        clearActionError() {
            if (snapshot.actionError === undefined)
                return;
            set({
                read: snapshot.read,
                rows: snapshot.rows,
                ...snapshot.error === undefined ? {} : { error: snapshot.error },
            });
        },
        reset() {
            busy.clear();
            adding = 0;
            snapshot = EMPTY;
            emit();
        },
    };
}
const SKILL_EMPTY = { read: false, rows: [], busy: {} };
/**
 * Create the skills inventory store. Mirrors the MCP store's design: busy
 * state lives in a mutable Set (single source of truth), and read errors
 * clear on the next good read. Action failures are surfaced through the MCP
 * store's sticky actionError banner via the shared onError sink.
 * @param port - Host RPC port.
 * @param onActionError - sink for action failures (the shared banner).
 * @returns the skills inventory store.
 */
export function createSkillInventory(port, onActionError) {
    let snapshot = SKILL_EMPTY;
    const listeners = new Set();
    const busy = new Set();
    const emit = () => {
        for (const fn of [...listeners])
            fn();
    };
    const set = (next) => {
        snapshot = { ...next, busy: Object.fromEntries([...busy].map(p => [p, true])) };
        emit();
    };
    const touch = () => {
        snapshot = { ...snapshot, busy: Object.fromEntries([...busy].map(p => [p, true])) };
        emit();
    };
    async function refresh() {
        try {
            const rows = await port.skillList();
            set({ read: true, rows });
        }
        catch {
            // Skill reads are best-effort alongside MCP polling; keep the last rows
            // and surface nothing more than the empty-state hint in the panel.
            set({ read: true, rows: snapshot.rows, ...snapshot.error === undefined ? {} : { error: snapshot.error } });
        }
    }
    async function setDisabled(path, disabled) {
        busy.add(path);
        touch();
        try {
            const result = await port.skillSetDisabled(path, disabled);
            if (!result.ok)
                onActionError(result.message);
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onActionError(message);
            return { ok: false, reason: 'transport', message };
        }
        finally {
            busy.delete(path);
            await refresh();
        }
    }
    return {
        getSnapshot: () => snapshot,
        subscribe(fn) {
            listeners.add(fn);
            return () => { listeners.delete(fn); };
        },
        refresh,
        setDisabled,
        reset() {
            busy.clear();
            snapshot = SKILL_EMPTY;
            emit();
        },
    };
}
//# sourceMappingURL=store.js.map