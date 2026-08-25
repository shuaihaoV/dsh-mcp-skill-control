/**
 * MCP manager Host service: a TypertRemoteService whose @Remote methods are
 * discovered dynamically by the API gateway's SRC fallback (no generated
 * artifacts, no assembly wiring). A fallback plain-HTTP route on the
 * webServer service mirrors the same operations for clients that cannot
 * reach the /api RPC channel.
 *
 * Lifecycle semantics: every mutation goes through the profile's
 * `cordis.patch.yml`, which the profile patch watcher applies transactionally
 * (so the running process flips immediately AND the state survives restarts).
 * A bare Entry-level update only reconciles drift between the patch layer and
 * the live tree.
 *
 * | operation | patch-layer effect                      | reversible in UI |
 * |-----------|------------------------------------------|------------------|
 * | disable   | `disabled: true` on/for the row          | yes (enable)     |
 * | enable    | that override removed                    | yes (disable)    |
 * | restart   | none (runtime dispose + re-init)         | n/a              |
 * | add       | row appended to the managed insert block | yes (remove)     |
 * | remove    | row deleted from the insert block        | NO               |
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { McpActionResult, McpAddResult, McpServerRow, McpServerSpec, SkillActionResult, SkillRow } from './types.ts';
/** MCP manager service. */
export declare class McpManagerService extends TypertRemoteService {
    static inject: string[];
    /** One in-flight lifecycle operation per entry id. */
    private readonly inFlight;
    /** Tracks how long each row has been active-but-toolless. */
    private readonly dwell;
    /** Last probe diagnostic per entry id. */
    private readonly probes;
    /** Last probe timestamp per entry id, to rate-limit outbound requests. */
    private readonly probedAt;
    constructor(ctx: Context);
    /** List every mcp-client entry with its derived state. */
    list(): McpServerRow[];
    /**
     * Add one MCP server: validate, write the row into the profile patch layer,
     * and wait for the watcher to mount it.
     * @param spec - transport-discriminated server definition.
     */
    add(spec: McpServerSpec): Promise<McpAddResult>;
    /**
     * Remove one MCP server permanently by deleting its row from the patch
     * layer. Only rows this layer contributed can be removed.
     * @param entryId - loader entry id of the mcp-client row.
     */
    remove(entryId: string): Promise<McpActionResult>;
    /**
     * Disable one MCP server, persisted: write the override into the profile
     * patch file; the patch watcher disposes the fiber (disconnect + tool
     * removal) and the state survives restarts.
     * @param entryId - loader entry id of the mcp-client row.
     */
    disable(entryId: string): Promise<McpActionResult>;
    /**
     * Enable one MCP server, persisted: remove the override from the profile
     * patch file; the patch watcher re-runs mcp-client connect + tool discovery.
     * @param entryId - loader entry id of the mcp-client row.
     */
    enable(entryId: string): Promise<McpActionResult>;
    /**
     * Restart one MCP server (runtime-only action): dispose, wait for full
     * fiber teardown, re-init. Persisted overrides are untouched.
     * @param entryId - loader entry id of the mcp-client row.
     */
    restart(entryId: string): Promise<McpActionResult>;
    /**
     * List every skill under the managed user roots (see skill-io.ts for the
     * root-resolution contract). Pure read; invalid entries are skipped the
     * same way the skill provider's discovery drops them.
     */
    skillList(): SkillRow[];
    /**
     * Flip one skill's model-invocation switch by editing its frontmatter
     * `disable-model-invocation` key. The filesystem watcher applies the new
     * catalog asynchronously, so no wait is performed here.
     * @param path - skill-file path as returned by skillList.
     * @param disabled - true hides the skill from the model catalog.
     */
    skillSetDisabled(path: string, disabled: boolean): Promise<SkillActionResult>;
    /**
     * Reveal a managed skill (or its root) in the host platform's file manager.
     * Opens the containing skills ROOT directory — the directory the panel
     * manages — which is where a user goes to add or edit skills.
     * @param path - optional skill-file path; omitted opens the first root.
     */
    skillReveal(path?: string): Promise<SkillActionResult>;
    /** Validate a create-spec against mcp-client's own contract before writing. */
    private validateSpec;
    /**
     * Probe a streamable-http endpoint to turn "no tools" into an actionable
     * diagnostic. Rate-limited per entry; a probe never changes lifecycle state.
     *
     * ⚠️ Security note: the probe replays the row's configured headers (which
     * carry its bearer/api-key) to the row's own configured URL only — the same
     * destination mcp-client already talks to, so no new credential exposure.
     */
    private probe;
    /** Serialize lifecycle operations per entry and normalize failures. */
    private guarded;
    /** Normalize any thrown value into a failed result. */
    private failure;
    /** Run a patch-file read, treating any failure as "no data". */
    private safely;
    /** The profile patch path, or undefined when it cannot be derived. */
    private tryPatchPath;
    /** The profile patch path, or a typed failure when it cannot be derived. */
    private requirePatchPath;
    /** Resolve an entry id to its Entry, validating it targets an mcp-client row. */
    private resolveMcpEntry;
    /**
     * Persisted enable/disable transition: bring the patch file to the desired
     * state (the watcher flips the live entry), then reconcile any remaining
     * runtime drift (e.g. a bare patch edit while the plugin was absent).
     */
    private transition;
    /** Fallback plain-HTTP handler mirroring the Remote methods. */
    private handleHttp;
}
export default McpManagerService;
