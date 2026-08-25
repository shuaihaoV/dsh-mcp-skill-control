import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useMemo, useRef, useState } from 'react';
import { Button, IconApiOutline14, IconChevronRightOutline14, IconFolderOpenOutline16, IconPlusOutline16, IconRefreshOutline14, IconTrashOutline16, IconWarningOutline16, Modal, StateDot, Tooltip, useDismissOnOutsidePointer, } from '@deepseek-ai/dsh-client-ui-primitives';
import { McpAddDialog } from './McpAddDialog.js';
const STATE_KEY = {
    connected: 'state.connected',
    connecting: 'state.connecting',
    unreachable: 'state.unreachable',
    failed: 'state.failed',
    disabled: 'state.disabled',
};
/**
 * Map an MCP state onto the design system's four dot states. `disabled` has no
 * StateDot equivalent (the set is done/warning/ongoing/error), so it renders a
 * neutral dot from tokens instead.
 */
const DOT_STATE = {
    connected: 'done',
    connecting: 'ongoing',
    unreachable: 'warning',
    failed: 'error',
    disabled: null,
};
/** Header capsule trigger + dropdown panel (MCP servers and Skills tabs). */
export function McpPanel(props) {
    const { t, useInventory, useSkills, onDisable, onEnable, onRestart, onRemove, onAdd, onSkillToggle, onSkillReveal, onRefresh, onDismissError } = props;
    const inventory = useInventory(snapshot => snapshot);
    const skills = useSkills(snapshot => snapshot);
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState('mcp');
    const [expanded, setExpanded] = useState(null);
    const [expandedSkill, setExpandedSkill] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [pendingRemoval, setPendingRemoval] = useState(null);
    const rootRef = useRef(null);
    // A modal renders in a portal outside this subtree, so an outside-pointer
    // dismiss would close the dropdown underneath it mid-interaction.
    useDismissOnOutsidePointer(rootRef, open && !addOpen && pendingRemoval === null, setOpen);
    const { rows } = inventory;
    const takenNames = useMemo(() => new Set(rows.map(row => row.serverName)), [rows]);
    const confirmRemoval = async () => {
        const row = pendingRemoval;
        if (row === null)
            return;
        setPendingRemoval(null);
        await onRemove(row.entryId);
    };
    return (_jsxs("div", { ref: rootRef, className: "mcb-root", children: [_jsxs("button", { type: "button", className: "mcb-trigger", "aria-expanded": open, onClick: () => {
                    setOpen(value => !value);
                    if (!open)
                        onRefresh();
                }, children: [_jsx(IconApiOutline14, { size: 12 }), _jsx("span", { children: t('trigger.label') })] }), open && (_jsxs("div", { className: "mcb-panel", role: "dialog", "aria-label": t('panel.title'), children: [_jsxs("div", { className: "mcb-header", children: [_jsxs("div", { className: "mcb-tabbar", role: "tablist", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": tab === 'mcp', className: "mcb-tab", "data-active": tab === 'mcp' ? 'true' : undefined, onClick: () => setTab('mcp'), children: t('tab.mcp') }), _jsx("button", { type: "button", role: "tab", "aria-selected": tab === 'skills', className: "mcb-tab", "data-active": tab === 'skills' ? 'true' : undefined, onClick: () => setTab('skills'), children: t('tab.skills') })] }), tab === 'mcp' && (_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(IconPlusOutline16, { size: 12 }), onClick: () => setAddOpen(true), children: t('panel.add') })), tab === 'skills' && (_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(IconFolderOpenOutline16, { size: 12 }), onClick: () => { void onSkillReveal(); }, children: t('skills.reveal') })), _jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(IconRefreshOutline14, { size: 11 }), onClick: onRefresh, children: t('panel.refresh') })] }), inventory.actionError !== undefined && (_jsxs("div", { className: "mcb-error", role: "alert", children: [_jsx(IconWarningOutline16, { size: 12 }), _jsx("span", { className: "mcb-error-text", children: t('panel.actionError', { message: inventory.actionError }) }), _jsx(Button, { variant: "ghost", size: "sm", onClick: onDismissError, children: t('panel.dismiss') })] })), inventory.read && inventory.error !== undefined && (_jsxs("div", { className: "mcb-error", role: "alert", children: [_jsx(IconWarningOutline16, { size: 12 }), _jsx("span", { className: "mcb-error-text", children: t('panel.error', { message: inventory.error }) })] })), tab === 'mcp' && (!inventory.read
                        ? _jsx("div", { className: "mcb-notice", children: t('panel.loading') })
                        : inventory.error === undefined && rows.length === 0
                            ? _jsx("div", { className: "mcb-notice", children: t('panel.empty') })
                            : rows.length > 0 && (_jsx("div", { className: "mcb-scroll", children: _jsx("ul", { className: "mcb-list", children: rows.map(row => (_jsx(ServerRow, { row: row, busy: inventory.busy[row.entryId] === true, expanded: expanded === row.entryId, onToggleExpand: () => setExpanded(expanded === row.entryId ? null : row.entryId), onDisable: onDisable, onEnable: onEnable, onRestart: onRestart, onRequestRemove: () => setPendingRemoval(row), t: t }, row.entryId))) }) }))), tab === 'skills' && (!skills.read
                        ? _jsx("div", { className: "mcb-notice", children: t('panel.loading') })
                        : skills.rows.length === 0
                            ? _jsx("div", { className: "mcb-notice", children: t('skills.empty') })
                            : (_jsx("div", { className: "mcb-scroll", children: _jsx("ul", { className: "mcb-list", children: skills.rows.map(row => (_jsx(SkillRowView, { row: row, busy: skills.busy[row.path] === true, expanded: expandedSkill === row.path, onToggleExpand: () => setExpandedSkill(expandedSkill === row.path ? null : row.path), onToggle: onSkillToggle, t: t }, row.path))) }) })))] })), _jsx(McpAddDialog, { open: addOpen, busy: inventory.adding, takenNames: takenNames, onClose: () => setAddOpen(false), onSubmit: onAdd, t: t }), pendingRemoval !== null && (_jsx(Modal, { open: true, onClose: () => setPendingRemoval(null), title: t('remove.title'), closeLabel: t('remove.cancel'), footer: (_jsxs("div", { className: "mcb-dialog-actions", children: [_jsx("span", { className: "mcb-spacer" }), _jsx(Button, { variant: "ghost", size: "sm", onClick: () => setPendingRemoval(null), children: t('remove.cancel') }), _jsx(Button, { variant: "primary", size: "sm", onClick: () => void confirmRemoval(), children: t('remove.confirm') })] })), children: _jsx("div", { className: "mcb-warnbox", children: t('remove.body', {
                        name: pendingRemoval.serverName || pendingRemoval.rowId,
                        rowId: pendingRemoval.rowId,
                    }) }) }))] }));
}
function ServerRow({ row, busy, expanded, onToggleExpand, onDisable, onEnable, onRestart, onRequestRemove, t }) {
    const dot = DOT_STATE[row.state];
    const stateLabel = t(STATE_KEY[row.state]);
    const toggleTitle = !row.stableId
        ? t('row.unstable.hint')
        : row.disabled ? t('row.enable') : t('row.disable');
    return (_jsxs("li", { className: "mcb-row", "data-state": row.state, children: [_jsxs("div", { className: "mcb-row-head", children: [_jsxs("label", { className: "mcb-switch", title: toggleTitle, onClick: event => event.stopPropagation(), children: [_jsx("input", { type: "checkbox", checked: !row.disabled, disabled: busy || !row.stableId, "aria-label": toggleTitle, onChange: () => { void (row.disabled ? onEnable(row.entryId) : onDisable(row.entryId)); } }), _jsx("span", { className: "mcb-switch-track" })] }), _jsxs("button", { type: "button", className: "mcb-row-main", "aria-expanded": expanded, onClick: onToggleExpand, children: [_jsx("span", { className: "mcb-chev", "data-open": expanded ? 'true' : undefined, children: _jsx(IconChevronRightOutline14, { size: 10 }) }), _jsx("span", { className: "mcb-name", title: row.entryId, children: row.serverName || row.rowId }), _jsx("span", { className: "mcb-dot-slot", title: stateLabel, "aria-label": stateLabel, children: dot === null ? _jsx("span", { className: "mcb-dot-idle" }) : _jsx(StateDot, { state: dot, size: 8 }) })] })] }), expanded && (_jsxs("div", { className: "mcb-details", children: [_jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('details.state') }), _jsxs("span", { className: "mcb-detail-value", children: [stateLabel, row.persistedDisabled && ` · ${t('row.persisted')}`] }), _jsxs("span", { className: "mcb-row-actions", children: [!row.disabled && (_jsx(Button, { variant: "outline", size: "sm", disabled: busy, onClick: () => void onRestart(row.entryId), children: busy ? t('row.working') : t('row.restart') })), row.origin === 'patch'
                                        ? (_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(IconTrashOutline16, { size: 12 }), disabled: busy, onClick: onRequestRemove, children: t('row.remove') }))
                                        : (_jsx(Tooltip, { label: t('row.foreign.hint'), children: _jsx("span", { children: _jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(IconTrashOutline16, { size: 12 }), disabled: true, children: t('row.remove') }) }) }))] })] }), row.detail !== undefined && (_jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('details.diagnosis') }), _jsx("span", { className: "mcb-detail-value mcb-diagnosis", children: row.detail })] })), _jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('details.transport') }), _jsx("span", { className: "mcb-detail-value", children: row.transport === 'stdio' ? t('transport.stdio') : t('transport.http') })] }), _jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('details.endpoint') }), _jsx("span", { className: "mcb-detail-value mcb-endpoint", title: row.endpoint, children: row.endpoint })] }), _jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('details.entry') }), _jsx("span", { className: "mcb-detail-value", children: row.rowId })] }), _jsx("div", { className: "mcb-detail-label", children: t('details.tools', { count: row.toolCount }) }), row.tools.length > 0
                        ? (_jsx("ul", { className: "mcb-toollist", children: row.tools.map(name => _jsx("li", { className: "mcb-toolitem", children: name }, name)) }))
                        : _jsx("div", { className: "mcb-detail-value", children: t('details.noTools') })] }))] }));
}
function SkillRowView({ row, busy, expanded, onToggleExpand, onToggle, t }) {
    const title = row.modelDisabled ? t('skills.enable') : t('skills.disable');
    return (_jsxs("li", { className: "mcb-row", "data-state": row.modelDisabled ? 'disabled' : undefined, children: [_jsxs("div", { className: "mcb-row-head", children: [_jsxs("label", { className: "mcb-switch", title: title, onClick: event => event.stopPropagation(), children: [_jsx("input", { type: "checkbox", checked: !row.modelDisabled, disabled: busy, "aria-label": title, onChange: () => { void onToggle(row.path, !row.modelDisabled); } }), _jsx("span", { className: "mcb-switch-track" })] }), _jsxs("button", { type: "button", className: "mcb-row-main", "aria-expanded": expanded, onClick: onToggleExpand, children: [_jsx("span", { className: "mcb-chev", "data-open": expanded ? 'true' : undefined, children: _jsx(IconChevronRightOutline14, { size: 10 }) }), _jsx("span", { className: "mcb-name", title: row.name, children: row.name }), _jsx("span", { className: "mcb-dot-slot", title: row.modelDisabled ? t('skills.state.off') : t('skills.state.on'), children: row.modelDisabled
                                    ? _jsx("span", { className: "mcb-dot-idle" })
                                    : _jsx(StateDot, { state: "done", size: 8 }) })] })] }), expanded && (_jsxs("div", { className: "mcb-details", children: [_jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('skills.desc') }), _jsx("span", { className: "mcb-detail-value", children: row.description })] }), _jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('skills.state.label') }), _jsx("span", { className: "mcb-detail-value", children: row.modelDisabled ? t('skills.state.off') : t('skills.state.on') })] }), _jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('skills.source') }), _jsx("span", { className: "mcb-detail-value", children: row.sources.map(s => s === 'user-dsh' ? '~/.dsh/skills' : '~/.agents/skills').join(' + ') })] }), _jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('skills.path') }), _jsx("span", { className: "mcb-detail-value mcb-endpoint", title: row.path, children: row.path })] }), row.flat && (_jsxs("div", { className: "mcb-detail-line", children: [_jsx("span", { className: "mcb-detail-label", children: t('skills.form') }), _jsx("span", { className: "mcb-detail-value", children: t('skills.form.flat') })] }))] }))] }));
}
//# sourceMappingURL=McpPanel.js.map