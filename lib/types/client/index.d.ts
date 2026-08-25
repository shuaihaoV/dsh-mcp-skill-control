/**
 * dsh-mcp-skill-control Browser half: registers the MCP panel into the session
 * header utilities slot and drives the polling inventory store.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type McpLocaleKey } from './locales.ts';
export type { McpPanelFace } from './McpPanel.tsx';
export type { McpLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** MCP control-bar panel copy. */
        'mcp-control-bar': McpLocaleKey;
    }
}
/** Services required by the panel registration, RPC port, and dictionaries. */
export declare const inject: string[];
/** Mount the MCP control-bar panel. */
export declare function apply(ctx: ClientContext): void;
