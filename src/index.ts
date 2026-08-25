/**
 * dsh-mcp-skill-control Host entry: a service-class Cordis plugin (same form as
 * @deepseek-ai/dsh-host-plugin-inventory). The loader instantiates the default
 * export with (ctx, config); `static inject` gates activation on the loader
 * and tools services.
 */

export type * from './types.ts'
export { McpManagerService } from './service.ts'
export {
  createDwellTracker,
  isMcpEntry,
  projectEntry,
  projectRows,
  rowIdOf,
  toolPrefix,
  UNREACHABLE_DWELL_MS,
} from './inventory.ts'
export type { DwellTracker, ProjectionContext } from './inventory.ts'
export {
  addServer,
  appendDisable,
  listPatchOwnedRows,
  listPersistedDisabled,
  profilePatchPath,
  removeDisable,
  removeServer,
} from './patch-writer.ts'
export { deriveRowId, isStableRowId, isValidServerName, MCP_CLIENT_PACKAGE } from './shared.ts'

import { McpManagerService } from './service.ts'

export default McpManagerService
