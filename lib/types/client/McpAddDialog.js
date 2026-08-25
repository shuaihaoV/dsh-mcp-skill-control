import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Add-server dialog: a primitives `Modal` hosting either a two-transport form
 * or a JSON importer. Both paths produce `McpServerSpec` values and submit
 * through the store's `add` action.
 *
 * The form mirrors mcp-client's own Config union exactly — required fields
 * inline, everything the schema defaults (env, cwd, headers, timeout,
 * failOnStartupError, reconnect) behind an "Advanced" disclosure — so a row
 * created here can express anything a hand-written cordis.patch.yml row can.
 */
import { useMemo, useState } from 'react';
import { Button, Input, Modal, Pill } from '@deepseek-ai/dsh-client-ui-primitives';
import { isValidServerName } from '../shared.js';
import { formatPairs, parseArgs, parseEnv, parseHeaders, parseImport } from './spec-parse.js';
/** One labelled form field. */
function Field({ label, hint, error, children }) {
    return (_jsxs("div", { className: "mcb-field", children: [_jsx("span", { className: "mcb-field-label", children: label }), children, error !== undefined && _jsx("span", { className: "mcb-field-error", children: error }), error === undefined && hint !== undefined && _jsx("span", { className: "mcb-field-hint", children: hint })] }));
}
/** Add-server modal. */
export function McpAddDialog({ open, busy, takenNames, onClose, onSubmit, t }) {
    const [mode, setMode] = useState('form');
    const [transport, setTransport] = useState('stdio');
    const [serverName, setServerName] = useState('');
    const [rowId, setRowId] = useState('');
    const [command, setCommand] = useState('');
    const [args, setArgs] = useState('');
    const [url, setUrl] = useState('');
    const [envText, setEnvText] = useState('');
    const [headersText, setHeadersText] = useState('');
    const [cwd, setCwd] = useState('');
    const [timeout, setTimeoutMs] = useState('');
    const [failOnStartup, setFailOnStartup] = useState(false);
    const [maxAttempts, setMaxAttempts] = useState('');
    const [advanced, setAdvanced] = useState(false);
    const [jsonText, setJsonText] = useState('');
    const [candidates, setCandidates] = useState(null);
    const [jsonFatal, setJsonFatal] = useState(undefined);
    const [submitError, setSubmitError] = useState(undefined);
    const reset = () => {
        setMode('form');
        setTransport('stdio');
        setServerName('');
        setRowId('');
        setCommand('');
        setArgs('');
        setUrl('');
        setEnvText('');
        setHeadersText('');
        setCwd('');
        setTimeoutMs('');
        setFailOnStartup(false);
        setMaxAttempts('');
        setAdvanced(false);
        setJsonText('');
        setCandidates(null);
        setJsonFatal(undefined);
        setSubmitError(undefined);
    };
    const close = () => {
        reset();
        onClose();
    };
    // ---- Inline validation ----
    const nameError = useMemo(() => {
        if (serverName === '')
            return undefined;
        if (!isValidServerName(serverName))
            return t('add.serverName.hint');
        if (takenNames.has(serverName))
            return t('add.error', { message: `serverName "${serverName}" already exists` });
        return undefined;
    }, [serverName, takenNames, t]);
    const urlError = useMemo(() => {
        if (transport !== 'streamable-http' || url === '')
            return undefined;
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
                return t('add.url.hint');
            return undefined;
        }
        catch {
            return t('add.url.hint');
        }
    }, [transport, url, t]);
    const envParsed = useMemo(() => parseEnv(envText), [envText]);
    const headersParsed = useMemo(() => parseHeaders(headersText), [headersText]);
    const formValid = serverName !== ''
        && nameError === undefined
        && (transport === 'stdio' ? command.trim() !== '' : url !== '' && urlError === undefined);
    /** Assemble the spec from the current form state. */
    const buildSpec = () => {
        const timeoutValue = Number(timeout);
        const attemptsValue = Number(maxAttempts);
        const shared = {
            serverName,
            ...rowId.trim() === '' ? {} : { rowId: rowId.trim() },
            ...timeout.trim() !== '' && Number.isFinite(timeoutValue) && timeoutValue > 0
                ? { toolCallTimeoutMs: timeoutValue }
                : {},
            ...failOnStartup ? { failOnStartupError: true } : {},
            ...maxAttempts.trim() !== '' && Number.isFinite(attemptsValue) && attemptsValue > 0
                ? { reconnect: { maxAttempts: attemptsValue } }
                : {},
        };
        if (transport === 'stdio') {
            const parsedArgs = parseArgs(args);
            return {
                ...shared,
                transport: 'stdio',
                command: command.trim(),
                ...parsedArgs.length > 0 ? { args: parsedArgs } : {},
                ...Object.keys(envParsed.values).length > 0 ? { env: envParsed.values } : {},
                ...cwd.trim() === '' ? {} : { cwd: cwd.trim() },
            };
        }
        return {
            ...shared,
            transport: 'streamable-http',
            url: url.trim(),
            ...Object.keys(headersParsed.values).length > 0 ? { headers: headersParsed.values } : {},
        };
    };
    const submitForm = async () => {
        setSubmitError(undefined);
        const result = await onSubmit(buildSpec());
        if (result.ok)
            close();
        else
            setSubmitError(result.message);
    };
    const runParse = () => {
        const outcome = parseImport(jsonText);
        setJsonFatal(outcome.fatal);
        setCandidates(outcome.fatal === undefined ? outcome.candidates : null);
        setSubmitError(undefined);
    };
    const importable = (candidates ?? []).filter(item => item.spec !== undefined);
    const submitImport = async () => {
        setSubmitError(undefined);
        let ok = 0;
        const failures = [];
        for (const candidate of importable) {
            if (candidate.spec === undefined)
                continue;
            // Sequential on purpose: each add waits for the loader to mount its row,
            // and concurrent writes to one YAML file would clobber each other.
            const result = await onSubmit(candidate.spec);
            if (result.ok)
                ok += 1;
            else
                failures.push(`${candidate.name}: ${result.message}`);
        }
        if (failures.length === 0) {
            close();
            return;
        }
        setSubmitError(`${t('add.partial', { ok, failed: failures.length })} — ${failures.join('; ')}`);
    };
    const footer = (_jsxs("div", { className: "mcb-dialog-actions", children: [_jsx("span", { className: "mcb-spacer" }), _jsx(Button, { variant: "ghost", size: "sm", onClick: close, disabled: busy, children: t('add.cancel') }), mode === 'form'
                ? (_jsx(Button, { variant: "primary", size: "sm", disabled: !formValid || busy, onClick: () => void submitForm(), children: busy ? t('add.working') : t('add.submit') }))
                : (_jsx(Button, { variant: "primary", size: "sm", disabled: importable.length === 0 || busy, onClick: () => void submitImport(), children: busy ? t('add.working') : t('add.submitAll', { count: importable.length }) }))] }));
    return (_jsx(Modal, { open: open, onClose: close, title: t('add.title'), closeLabel: t('add.cancel'), footer: footer, 
        // Widens the Modal's 380px card; the form then fills the given column.
        className: "mcb-modal", children: _jsxs("div", { className: "mcb-form", children: [_jsxs("div", { className: "mcb-tabs", children: [_jsx(Pill, { active: mode === 'form', onClick: () => setMode('form'), children: t('add.mode.form') }), _jsx(Pill, { active: mode === 'json', onClick: () => setMode('json'), children: t('add.mode.json') })] }), mode === 'form' && (_jsxs(_Fragment, { children: [_jsx(Field, { label: t('add.transport'), children: _jsxs("div", { className: "mcb-tabs", children: [_jsx(Pill, { active: transport === 'stdio', onClick: () => setTransport('stdio'), children: t('add.transport.stdio') }), _jsx(Pill, { active: transport === 'streamable-http', onClick: () => setTransport('streamable-http'), children: t('add.transport.http') })] }) }), _jsxs("div", { className: "mcb-row-2", children: [_jsx(Field, { label: t('add.serverName'), hint: t('add.serverName.hint'), error: nameError, children: _jsx(Input, { value: serverName, placeholder: "tavily", onChange: (event) => setServerName(event.target.value) }) }), _jsx(Field, { label: t('add.rowId'), hint: t('add.rowId.hint'), children: _jsx(Input, { value: rowId, placeholder: serverName === '' ? 'mcp-<name>' : `mcp-${serverName}`, onChange: (event) => setRowId(event.target.value) }) })] }), transport === 'stdio'
                            ? (_jsxs(_Fragment, { children: [_jsx(Field, { label: t('add.command'), hint: t('add.command.hint'), children: _jsx(Input, { value: command, placeholder: "npx", onChange: (event) => setCommand(event.target.value) }) }), _jsx(Field, { label: t('add.args'), hint: t('add.args.hint'), children: _jsx("textarea", { className: "mcb-textarea", value: args, placeholder: '-y\ntavily-mcp@latest', onChange: (event) => setArgs(event.target.value) }) })] }))
                            : (_jsx(Field, { label: t('add.url'), hint: t('add.url.hint'), error: urlError, children: _jsx(Input, { value: url, placeholder: "https://mcp.example.com/mcp", onChange: (event) => setUrl(event.target.value) }) })), _jsxs("button", { type: "button", className: "mcb-advanced-toggle", "aria-expanded": advanced, onClick: () => setAdvanced(value => !value), children: [_jsx("span", { children: advanced ? '▾' : '▸' }), _jsx("span", { children: t('add.advanced') })] }), advanced && (_jsxs("div", { className: "mcb-advanced", children: [transport === 'stdio'
                                    ? (_jsxs(_Fragment, { children: [_jsx(Field, { label: t('add.env'), hint: t('add.env.hint'), error: envParsed.bad.length > 0 ? `${t('add.env.hint')} — ${envParsed.bad.join(', ')}` : undefined, children: _jsx("textarea", { className: "mcb-textarea", value: envText, placeholder: "TAVILY_API_KEY=tvly-...", onChange: (event) => setEnvText(event.target.value) }) }), _jsx(Field, { label: t('add.cwd'), children: _jsx(Input, { value: cwd, placeholder: "/path/to/dir", onChange: (event) => setCwd(event.target.value) }) })] }))
                                    : (_jsx(Field, { label: t('add.headers'), hint: t('add.headers.hint'), error: headersParsed.bad.length > 0 ? `${t('add.headers.hint')} — ${headersParsed.bad.join(', ')}` : undefined, children: _jsx("textarea", { className: "mcb-textarea", value: headersText, placeholder: "Authorization: Bearer xxx", onChange: (event) => setHeadersText(event.target.value) }) })), _jsxs("div", { className: "mcb-row-2", children: [_jsx(Field, { label: t('add.timeout'), children: _jsx(Input, { value: timeout, inputMode: "numeric", placeholder: "60000", onChange: (event) => setTimeoutMs(event.target.value) }) }), _jsx(Field, { label: t('add.reconnect.attempts'), children: _jsx(Input, { value: maxAttempts, inputMode: "numeric", placeholder: "10", onChange: (event) => setMaxAttempts(event.target.value) }) })] }), _jsxs("label", { className: "mcb-check", children: [_jsx("input", { type: "checkbox", checked: failOnStartup, onChange: event => setFailOnStartup(event.target.checked) }), _jsx("span", { children: t('add.failOnStartup') })] })] }))] })), mode === 'json' && (_jsxs(_Fragment, { children: [_jsx(Field, { label: t('add.json.label'), hint: t('add.json.hint'), error: jsonFatal, children: _jsx("textarea", { className: "mcb-textarea", "data-tall": "true", value: jsonText, placeholder: '{\n  "mcpServers": {\n    "tavily": {\n      "command": "npx",\n      "args": ["-y", "tavily-mcp@latest"],\n      "env": { "TAVILY_API_KEY": "tvly-..." }\n    }\n  }\n}', onChange: event => {
                                    setJsonText(event.target.value);
                                    setCandidates(null);
                                    setJsonFatal(undefined);
                                } }) }), _jsxs("div", { className: "mcb-dialog-actions", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: runParse, children: t('add.json.parse') }), _jsx("span", { className: "mcb-spacer" }), candidates !== null && (_jsx("span", { className: "mcb-field-hint", children: t('add.json.detected', { count: importable.length }) }))] }), candidates !== null && candidates.length > 0 && (_jsx("ul", { className: "mcb-jsonlist", children: candidates.map(candidate => (_jsxs("li", { className: "mcb-jsonitem", "data-bad": candidate.spec === undefined ? 'true' : undefined, children: [_jsx("code", { children: candidate.name }), _jsx("span", { children: candidate.serverName !== undefined && candidate.serverName !== candidate.name
                                            ? _jsxs(_Fragment, { children: ["\u2192 ", _jsx("code", { children: candidate.serverName })] })
                                            : null }), _jsx("span", { children: candidate.spec === undefined
                                            ? candidate.problem
                                            : candidate.spec.transport === 'stdio'
                                                ? `stdio · ${candidate.spec.command}`
                                                : `http · ${candidate.spec.url}` })] }, candidate.name))) }))] })), submitError !== undefined && _jsx("div", { className: "mcb-field-error", children: submitError })] }) }));
}
/** Re-exported so the panel can prefill an editor later without a new import. */
export { formatPairs };
//# sourceMappingURL=McpAddDialog.js.map