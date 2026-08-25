/**
 * MCP control-bar header utility: a capsule button in the session header's
 * right-aligned utilities row (same metrics as the Session-log button) with a
 * right-aligned dropdown server list. Each row is a one-line
 * [switch] name … status-dot; clicking a row expands its details.
 *
 * UI composition rule: controls come from
 * `@deepseek-ai/dsh-client-ui-primitives` (Button, StateDot, Modal, Pill,
 * RiskConfirmation, icons) rather than being re-implemented here. Those
 * components ship with the app's CSS-module classes already in the main
 * bundle, so the panel inherits the active theme instead of the hardcoded
 * status colours the previous revision carried.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { McpAddResult, McpServerSpec } from '../types.ts';
import type { McpInventorySource, SkillInventorySource } from './store.ts';
/** Business face injected by the client apply. */
export interface McpPanelFace {
    hooks: {
        inventory: McpInventorySource;
        skills: SkillInventorySource;
    };
    onDisable(entryId: string): Promise<unknown>;
    onEnable(entryId: string): Promise<unknown>;
    onRestart(entryId: string): Promise<unknown>;
    onRemove(entryId: string): Promise<unknown>;
    onAdd(spec: McpServerSpec): Promise<McpAddResult>;
    onSkillToggle(path: string, disabled: boolean): Promise<unknown>;
    onSkillReveal(path?: string): Promise<unknown>;
    onRefresh(): void;
    onDismissError(): void;
}
/** Full panel props composed by the session header utilities slot. */
export type McpPanelProps = PropsRuntime<'conversation.session.header.utilities'> & InjectFace<McpPanelFace> & PropsLocale<'mcp-control-bar'>;
/** Header capsule trigger + dropdown panel (MCP servers and Skills tabs). */
export declare function McpPanel(props: McpPanelProps): import("react").JSX.Element;
