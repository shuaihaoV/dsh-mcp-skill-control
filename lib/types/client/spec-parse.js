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
import { isValidServerName } from '../shared.js';
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
export function slugifyServerName(name) {
    const slug = name
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32)
        // A trailing dash can reappear after the 32-char cut.
        .replace(/-+$/, '');
    return slug === '' ? undefined : slug;
}
/** Split an args field: one per line, or whitespace-separated on a single line. */
export function parseArgs(text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return [];
    if (trimmed.includes('\n')) {
        return trimmed.split('\n').map(line => line.trim()).filter(line => line !== '');
    }
    return trimmed.split(/\s+/).filter(part => part !== '');
}
/** Parse `KEY=VALUE` lines into a record; blank lines and `#` comments skipped. */
export function parseEnv(text) {
    const values = {};
    const bad = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#'))
            continue;
        const eq = line.indexOf('=');
        if (eq <= 0) {
            bad.push(line);
            continue;
        }
        values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return { values, bad };
}
/** Parse `Name: Value` lines into a header record. */
export function parseHeaders(text) {
    const values = {};
    const bad = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#'))
            continue;
        const colon = line.indexOf(':');
        if (colon <= 0) {
            bad.push(line);
            continue;
        }
        values[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    return { values, bad };
}
/** Serialize a record back into `K<sep>V` lines for editing. */
export function formatPairs(values, separator) {
    return Object.entries(values).map(([key, value]) => `${key}${separator}${value}`).join('\n');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function stringOf(value) {
    return typeof value === 'string' && value !== '' ? value : undefined;
}
/** Collect a string→string map, ignoring non-string values. */
function stringMap(value) {
    if (!isRecord(value))
        return {};
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string')
            out[key] = item;
    }
    return out;
}
/** Collect a string array, ignoring non-strings (numbers are stringified). */
function stringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter(item => typeof item === 'string' || typeof item === 'number')
        .map(item => String(item));
}
/** Reconnect block, when the source document carries one. */
function reconnectOf(value) {
    if (!isRecord(value))
        return undefined;
    const out = {};
    if (typeof value.enabled === 'boolean')
        out.enabled = value.enabled;
    if (typeof value.initialDelayMs === 'number')
        out.initialDelayMs = value.initialDelayMs;
    if (typeof value.maxDelayMs === 'number')
        out.maxDelayMs = value.maxDelayMs;
    if (typeof value.maxAttempts === 'number')
        out.maxAttempts = value.maxAttempts;
    return Object.keys(out).length === 0 ? undefined : out;
}
/**
 * Convert one third-party server entry into a DSH spec.
 * @param name - server name from the document key or `name` field.
 * @param raw - the server object.
 * @returns a candidate carrying either a spec or a problem description.
 */
