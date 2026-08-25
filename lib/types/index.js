/**
 * dsh-mcp-skill-control Host entry: a service-class Cordis plugin (same form as
 * @deepseek-ai/dsh-host-plugin-inventory). The loader instantiates the default
 * export with (ctx, config); `static inject` gates activation on the loader
 * and tools services.
 */
export { McpManagerService } from './service.js';
export { createDwellTracker, isMcpEntry, projectEntry, projectRows, rowIdOf, toolPrefix, UNREACHABLE_DWELL_MS, } from './inventory.js';
export { addServer, appendDisable, listPatchOwnedRows, listPersistedDisabled, profilePatchPath, removeDisable, removeServer, } from './patch-writer.js';
export { deriveRowId, isStableRowId, isValidServerName, MCP_CLIENT_PACKAGE } from './shared.js';
import { McpManagerService } from './service.js';
export default McpManagerService;
//# sourceMappingURL=index.js.map