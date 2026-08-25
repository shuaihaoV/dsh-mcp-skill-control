/**
 * Browser-side port: call the Host MCP manager through the typed /api RPC
 * channel (primary) or the plugin's fallback plain-HTTP route (when the
 * gateway has not discovered the namespace, e.g. older dsh builds).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { McpActionResult, McpAddResult, McpServerRow, McpServerSpec, SkillActionResult, SkillRow } from '../types.ts';
/** Operations the panel can perform against the Host service. */
export interface McpPort {
    list(): Promise<McpServerRow[]>;
    disable(entryId: string): Promise<McpActionResult>;
    enable(entryId: string): Promise<McpActionResult>;
    restart(entryId: string): Promise<McpActionResult>;
    remove(entryId: string): Promise<McpActionResult>;
    add(spec: McpServerSpec): Promise<McpAddResult>;
    skillList(): Promise<SkillRow[]>;
    skillSetDisabled(path: string, disabled: boolean): Promise<SkillActionResult>;
    skillReveal(path?: string): Promise<SkillActionResult>;
}
/** RPC failure carrying the gateway's error code for fallback decisions. */
export declare class RpcFailure extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Create the panel's Host port. */
export declare function createPort(ctx: ClientContext): McpPort;