export function candidateFrom(name, raw) {
    if (!isRecord(raw))
        return { name, problem: 'not a JSON object' };
    if (raw.disabled === true || raw.enabled === false) {
        return { name, problem: 'marked disabled in the source document' };
    }
    const declared = stringOf(raw.type) ?? stringOf(raw.transport);
    if (declared === 'sse') {
        return { name, problem: 'legacy SSE transport is not supported by DSH mcp-client (stdio and streamable-http only)' };
    }
    // Accept the source document's name by slugifying it, rather than rejecting
    // every name that merely contains a space.
    const serverName = isValidServerName(name) ? name : slugifyServerName(name);
    if (serverName === undefined) {
        return { name, problem: 'name has no characters usable in a DSH serverName ([A-Za-z0-9_-])' };
    }
    const url = stringOf(raw.url) ?? stringOf(raw.httpUrl) ?? stringOf(raw.endpoint);
    // OpenCode's "local" shape puts the binary and its args in one array.
    const commandField = raw.command;
    let command = stringOf(commandField);
    let args = stringArray(raw.args);
    if (command === undefined && Array.isArray(commandField)) {
        const parts = stringArray(commandField);
        command = parts[0];
        if (args.length === 0)
            args = parts.slice(1);
    }
    const timeout = typeof raw.toolCallTimeoutMs === 'number'
        ? raw.toolCallTimeoutMs
        : typeof raw.timeout === 'number' ? raw.timeout : undefined;
    const reconnect = reconnectOf(raw.reconnect);
    const shared = {
        serverName,
        ...timeout === undefined ? {} : { toolCallTimeoutMs: timeout },
        ...raw.failOnStartupError === true ? { failOnStartupError: true } : {},
        ...reconnect === undefined ? {} : { reconnect },
    };
    if (command !== undefined) {
        const env = { ...stringMap(raw.env), ...stringMap(raw.environment) };
        const cwd = stringOf(raw.cwd) ?? stringOf(raw.workingDirectory);
        return {
            name,
            serverName,
            spec: {
                ...shared,
                transport: 'stdio',
                command,
                ...args.length > 0 ? { args } : {},
                ...Object.keys(env).length > 0 ? { env } : {},
                ...cwd === undefined ? {} : { cwd },
            },
        };
    }
    if (url !== undefined) {
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch {
            return { name, problem: `url "${url}" is not a valid absolute URL` };
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { name, problem: `url protocol "${parsed.protocol}" must be http or https` };
        }
        const headers = { ...stringMap(raw.headers), ...stringMap(raw.header) };
        // A `/sse` path is the most common migration trap: OpenCode writes
        // `type: "remote"` and Claude Desktop writes no type at all for BOTH
        // Streamable HTTP and legacy SSE endpoints, so the URL is the only signal.
        // Only an explicit streamable-http/http declaration suppresses this check,
        // because that means the author already knows what the server speaks.
        const explicitHttp = declared === 'streamable-http' || declared === 'http';
        if (!explicitHttp && parsed.pathname.endsWith('/sse')) {
            return {
                name,
                serverName,
                problem: `endpoint path "${parsed.pathname}" looks like a legacy SSE endpoint, which DSH mcp-client cannot speak — use the server's Streamable HTTP URL (often /mcp)`,
            };
        }
        return {
            name,
            serverName,
            spec: {
                ...shared,
                transport: 'streamable-http',
                url,
                ...Object.keys(headers).length > 0 ? { headers } : {},
            },
        };
    }
    return { name, problem: 'neither a command (stdio) nor a url (streamable-http) was found' };
}
/**
 * Parse pasted MCP configuration JSON into importable candidates.
 * @param text - raw JSON text from the dialog.
 * @returns candidates, or a fatal parse/shape error.
 */
export function parseImport(text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return { candidates: [], fatal: 'paste a JSON document first' };
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch (error) {
        return { candidates: [], fatal: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!isRecord(parsed))
        return { candidates: [], fatal: 'the document root must be a JSON object' };
    // Shape 1: an { mcpServers | servers | mcp } wrapper.
    const wrapper = parsed.mcpServers ?? parsed.servers ?? parsed.mcp;
    if (isRecord(wrapper)) {
        const candidates = Object.entries(wrapper).map(([name, raw]) => candidateFrom(name, raw));
        return candidates.length === 0
            ? { candidates: [], fatal: 'the server map is empty' }
            : { candidates };
    }
    // Shape 2: a single server object (it carries command/url itself).
    const looksLikeServer = 'command' in parsed || 'url' in parsed || 'httpUrl' in parsed || 'endpoint' in parsed;
    if (looksLikeServer) {
        const name = stringOf(parsed.name) ?? stringOf(parsed.serverName) ?? '';
        if (name === '') {
            return { candidates: [], fatal: 'a single server object needs a "name" field (or paste it under an mcpServers map)' };
        }
        return { candidates: [candidateFrom(name, parsed)] };
    }
    // Shape 3: a bare map of name → server object.
    const entries = Object.entries(parsed).filter(([, raw]) => isRecord(raw));
    if (entries.length > 0) {
        return { candidates: entries.map(([name, raw]) => candidateFrom(name, raw)) };
    }
    return { candidates: [], fatal: 'no MCP server definitions were found in the document' };
}
//# sourceMappingURL=spec-parse.js.map