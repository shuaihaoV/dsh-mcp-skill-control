/**
 * Pure parsing helpers shared by the add dialog: free-text field parsers and
 * the importer for third-party MCP configuration JSON.
 *
 * The importer accepts the shapes users actually have on disk, because DSH's
 * `mcp-client` config is not what any other tool writes:
 *
 * - Claude Desktop / OpenCode / Cursor: `{ "mcpServers": { "<name>": {...} } }`
 * - a bare map of servers: `{ "<name>": {...} }`
 * - a single server object, with or without a `name`
 *
 * Per-server shapes recognised:
 * - stdio:  `{ command, args?, env?, cwd? }`  (also `type: "stdio"`)
 * - http:   `{ url | httpUrl, headers? }`     (also `type: "http"|"streamable-http"|"sse"`)
 * - OpenCode: `{ type: "local", command: [bin, ...args], environment? }`
 *
 * `sse` is recognised only to REJECT it with an actionable message: DSH's
 * mcp-client speaks stdio and Streamable HTTP only (see its Config union), so
 * silently importing an SSE endpoint would produce a row that can never
 * connect — exactly the failure mode the panel's `unreachable` state exists to
 * expose.
 */
import type { McpServerSpec } from '../types.ts';
/** One parsed candidate from imported JSON. */
export interface ImportCandidate {
    /** Server name as written in the source document. */
    name: string;
    /** The DSH `serverName` this will be created as (slugified when needed). */
    serverName?: string;
    /** The spec to submit, when this candidate is valid. */
    spec?: McpServerSpec;
    /** Why this candidate cannot be imported, when invalid. */
    problem?: string;
}
/**
 * Coerce a foreign server name into a valid DSH `serverName`.
 *
 * Other tools allow names DSH cannot use verbatim: OpenCode and Claude Desktop
 * happily key servers as `"Tavily MCP"`, but mcp-client requires
 * `[A-Za-z0-9_-]{1,32}` because the name becomes part of every public tool
 * name (`mcp__<serverName>__<tool>`). Rejecting those outright made real
 * config files un-importable, so they are slugified instead.
 * @param name - the source document's server name.
 * @returns a valid serverName, or undefined when nothing usable remains.
 */
export declare function slugifyServerName(name: string): string | undefined;
/** Split an args field: one per line, or whitespace-separated on a single line. */
export declare function parseArgs(text: string): string[];
/** Parse `KEY=VALUE` lines into a record; blank lines and `#` comments skipped. */
export declare function parseEnv(text: string): {
    values: Record<string, string>;
    bad: string[];
};
/** Parse `Name: Value` lines into a header record. */
export declare function parseHeaders(text: string): {
    values: Record<string, string>;
    bad: string[];
};
/** Serialize a record back into `K<sep>V` lines for editing. */
export declare function formatPairs(values: Record<string, string>, separator: string): string;
/**
 * Convert one third-party server entry into a DSH spec.
 * @param name - server name from the document key or `name` field.
 * @param raw - the server object.
 * @returns a candidate carrying either a spec or a problem description.
 */
export declare function candidateFrom(name: string, raw: unknown): ImportCandidate;
/** Outcome of parsing a pasted configuration document. */
export interface ImportResult {
    candidates: ImportCandidate[];
    /** Set when the text is not usable JSON at all. */
    fatal?: string;
}
/**
 * Parse pasted MCP configuration JSON into importable candidates.
 * @param text - raw JSON text from the dialog.
 * @returns candidates, or a fatal parse/shape error.
 */
export declare function parseImport(text: string): ImportResult;
