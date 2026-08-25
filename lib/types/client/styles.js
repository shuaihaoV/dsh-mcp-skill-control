/**
 * Panel stylesheet, injected as one <style data-plugin-css> tag at apply time
 * (no bundler CSS pipeline needed).
 *
 * Scope discipline: this sheet only styles LAYOUT the primitives do not own.
 * Every interactive control (buttons, inputs, the dialog shell, status dots)
 * is a `@deepseek-ai/dsh-client-ui-primitives` component, so it arrives with
 * the app's own CSS-module classes already present in the main bundle — that
 * is what keeps this panel consistent with the GUI and with user themes.
 *
 * Colour discipline: no literal colours, and only tokens the shipped web
 * bundle actually references. This matters — the previous revision spent most
 * of its `var()` calls on names that do not exist in the design system
 * (`--dsw-alias-fill-l1`, `--dsw-alias-accent`, `--dsw-alias-danger`), so it
 * silently rendered its hardcoded hex fallbacks and ignored the active theme.
 * Verified token names used here:
 *   label:  --dsw-alias-label-primary | -secondary | -tertiary | -dimmed
 *   border: --dsw-alias-border-l1 … -l4
 *   bg:     --dsw-alias-bg-base | -bg-layer-1 | -bg-layer-2 | --dsw-specific-menu
 *   state:  --dsw-alias-state-success-primary | -error-primary | -warn-primary
 *           | -business-primary, --dsw-alias-brand-primary
 *   other:  --dsw-alias-interactive-bg-hover | -bg-active, --dsw-shadow-lv3,
 *           --dsw-font-family, --dsw-alias-scrollbar-bg-l2
 */
