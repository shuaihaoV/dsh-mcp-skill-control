/**
 * Browser-side port: call the Host MCP manager through the typed /api RPC
 * channel (primary) or the plugin's fallback plain-HTTP route (when the
 * gateway has not discovered the namespace, e.g. older dsh builds).
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { McpActionResult, McpAddResult, McpEnvelope, McpServerRow, McpServerSpec, SkillActionResult, SkillRow } from '../types.ts'

/** Operations the panel can perform against the Host service. */
export interface McpPort {
  list(): Promise<McpServerRow[]>
  disable(entryId: string): Promise<McpActionResult>
  enable(entryId: string): Promise<McpActionResult>
  restart(entryId: string): Promise<McpActionResult>
  remove(entryId: string): Promise<McpActionResult>
  add(spec: McpServerSpec): Promise<McpAddResult>
  skillList(): Promise<SkillRow[]>
  skillSetDisabled(path: string, disabled: boolean): Promise<SkillActionResult>
  skillReveal(path?: string): Promise<SkillActionResult>
}

/** RPC failure carrying the gateway's error code for fallback decisions. */
export class RpcFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RpcFailure'
  }
}

/** Create the panel's Host port. */
export function createPort(ctx: ClientContext): McpPort {
  const connection = ctx.get('connection') as ConnectionHandle
  async function call<T>(method: string, args: Record<string, unknown>): Promise<T> {
    try {
      const result = await connection.rpc.call('/api', `mcpManager/${method}`, { args })
      if (result.ok) return result.value as T
      throw new RpcFailure(result.error.code, result.error.message)
    } catch (error) {
      // Only discovery failures fall back to the plain-HTTP route; business
      // failures (entry-missing, transition-in-flight, …) propagate as-is.
      if (error instanceof RpcFailure && error.code !== 'invocation-unavailable') throw error
      const fallback = await fetchFallback<T>(method, args)
      if (!fallback.ok) throw new RpcFailure(fallback.error.code, fallback.error.message)
      return fallback.value
    }
  }

  return {
    list: () => call<McpServerRow[]>('list', {}),
    disable: entryId => call<McpActionResult>('disable', { entryId }),
    enable: entryId => call<McpActionResult>('enable', { entryId }),
    restart: entryId => call<McpActionResult>('restart', { entryId }),
    remove: entryId => call<McpActionResult>('remove', { entryId }),
    add: spec => call<McpAddResult>('add', { spec }),
    skillList: () => call<SkillRow[]>('skillList', {}),
    skillSetDisabled: (path, disabled) => call<SkillActionResult>('skillSetDisabled', { path, disabled }),
    skillReveal: path => call<SkillActionResult>('skillReveal', { path }),
  }
}

/** Plain-HTTP fallback against the webServer route registered by the Host half. */
async function fetchFallback<T>(method: string, args: Record<string, unknown>): Promise<McpEnvelope<T>> {
  const response = await fetch(`/mcp-manager/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!response.ok) {
    throw new RpcFailure('transport', `fallback route failed: HTTP ${response.status}`)
  }
  return await response.json() as McpEnvelope<T>
}
