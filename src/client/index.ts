/**
 * dsh-mcp-skill-control Browser half: registers the MCP panel into the session
 * header utilities slot and drives the polling inventory store.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { McpPanel, type McpPanelFace } from './McpPanel.tsx'
import { createPort } from './port.ts'
import { createMcpInventory, createSkillInventory } from './store.ts'
import { ensurePanelStyle } from './styles.ts'
import { en, NS, zh, type McpLocaleKey } from './locales.ts'

export type { McpPanelFace } from './McpPanel.tsx'
export type { McpLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP control-bar panel copy. */
    'mcp-control-bar': McpLocaleKey
  }
}

/** Services required by the panel registration, RPC port, and dictionaries. */
export const inject = ['slots', 'connection', 'locale']

/** Idle polling period while the page is visible (ms). */
const POLL_IDLE_MS = 5_000

/**
 * Faster polling while any row is still settling. A row that is connecting (or
 * one the Host has just probed) changes state within seconds, and the panel is
 * usually open exactly then.
 */
const POLL_ACTIVE_MS = 2_000

/** Mount the MCP control-bar panel. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mcp-control-bar: dictionaries')
  ensurePanelStyle(document)

  const port = createPort(ctx)
  const inventory = createMcpInventory(port, (error) => {
    console.error('[mcp-control-bar] reading the MCP inventory failed:', error)
  })
  const skills = createSkillInventory(port, (message) => {
    inventory.reportActionError(message)
  })

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'mcp-manager',
    // Left of the Session-log utility (order 0).
    order: -10,
    locale: NS,
    inject: (): McpPanelFace => ({
      hooks: { inventory, skills },
      onDisable: entryId => inventory.disable(entryId),
      onEnable: entryId => inventory.enable(entryId),
      onRestart: entryId => inventory.restart(entryId),
      onRemove: entryId => inventory.remove(entryId),
      onAdd: spec => inventory.add(spec),
      onSkillToggle: (path, disabled) => skills.setDisabled(path, disabled),
      onSkillReveal: path => port.skillReveal(path).then(result => {
        if (!result.ok) inventory.reportActionError(result.message)
        return result
      }),
      onRefresh: () => {
        void inventory.refresh()
        void skills.refresh()
      },
      onDismissError: () => inventory.clearActionError(),
    }),
  }, McpPanel))

  // Polling: immediate read, then adaptively while the page is visible. A
  // self-rescheduling timeout (rather than setInterval) lets the cadence
  // follow the tree's own settling state.
  ctx.effect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const period = (): number => {
      const { rows } = inventory.getSnapshot()
      return rows.some(row => row.state === 'connecting') ? POLL_ACTIVE_MS : POLL_IDLE_MS
    }
    const schedule = (): void => {
      if (stopped) return
      timer = setTimeout(tick, period())
    }
    const tick = (): void => {
      if (document.hidden) {
        schedule()
        return
      }
      void Promise.all([inventory.refresh(), skills.refresh()]).finally(schedule)
    }

    void Promise.all([inventory.refresh(), skills.refresh()]).finally(schedule)

    const onVisible = (): void => {
      if (!document.hidden) void inventory.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, 'mcp-control-bar: polling')

  ctx.on('connection/reset', () => {
    inventory.reset()
    skills.reset()
    void inventory.refresh()
    void skills.refresh()
  })
}