export const STYLE_TAG_ID = '@dsh-external/dsh-mcp-skill-control/panel.css';
export const PLUGIN_ID = '@dsh-external/dsh-mcp-skill-control';
/** Monospace stack: the design system ships no mono token. */
const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';
export const PANEL_CSS = `
.mcb-root{position:relative;display:inline-flex}
.mcb-trigger{display:inline-flex;align-items:center;justify-content:center;min-width:111px;height:32px;padding:6px 12px;gap:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;color:var(--dsw-alias-label-primary);background:transparent;font-family:var(--dsw-font-family);font-size:13px;font-weight:400;line-height:20px;cursor:pointer}
.mcb-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mcb-trigger[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover));border-color:var(--dsw-alias-border-l1)}
.mcb-trigger span,.mcb-trigger svg{flex:none}
.mcb-trigger span{white-space:nowrap}
.mcb-count{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
.mcb-count[data-degraded='true']{color:var(--dsw-alias-state-warn-primary)}

/* Fixed width so expanding a row's details never widens the panel; long
 * content (endpoints, paths, tool lists) wraps or scrolls instead. */
.mcb-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:100;box-sizing:border-box;display:flex;flex-direction:column;width:400px;max-width:min(440px,calc(100vw - 32px));padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));box-shadow:var(--dsw-shadow-lv3);font-size:12px;color:var(--dsw-alias-label-primary)}
.mcb-header{display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:0 2px}
/* Tabs sit left; the action buttons stick to the right edge. */
.mcb-header .mcb-tabbar{margin-right:auto}
.mcb-title{flex:1;font-size:13px;font-weight:600}
/* Panel tabs: segmented control between MCP and Skills management. */
.mcb-tabbar{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
.mcb-tab{appearance:none;border:0;background:transparent;padding:3px 10px;border-radius:6px;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-family);font-size:12px;font-weight:500;line-height:16px;cursor:pointer}
.mcb-tab:hover{color:var(--dsw-alias-label-primary)}
.mcb-tab[data-active='true']{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary)}
.mcb-tab:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mcb-scroll{overflow-y:auto;max-height:min(420px,calc(100vh - 180px));margin:-2px;padding:2px;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2) transparent}

.mcb-notice{color:var(--dsw-alias-label-tertiary);padding:14px 4px;text-align:center;line-height:1.5}
.mcb-error{display:flex;align-items:flex-start;gap:6px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;color:var(--dsw-alias-state-error-primary);padding:6px 8px;margin-bottom:6px;line-height:1.45;word-break:break-word}
.mcb-error-text{flex:1;min-width:0}

.mcb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.mcb-row{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.mcb-row[data-state='disabled']{opacity:.68}
.mcb-row-head{display:flex;align-items:center;gap:8px;padding:5px 8px}
.mcb-row-main{flex:1;min-width:0;display:flex;align-items:center;gap:6px;background:transparent;border:0;padding:2px;margin:-2px;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:6px}
.mcb-row-main:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mcb-name{flex:1;min-width:0;font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcb-row[data-state='disabled'] .mcb-name{color:var(--dsw-alias-label-tertiary)}
.mcb-chev{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .15s ease}
.mcb-chev[data-open='true']{transform:rotate(90deg)}
.mcb-dot-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px}
.mcb-dot-idle{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary))}

/* Switch: the design system ships no toggle primitive, so it is drawn here. */
.mcb-switch{position:relative;width:28px;height:16px;flex:none}
.mcb-switch input{position:absolute;opacity:0;width:0;height:0;margin:0}
.mcb-switch-track{position:absolute;inset:0;border-radius:999px;background:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));transition:background .15s;cursor:pointer}
.mcb-switch-track::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .15s}
.mcb-switch input:checked + .mcb-switch-track{background:var(--dsw-alias-brand-primary)}
.mcb-switch input:checked + .mcb-switch-track::after{transform:translateX(12px)}
.mcb-switch input:disabled + .mcb-switch-track{opacity:.45;cursor:not-allowed}
.mcb-switch input:focus-visible + .mcb-switch-track{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:1px}

.mcb-details{border-top:1px solid var(--dsw-alias-border-l2);padding:6px 10px 8px;font-size:11px;display:flex;flex-direction:column;gap:2px}
.mcb-detail-line{display:flex;align-items:flex-start;gap:8px;min-height:20px}
.mcb-detail-label{flex:none;min-width:56px;color:var(--dsw-alias-label-tertiary)}
.mcb-detail-value{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);word-break:break-word}
.mcb-endpoint{font-family:${MONO};user-select:text}
.mcb-diagnosis{color:var(--dsw-alias-state-warn-primary);line-height:1.45}
.mcb-row-actions{display:flex;align-items:center;gap:6px;margin-left:auto}
.mcb-toollist{list-style:none;margin:2px 0 0;padding:5px 8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base));border-radius:6px;max-height:132px;overflow-y:auto;display:flex;flex-direction:column;gap:1px}
.mcb-toolitem{font-family:${MONO};font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}

/* ---- Add dialog (inside the primitives Modal shell) ----
 * The Modal card is width:min(380px,100%) with overflow:hidden and a
 * 24px-padded body — a 332px content column. A form that declares its own
 * wider width is therefore CLIPPED on the right rather than widening the card.
 * So the width is set on the dialog itself (Modal forwards className to its
 * card) and the form merely fills whatever column it is handed. The doubled
 * class raises specificity above the CSS-module rule independently of
 * stylesheet order. */
.mcb-modal.mcb-modal{width:min(560px,calc(100vw - 48px))}
.mcb-form{display:flex;flex-direction:column;gap:10px;width:100%;min-width:0;max-height:min(60vh,520px);overflow-y:auto;overflow-x:hidden;padding:2px}
.mcb-tabs{display:flex;flex-wrap:wrap;gap:6px}
.mcb-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.mcb-field-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.mcb-field-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.45;overflow-wrap:anywhere}
.mcb-field-error{font-size:11px;color:var(--dsw-alias-state-error-primary);line-height:1.45;overflow-wrap:anywhere}
.mcb-textarea{box-sizing:border-box;display:block;width:100%;max-width:100%;min-height:64px;resize:vertical;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:${MONO};font-size:12px;line-height:1.5}
.mcb-textarea:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.mcb-textarea[data-tall='true']{min-height:180px}
/* Two-up fields fall back to one column when the card cannot host them. */
.mcb-row-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;min-width:0}
.mcb-check{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;line-height:1.45}
.mcb-check input{flex:none;margin-top:2px}
.mcb-advanced{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:10px;min-width:0}
.mcb-advanced-toggle{display:flex;align-items:center;gap:6px;background:transparent;border:0;padding:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;align-self:flex-start}
.mcb-advanced-toggle:hover{color:var(--dsw-alias-label-primary)}
.mcb-dialog-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;flex-wrap:wrap;width:100%;min-width:0}
.mcb-dialog-actions .mcb-spacer{flex:1;min-width:0}
.mcb-jsonlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;min-width:0}
.mcb-jsonitem{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);padding:3px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;min-width:0;overflow-wrap:anywhere}
.mcb-jsonitem code{font-family:${MONO}}
.mcb-jsonitem[data-bad='true']{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.mcb-warnbox{border:1px solid var(--dsw-alias-state-warn-primary);border-radius:8px;padding:6px 8px;font-size:11px;line-height:1.45;color:var(--dsw-alias-state-warn-primary);overflow-wrap:anywhere}
`;
/** Inject the panel stylesheet once per page. */
export function ensurePanelStyle(doc) {
    const existing = doc.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`);
    // Replace rather than skip: an HMR reload of the client half must be able to
    // ship updated CSS without a full page refresh.
    if (existing !== null) {
        if (existing.textContent !== PANEL_CSS)
            existing.textContent = PANEL_CSS;
        return;
    }
    const tag = doc.createElement('style');
    tag.dataset.plugin = PLUGIN_ID;
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = PANEL_CSS;
    doc.head.appendChild(tag);
}
//# sourceMappingURL=styles.js.map