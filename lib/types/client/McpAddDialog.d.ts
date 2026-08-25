/**
 * Add-server dialog: a primitives `Modal` hosting either a two-transport form
 * or a JSON importer. Both paths produce `McpServerSpec` values and submit
 * through the store's `add` action.
 *
 * The form mirrors mcp-client's own Config union exactly — required fields
 * inline, everything the schema defaults (env, cwd, headers, timeout,
 * failOnStartupError, reconnect) behind an "Advanced" disclosure — so a row
 * created here can express anything a hand-written cordis.patch.yml row can.
 */
import type { McpAddResult, McpServerSpec } from '../types.ts';
import { formatPairs } from './spec-parse.ts';
import type { McpLocaleKey } from './locales.ts';
/** Translator bound to this plugin's namespace. */
type Translate = (key: McpLocaleKey, params?: Record<string, unknown>) => string;
export interface McpAddDialogProps {
    open: boolean;
    busy: boolean;
    /** Server names already in use, for inline duplicate detection. */
    takenNames: ReadonlySet<string>;
    onClose(): void;
    onSubmit(spec: McpServerSpec): Promise<McpAddResult>;
    t: Translate;
}
/** Add-server modal. */
export declare function McpAddDialog({ open, busy, takenNames, onClose, onSubmit, t }: McpAddDialogProps): import("react").JSX.Element;
/** Re-exported so the panel can prefill an editor later without a new import. */
export { formatPairs };
