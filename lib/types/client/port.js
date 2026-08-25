/**
 * Browser-side port: call the Host MCP manager through the typed /api RPC
 * channel (primary) or the plugin's fallback plain-HTTP route (when the
 * gateway has not discovered the namespace, e.g. older dsh builds).
 */
/** RPC failure carrying the gateway's error code for fallback decisions. */
export class RpcFailure extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'RpcFailure';
    }
}
/** Create the panel's Host port. */
export function createPort(ctx) {
    const connection = ctx.get('connection');
    async function call(method, args) {
        try {
            const result = await connection.rpc.call('/api', `mcpManager/${method}`, { args });
            if (result.ok)
                return result.value;
            throw new RpcFailure(result.error.code, result.error.message);
        }
        catch (error) {
            // Only discovery failures fall back to the plain-HTTP route; business
            // failures (entry-missing, transition-in-flight, …) propagate as-is.
            if (error instanceof RpcFailure && error.code !== 'invocation-unavailable')
                throw error;
            const fallback = await fetchFallback(method, args);
            if (!fallback.ok)
                throw new RpcFailure(fallback.error.code, fallback.error.message);
            return fallback.value;
        }
    }
    return {
        list: () => call('list', {}),
        disable: entryId => call('disable', { entryId }),
        enable: entryId => call('enable', { entryId }),
        restart: entryId => call('restart', { entryId }),
        remove: entryId => call('remove', { entryId }),
        add: spec => call('add', { spec }),
        skillList: () => call('skillList', {}),
        skillSetDisabled: (path, disabled) => call('skillSetDisabled', { path, disabled }),
        skillReveal: path => call('skillReveal', { path }),
    };
}
/** Plain-HTTP fallback against the webServer route registered by the Host half. */
async function fetchFallback(method, args) {
    const response = await fetch(`/mcp-manager/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
    });
    if (!response.ok) {
        throw new RpcFailure('transport', `fallback route failed: HTTP ${response.status}`);
    }
    return await response.json();
}
//# sourceMappingURL=port.js.map