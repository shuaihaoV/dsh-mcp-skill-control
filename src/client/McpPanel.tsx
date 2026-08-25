/**
 * MCP control-bar header utility: a capsule button in the session header's
 * right-aligned utilities row (same metrics as the Session-log button) with a
 * right-aligned dropdown server list. Each row is a one-line
 * [switch] name … status-dot; clicking a row expands its details.
 *
 * UI composition rule: controls come from
 * `@deepseek-ai/dsh-client-ui-primitives` (Button, StateDot, Modal, Pill,
 * RiskConfirmation, icons) rather than being re-implemented here. Those
 * components ship with the app's CSS-module classes already in the main
 * bundle, so the panel inherits the active theme instead of the hardcoded
 * status colours the previous revision carried.
 */

import { useMemo, useRef, useState } from 'react'
import {
  Button,
  IconApiOutline14,
  IconChevronRightOutline14,
  IconFolderOpenOutline16,
  IconPlusOutline16,
  IconRefreshOutline14,
  IconTrashOutline16,
  IconWarningOutline16,
  Modal,
  StateDot,
  Tooltip,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { McpAddResult, McpServerRow, McpServerSpec, McpServerState, SkillRow } from '../types.ts'
import type { McpInventorySource, SkillInventorySource } from './store.ts'
import type { McpLocaleKey } from './locales.ts'
import { McpAddDialog } from './McpAddDialog.tsx'

/** Business face injected by the client apply. */
export interface McpPanelFace {
  hooks: {
    inventory: McpInventorySource
    skills: SkillInventorySource
  }
  onDisable(entryId: string): Promise<unknown>
  onEnable(entryId: string): Promise<unknown>
  onRestart(entryId: string): Promise<unknown>
  onRemove(entryId: string): Promise<unknown>
  onAdd(spec: McpServerSpec): Promise<McpAddResult>
  onSkillToggle(path: string, disabled: boolean): Promise<unknown>
  onSkillReveal(path?: string): Promise<unknown>
  onRefresh(): void
  onDismissError(): void
}

/** Full panel props composed by the session header utilities slot. */
export type McpPanelProps =
  PropsRuntime<'conversation.session.header.utilities'> & InjectFace<McpPanelFace> & PropsLocale<'mcp-control-bar'>

type Translate = McpPanelProps['t']

const STATE_KEY: Record<McpServerState, McpLocaleKey> = {
  connected: 'state.connected',
  connecting: 'state.connecting',
  unreachable: 'state.unreachable',
  failed: 'state.failed',
  disabled: 'state.disabled',
}

/**
 * Map an MCP state onto the design system's four dot states. `disabled` has no
 * StateDot equivalent (the set is done/warning/ongoing/error), so it renders a
 * neutral dot from tokens instead.
 */
const DOT_STATE: Record<McpServerState, StateDotState | null> = {
  connected: 'done',
  connecting: 'ongoing',
  unreachable: 'warning',
  failed: 'error',
  disabled: null,
}

/** Header capsule trigger + dropdown panel (MCP servers and Skills tabs). */
export function McpPanel(props: McpPanelProps) {
  const { t, useInventory, useSkills, onDisable, onEnable, onRestart, onRemove, onAdd, onSkillToggle, onSkillReveal, onRefresh, onDismissError } = props
  const inventory = useInventory(snapshot => snapshot)
  const skills = useSkills(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'mcp' | 'skills'>('mcp')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<McpServerRow | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // A modal renders in a portal outside this subtree, so an outside-pointer
  // dismiss would close the dropdown underneath it mid-interaction.
  useDismissOnOutsidePointer(rootRef, open && !addOpen && pendingRemoval === null, setOpen)

  const { rows } = inventory
  const takenNames = useMemo(() => new Set(rows.map(row => row.serverName)), [rows])

  const confirmRemoval = async (): Promise<void> => {
    const row = pendingRemoval
    if (row === null) return
    setPendingRemoval(null)
    await onRemove(row.entryId)
  }

  return (
    <div ref={rootRef} className="mcb-root">
      <button
        type="button"
        className="mcb-trigger"
        aria-expanded={open}
        onClick={() => {
          setOpen(value => !value)
          if (!open) onRefresh()
        }}
      >
        <IconApiOutline14 size={12} />
        <span>{t('trigger.label')}</span>
      </button>

      {open && (
        <div className="mcb-panel" role="dialog" aria-label={t('panel.title')}>
          <div className="mcb-header">
            <div className="mcb-tabbar" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'mcp'}
                className="mcb-tab"
                data-active={tab === 'mcp' ? 'true' : undefined}
                onClick={() => setTab('mcp')}
              >
                {t('tab.mcp')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'skills'}
                className="mcb-tab"
                data-active={tab === 'skills' ? 'true' : undefined}
                onClick={() => setTab('skills')}
              >
                {t('tab.skills')}
              </button>
            </div>
            {tab === 'mcp' && (
              <Button
                variant="ghost"
                size="sm"
                icon={<IconPlusOutline16 size={12} />}
                onClick={() => setAddOpen(true)}
              >
                {t('panel.add')}
              </Button>
            )}
            {tab === 'skills' && (
              <Button
                variant="ghost"
                size="sm"
                icon={<IconFolderOpenOutline16 size={12} />}
                onClick={() => { void onSkillReveal() }}
              >
                {t('skills.reveal')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={<IconRefreshOutline14 size={11} />}
              onClick={onRefresh}
            >
              {t('panel.refresh')}
            </Button>
          </div>

          {inventory.actionError !== undefined && (
            <div className="mcb-error" role="alert">
              <IconWarningOutline16 size={12} />
              <span className="mcb-error-text">{t('panel.actionError', { message: inventory.actionError })}</span>
              <Button variant="ghost" size="sm" onClick={onDismissError}>{t('panel.dismiss')}</Button>
            </div>
          )}
          {inventory.read && inventory.error !== undefined && (
            <div className="mcb-error" role="alert">
              <IconWarningOutline16 size={12} />
              <span className="mcb-error-text">{t('panel.error', { message: inventory.error })}</span>
            </div>
          )}

          {tab === 'mcp' && (
            !inventory.read
              ? <div className="mcb-notice">{t('panel.loading')}</div>
              : inventory.error === undefined && rows.length === 0
                ? <div className="mcb-notice">{t('panel.empty')}</div>
                : rows.length > 0 && (
                  <div className="mcb-scroll">
                    <ul className="mcb-list">
                      {rows.map(row => (
                        <ServerRow
                          key={row.entryId}
                          row={row}
                          busy={inventory.busy[row.entryId] === true}
                          expanded={expanded === row.entryId}
                          onToggleExpand={() => setExpanded(expanded === row.entryId ? null : row.entryId)}
                          onDisable={onDisable}
                          onEnable={onEnable}
                          onRestart={onRestart}
                          onRequestRemove={() => setPendingRemoval(row)}
                          t={t}
                        />
                      ))}
                    </ul>
                  </div>
                )
          )}

          {tab === 'skills' && (
            !skills.read
              ? <div className="mcb-notice">{t('panel.loading')}</div>
              : skills.rows.length === 0
                ? <div className="mcb-notice">{t('skills.empty')}</div>
                : (
                  <div className="mcb-scroll">
                    <ul className="mcb-list">
                      {skills.rows.map(row => (
                        <SkillRowView
                          key={row.path}
                          row={row}
                          busy={skills.busy[row.path] === true}
                          expanded={expandedSkill === row.path}
                          onToggleExpand={() => setExpandedSkill(expandedSkill === row.path ? null : row.path)}
                          onToggle={onSkillToggle}
                          t={t}
                        />
                      ))}
                    </ul>
                  </div>
                )
          )}
        </div>
      )}

      <McpAddDialog
        open={addOpen}
        busy={inventory.adding}
        takenNames={takenNames}
        onClose={() => setAddOpen(false)}
        onSubmit={onAdd}
        t={t}
      />

      {pendingRemoval !== null && (
        <Modal
          open
          onClose={() => setPendingRemoval(null)}
          title={t('remove.title')}
          closeLabel={t('remove.cancel')}
          footer={(
            <div className="mcb-dialog-actions">
              <span className="mcb-spacer" />
              <Button variant="ghost" size="sm" onClick={() => setPendingRemoval(null)}>
                {t('remove.cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={() => void confirmRemoval()}>
                {t('remove.confirm')}
              </Button>
            </div>
          )}
        >
          <div className="mcb-warnbox">
            {t('remove.body', {
              name: pendingRemoval.serverName || pendingRemoval.rowId,
              rowId: pendingRemoval.rowId,
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}

function ServerRow({ row, busy, expanded, onToggleExpand, onDisable, onEnable, onRestart, onRequestRemove, t }: {
  row: McpServerRow
  busy: boolean
  expanded: boolean
  onToggleExpand(): void
  onDisable(entryId: string): Promise<unknown>
  onEnable(entryId: string): Promise<unknown>
  onRestart(entryId: string): Promise<unknown>
  onRequestRemove(): void
  t: Translate
}) {
  const dot = DOT_STATE[row.state]
  const stateLabel = t(STATE_KEY[row.state])
  const toggleTitle = !row.stableId
    ? t('row.unstable.hint')
    : row.disabled ? t('row.enable') : t('row.disable')

  return (
    <li className="mcb-row" data-state={row.state}>
      <div className="mcb-row-head">
        <label className="mcb-switch" title={toggleTitle} onClick={event => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={!row.disabled}
            disabled={busy || !row.stableId}
            aria-label={toggleTitle}
            onChange={() => { void (row.disabled ? onEnable(row.entryId) : onDisable(row.entryId)) }}
          />
          <span className="mcb-switch-track" />
        </label>
        <button type="button" className="mcb-row-main" aria-expanded={expanded} onClick={onToggleExpand}>
          <span className="mcb-chev" data-open={expanded ? 'true' : undefined}>
            <IconChevronRightOutline14 size={10} />
          </span>
          <span className="mcb-name" title={row.entryId}>{row.serverName || row.rowId}</span>
          <span className="mcb-dot-slot" title={stateLabel} aria-label={stateLabel}>
            {dot === null ? <span className="mcb-dot-idle" /> : <StateDot state={dot} size={8} />}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="mcb-details">
          <div className="mcb-detail-line">
            <span className="mcb-detail-label">{t('details.state')}</span>
            <span className="mcb-detail-value">
              {stateLabel}
              {row.persistedDisabled && ` · ${t('row.persisted')}`}
            </span>
            <span className="mcb-row-actions">
              {!row.disabled && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void onRestart(row.entryId)}>
                  {busy ? t('row.working') : t('row.restart')}
                </Button>
              )}
              {row.origin === 'patch'
                ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<IconTrashOutline16 size={12} />}
                    disabled={busy}
                    onClick={onRequestRemove}
                  >
                    {t('row.remove')}
                  </Button>
                )
                : (
                  <Tooltip label={t('row.foreign.hint')}>
                    <span>
                      <Button variant="ghost" size="sm" icon={<IconTrashOutline16 size={12} />} disabled>
                        {t('row.remove')}
                      </Button>
                    </span>
                  </Tooltip>
                )}
            </span>
          </div>

          {row.detail !== undefined && (
            <div className="mcb-detail-line">
              <span className="mcb-detail-label">{t('details.diagnosis')}</span>
              <span className="mcb-detail-value mcb-diagnosis">{row.detail}</span>
            </div>
          )}
          <div className="mcb-detail-line">
            <span className="mcb-detail-label">{t('details.transport')}</span>
            <span className="mcb-detail-value">
              {row.transport === 'stdio' ? t('transport.stdio') : t('transport.http')}
            </span>
          </div>
          <div className="mcb-detail-line">
            <span className="mcb-detail-label">{t('details.endpoint')}</span>
            <span className="mcb-detail-value mcb-endpoint" title={row.endpoint}>{row.endpoint}</span>
          </div>
          <div className="mcb-detail-line">
            <span className="mcb-detail-label">{t('details.entry')}</span>
            <span className="mcb-detail-value">{row.rowId}</span>
          </div>
          <div className="mcb-detail-label">{t('details.tools', { count: row.toolCount })}</div>
          {row.tools.length > 0
            ? (
              <ul className="mcb-toollist">
                {row.tools.map(name => <li key={name} className="mcb-toolitem">{name}</li>)}
              </ul>
            )
            : <div className="mcb-detail-value">{t('details.noTools')}</div>}
        </div>
      )}
    </li>
  )
}

function SkillRowView({ row, busy, expanded, onToggleExpand, onToggle, t }: {
  row: SkillRow
  busy: boolean
  expanded: boolean
  onToggleExpand(): void
  onToggle(path: string, disabled: boolean): Promise<unknown>
  t: Translate
}) {
  const title = row.modelDisabled ? t('skills.enable') : t('skills.disable')
  return (
    <li className="mcb-row" data-state={row.modelDisabled ? 'disabled' : undefined}>
      <div className="mcb-row-head">
        <label className="mcb-switch" title={title} onClick={event => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={!row.modelDisabled}
            disabled={busy}
            aria-label={title}
            onChange={() => { void onToggle(row.path, !row.modelDisabled) }}
          />
          <span className="mcb-switch-track" />
        </label>
        <button type="button" className="mcb-row-main" aria-expanded={expanded} onClick={onToggleExpand}>
          <span className="mcb-chev" data-open={expanded ? 'true' : undefined}>
            <IconChevronRightOutline14 size={10} />
          </span>
          <span className="mcb-name" title={row.name}>{row.name}</span>
          <span className="mcb-dot-slot" title={row.modelDisabled ? t('skills.state.off') : t('skills.state.on')}>
            {row.modelDisabled
              ? <span className="mcb-dot-idle" />
              : <StateDot state="done" size={8} />}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="mcb-details">
          <div className="mcb-detail-line">
            <span className="mcb-detail-label">{t('skills.desc')}</span>
            <span className="mcb-detail-value">{row.description}</span>
          </div>
          <div className="mcb-detail-line">
            <span className="mcb-detail-label">{t('skills.state.label')}</span>
            <span className="mcb-detail-value">
              {row.modelDisabled ? t('skills.state.off') : t('skills.state.on')}
            </span>
          </div>
          <div className="mcb-detail-line">
            <span className="mcb-detail-label">{t('skills.source')}</span>
            <span className="mcb-detail-value">{row.sources.map(s => s === 'user-dsh' ? '~/.dsh/skills' : '~/.agents/skills').join(' + ')}</span>
          </div>
          <div className="mcb-detail-line">
            <span className="mcb-detail-label">{t('skills.path')}</span>
            <span className="mcb-detail-value mcb-endpoint" title={row.path}>{row.path}</span>
          </div>
          {row.flat && (
            <div className="mcb-detail-line">
              <span className="mcb-detail-label">{t('skills.form')}</span>
              <span className="mcb-detail-value">{t('skills.form.flat')}</span>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
