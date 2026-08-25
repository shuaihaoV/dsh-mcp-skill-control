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
import type { McpActionResult, McpAddResult, McpServerRow, McpServerSpec, SkillActionResult, SkillRow } from '../types.ts';
import type { McpPort } from './port.ts';
/** Immutable panel snapshot; replaced wholesale on every change. */
export interface McpSnapshot {
    /** False until the first list() settles — the panel shows a loading line, not an empty claim. */
    read: boolean;
    rows: McpServerRow[];
    /** Last READ failure; cleared by the next successful read. */
    error?: string;
    /** Last ACTION failure; survives refreshes, cleared explicitly. */
    actionError?: string;
    /** Per-entryId operation-in-flight flags (controls disable while true). */
    busy: Readonly<Record<string, boolean>>;
    /** True while an add is in flight. */
    adding: boolean;
}
/** Observable source the slot renderer binds (getSnapshot/subscribe currency). */
export interface McpInventorySource {
    getSnapshot(): McpSnapshot;
    subscribe(fn: () => void): () => void;
}
/** Store face: the observable plus the panel's action surface. */
export interface McpInventory extends McpInventorySource {
    refresh(): Promise<void>;
    disable(entryId: string): Promise<McpActionResult>;
    enable(entryId: string): Promise<McpActionResult>;
    restart(entryId: string): Promise<McpActionResult>;
    remove(entryId: string): Promise<McpActionResult>;
    add(spec: McpServerSpec): Promise<McpAddResult>;
    /** Surface a foreign action failure (e.g. from the skills tab) on the shared banner. */
    reportActionError(message: string): void;
    /** Clear the sticky action-failure banner. */
    clearActionError(): void;
    reset(): void;
}
/**
 * Create the inventory store. Polling is owned by the caller (apply), which
 * drives refresh() on an interval and on lifecycle events.
 * @param port - Host RPC port.
 * @param onError - sink for unexpected failures (console diagnostics).
 * @returns the inventory store.
 */
export declare function createMcpInventory(port: McpPort, onError: (error: unknown) => void): McpInventory;
/** Immutable skills-tab snapshot. */
export interface SkillSnapshot {
    /** False until the first skillList() settles. */
    read: boolean;
    rows: SkillRow[];
    /** Last READ failure; cleared by the next successful read. */
    error?: string;
    /** Per-skill-path operation-in-flight flags. */
    busy: Readonly<Record<string, boolean>>;
}
/** Observable source the skills renderer binds. */
export interface SkillInventorySource {
    getSnapshot(): SkillSnapshot;
    subscribe(fn: () => void): () => void;
}
/** Skills store face: observable plus the toggle action. */
export interface SkillInventory extends SkillInventorySource {
    refresh(): Promise<void>;
    setDisabled(path: string, disabled: boolean): Promise<SkillActionResult>;
    reset(): void;
}
/**
 * Create the skills inventory store. Mirrors the MCP store's design: busy
 * state lives in a mutable Set (single source of truth), and read errors
 * clear on the next good read. Action failures are surfaced through the MCP
 * store's sticky actionError banner via the shared onError sink.
 * @param port - Host RPC port.
 * @param onActionError - sink for action failures (the shared banner).
 * @returns the skills inventory store.
 */
export declare function createSkillInventory(port: McpPort, onActionError: (message: string) => void): SkillInventory;
