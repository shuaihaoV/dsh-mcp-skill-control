/**
 * Wire vocabulary shared by the Host half and the Browser half of
 * dsh-mcp-skill-control. Pure types — no runtime code.
 */

/** Loader root-fiber phase projected for the panel badge. */
export type McpFiberPhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null

/**
 * Normalized per-server state shown in the panel.
 *
 * `unreachable` is this plugin's own verdict, not a loader phase: mcp-client
 * defaults `failOnStartupError` to false, so a server whose connection never
 * succeeds keeps an ACTIVE fiber with zero tools forever. Without this state
 * such a row would read "connecting" indefinitely.
 */
export type McpServerState = 'connected' | 'connecting' | 'unreachable' | 'failed' | 'disabled'

/**
 * Where a row's definition lives, which decides whether it can be removed.
 *
 * The patch layer can only ADD rows and OVERRIDE fields of existing ones —
 * it cannot delete a row contributed by a bundle. So only `patch` rows are
 * removable; everything else may merely be disabled.
 */
export type McpRowOrigin = 'patch' | 'foreign'

/** mcp-client transport discriminant (the only two the bridge speaks). */
export type McpTransport = 'stdio' | 'streamable-http'

/** Automatic reconnect policy accepted by mcp-client. */
export interface McpReconnectSpec {
  enabled?: boolean
  initialDelayMs?: number
  maxDelayMs?: number
  maxAttempts?: number
}

/** Fields common to both transports when creating a server. */
interface McpServerSpecBase {
  /** Patch-layer row id; generated from serverName when omitted. */
  rowId?: string
  /** MCP namespace — must match `[A-Za-z0-9_-]{1,32}` and be globally unique. */
  serverName: string
  /** Per-tool-call timeout in milliseconds; omitted keeps the mcp-client default. */
  toolCallTimeoutMs?: number
  /** Fail plugin activation when the initial connection fails. */
  failOnStartupError?: boolean
  /** Automatic reconnect policy; omitted keeps the mcp-client defaults. */
  reconnect?: McpReconnectSpec
}

/** Create-spec for a child-process (stdio) MCP server. */
export interface McpStdioSpec extends McpServerSpecBase {
  transport: 'stdio'
  /** Executable, e.g. `npx`, `uvx`, `docker`, or an absolute path. */
  command: string
  /** Argv passed without shell interpolation. */
  args?: string[]
  /** Extra env vars merged over the scrubbed ambient env. */
  env?: Record<string, string>
  /** Working directory for the child process. */
  cwd?: string
}

/** Create-spec for a Streamable HTTP MCP server. */
export interface McpHttpSpec extends McpServerSpecBase {
  transport: 'streamable-http'
  /** MCP endpoint URL. */
  url: string
  /** Additional headers attached to MCP requests (auth lives here). */
  headers?: Record<string, string>
}

/** One MCP server definition accepted by `add`. */
export type McpServerSpec = McpStdioSpec | McpHttpSpec

/** One MCP server row: a `@deepseek-ai/dsh-mcp-client` loader entry plus derived state. */
export interface McpServerRow {
  /** Loader entry id (nested resolve path, e.g. `include:mcp-x`). */
  entryId: string
  /** Patch-layer row id (last `:`-segment of entryId) — the id persist writes target. */
  rowId: string
  /** MCP namespace from the entry config (`mcp__<serverName>__*` tool prefix). */
  serverName: string
  /** mcp-client transport discriminant. */
  transport: McpTransport
  /** Display endpoint: `command args…` for stdio, the URL for streamable-http. */
  endpoint: string
  /** Effective disabled state (this entry or an owning group). */
  disabled: boolean
  /** Whether this writer's `disabled: true` override exists in the profile patch file. */
  persistedDisabled: boolean
  /** Root fiber phase, or null when the entry has no live fiber. */
  fiberPhase: McpFiberPhase
  /** Normalized state derived from disabled + fiberPhase + toolCount + dwell time. */
  state: McpServerState
  /** Whether the row lives in the profile patch layer, hence is removable. */
  origin: McpRowOrigin
  /** True when this row's id is a stable, patch-targetable token. */
  stableId: boolean
  /** Number of tools this server currently has registered on ctx.tools. */
  toolCount: number
  /** Registered public tool names (`mcp__<serverName>__*`), sorted. */
  tools: string[]
  /**
   * Why the row is `unreachable`, when known: the last endpoint probe's
   * diagnostic. Absent for every other state.
   */
  detail?: string
}

/** Result of an enable/disable/restart/remove action. */
export type McpActionResult =
  | { ok: true; unchanged?: boolean }
  | { ok: false; reason: string; message: string }

/** Result of an add action, carrying the row id the writer chose. */
export type McpAddResult =
  | { ok: true; rowId: string; serverName: string }
  | { ok: false; reason: string; message: string }

/** The JSON-RPC-ish envelope the fallback HTTP route shares with ctx.connection.rpc results. */
export type McpEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** Which user skill root(s) point at the physical directory holding a skill. */
export type SkillSourceKind = 'user-dsh' | 'user-agents'

/** One skill row: a SKILL.md bundle (or flat .md) under a managed user root. */
export interface SkillRow {
  /** frontmatter `name` (kebab-case) — the identifier the model sees. */
  name: string
  /** frontmatter `description`, empty string when missing. */
  description: string
  /** Logical root labels whose realpath resolved to this physical root. */
  sources: SkillSourceKind[]
  /** Entry name inside the physical root (may differ from `name`). */
  dirName: string
  /** Absolute skill-file path after realpath normalization. */
  path: string
  /** True for a flat `<name>.md` file rather than a `<name>/SKILL.md` bundle. */
  flat: boolean
  /** frontmatter `disable-model-invocation` currently true (default false). */
  modelDisabled: boolean
}

/** Result of a skill enable/disable action. */
export type SkillActionResult =
  | { ok: true; unchanged?: boolean }
  | { ok: false; reason: string; message: string }
