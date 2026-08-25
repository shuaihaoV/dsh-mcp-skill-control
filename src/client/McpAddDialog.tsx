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

import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Button, Input, Modal, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { McpAddResult, McpServerSpec, McpTransport } from '../types.ts'
import { isValidServerName } from '../shared.ts'
import { formatPairs, parseArgs, parseEnv, parseHeaders, parseImport, type ImportCandidate } from './spec-parse.ts'
import type { McpLocaleKey } from './locales.ts'

/** Translator bound to this plugin's namespace. */
type Translate = (key: McpLocaleKey, params?: Record<string, unknown>) => string

export interface McpAddDialogProps {
  open: boolean
  busy: boolean
  /** Server names already in use, for inline duplicate detection. */
  takenNames: ReadonlySet<string>
  onClose(): void
  onSubmit(spec: McpServerSpec): Promise<McpAddResult>
  t: Translate
}

/** One labelled form field. */
function Field({ label, hint, error, children }: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="mcb-field">
      <span className="mcb-field-label">{label}</span>
      {children}
      {error !== undefined && <span className="mcb-field-error">{error}</span>}
      {error === undefined && hint !== undefined && <span className="mcb-field-hint">{hint}</span>}
    </div>
  )
}

/** Add-server modal. */
export function McpAddDialog({ open, busy, takenNames, onClose, onSubmit, t }: McpAddDialogProps) {
  const [mode, setMode] = useState<'form' | 'json'>('form')
  const [transport, setTransport] = useState<McpTransport>('stdio')
  const [serverName, setServerName] = useState('')
  const [rowId, setRowId] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [envText, setEnvText] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [cwd, setCwd] = useState('')
  const [timeout, setTimeoutMs] = useState('')
  const [failOnStartup, setFailOnStartup] = useState(false)
  const [maxAttempts, setMaxAttempts] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null)
  const [jsonFatal, setJsonFatal] = useState<string | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)

  const reset = (): void => {
    setMode('form')
    setTransport('stdio')
    setServerName('')
    setRowId('')
    setCommand('')
    setArgs('')
    setUrl('')
    setEnvText('')
    setHeadersText('')
    setCwd('')
    setTimeoutMs('')
    setFailOnStartup(false)
    setMaxAttempts('')
    setAdvanced(false)
    setJsonText('')
    setCandidates(null)
    setJsonFatal(undefined)
    setSubmitError(undefined)
  }

  const close = (): void => {
    reset()
    onClose()
  }

  // ---- Inline validation ----
  const nameError = useMemo(() => {
    if (serverName === '') return undefined
    if (!isValidServerName(serverName)) return t('add.serverName.hint')
    if (takenNames.has(serverName)) return t('add.error', { message: `serverName "${serverName}" already exists` })
    return undefined
  }, [serverName, takenNames, t])

  const urlError = useMemo(() => {
    if (transport !== 'streamable-http' || url === '') return undefined
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return t('add.url.hint')
      return undefined
    } catch {
      return t('add.url.hint')
    }
  }, [transport, url, t])

  const envParsed = useMemo(() => parseEnv(envText), [envText])
  const headersParsed = useMemo(() => parseHeaders(headersText), [headersText])

  const formValid = serverName !== ''
    && nameError === undefined
    && (transport === 'stdio' ? command.trim() !== '' : url !== '' && urlError === undefined)

  /** Assemble the spec from the current form state. */
  const buildSpec = (): McpServerSpec => {
    const timeoutValue = Number(timeout)
    const attemptsValue = Number(maxAttempts)
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
    }
    if (transport === 'stdio') {
      const parsedArgs = parseArgs(args)
      return {
        ...shared,
        transport: 'stdio',
        command: command.trim(),
        ...parsedArgs.length > 0 ? { args: parsedArgs } : {},
        ...Object.keys(envParsed.values).length > 0 ? { env: envParsed.values } : {},
        ...cwd.trim() === '' ? {} : { cwd: cwd.trim() },
      }
    }
    return {
      ...shared,
      transport: 'streamable-http',
      url: url.trim(),
      ...Object.keys(headersParsed.values).length > 0 ? { headers: headersParsed.values } : {},
    }
  }

  const submitForm = async (): Promise<void> => {
    setSubmitError(undefined)
    const result = await onSubmit(buildSpec())
    if (result.ok) close()
    else setSubmitError(result.message)
  }

  const runParse = (): void => {
    const outcome = parseImport(jsonText)
    setJsonFatal(outcome.fatal)
    setCandidates(outcome.fatal === undefined ? outcome.candidates : null)
    setSubmitError(undefined)
  }

  const importable = (candidates ?? []).filter(item => item.spec !== undefined)

  const submitImport = async (): Promise<void> => {
    setSubmitError(undefined)
    let ok = 0
    const failures: string[] = []
    for (const candidate of importable) {
      if (candidate.spec === undefined) continue
      // Sequential on purpose: each add waits for the loader to mount its row,
      // and concurrent writes to one YAML file would clobber each other.
      const result = await onSubmit(candidate.spec)
      if (result.ok) ok += 1
      else failures.push(`${candidate.name}: ${result.message}`)
    }
    if (failures.length === 0) {
      close()
      return
    }
    setSubmitError(`${t('add.partial', { ok, failed: failures.length })} — ${failures.join('; ')}`)
  }

  const footer = (
    <div className="mcb-dialog-actions">
      <span className="mcb-spacer" />
      <Button variant="ghost" size="sm" onClick={close} disabled={busy}>{t('add.cancel')}</Button>
      {mode === 'form'
        ? (
          <Button variant="primary" size="sm" disabled={!formValid || busy} onClick={() => void submitForm()}>
            {busy ? t('add.working') : t('add.submit')}
          </Button>
        )
        : (
          <Button
            variant="primary"
            size="sm"
            disabled={importable.length === 0 || busy}
            onClick={() => void submitImport()}
          >
            {busy ? t('add.working') : t('add.submitAll', { count: importable.length })}
          </Button>
        )}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('add.title')}
      closeLabel={t('add.cancel')}
      footer={footer}
      // Widens the Modal's 380px card; the form then fills the given column.
      className="mcb-modal"
    >
      <div className="mcb-form">
        <div className="mcb-tabs">
          <Pill active={mode === 'form'} onClick={() => setMode('form')}>{t('add.mode.form')}</Pill>
          <Pill active={mode === 'json'} onClick={() => setMode('json')}>{t('add.mode.json')}</Pill>
        </div>

        {mode === 'form' && (
          <>
            <Field label={t('add.transport')}>
              <div className="mcb-tabs">
                <Pill active={transport === 'stdio'} onClick={() => setTransport('stdio')}>
                  {t('add.transport.stdio')}
                </Pill>
                <Pill active={transport === 'streamable-http'} onClick={() => setTransport('streamable-http')}>
                  {t('add.transport.http')}
                </Pill>
              </div>
            </Field>

            <div className="mcb-row-2">
              <Field label={t('add.serverName')} hint={t('add.serverName.hint')} error={nameError}>
                <Input
                  value={serverName}
                  placeholder="tavily"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setServerName(event.target.value)}
                />
              </Field>
              <Field label={t('add.rowId')} hint={t('add.rowId.hint')}>
                <Input
                  value={rowId}
                  placeholder={serverName === '' ? 'mcp-<name>' : `mcp-${serverName}`}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setRowId(event.target.value)}
                />
              </Field>
            </div>

            {transport === 'stdio'
              ? (
                <>
                  <Field label={t('add.command')} hint={t('add.command.hint')}>
                    <Input value={command} placeholder="npx" onChange={(event: ChangeEvent<HTMLInputElement>) => setCommand(event.target.value)} />
                  </Field>
                  <Field label={t('add.args')} hint={t('add.args.hint')}>
                    <textarea
                      className="mcb-textarea"
                      value={args}
                      placeholder={'-y\ntavily-mcp@latest'}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setArgs(event.target.value)}
                    />
                  </Field>
                </>
              )
              : (
                <Field label={t('add.url')} hint={t('add.url.hint')} error={urlError}>
                  <Input
                    value={url}
                    placeholder="https://mcp.example.com/mcp"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)}
                  />
                </Field>
              )}

            <button
              type="button"
              className="mcb-advanced-toggle"
              aria-expanded={advanced}
              onClick={() => setAdvanced(value => !value)}
            >
              <span>{advanced ? '▾' : '▸'}</span>
              <span>{t('add.advanced')}</span>
            </button>

            {advanced && (
              <div className="mcb-advanced">
                {transport === 'stdio'
                  ? (
                    <>
                      <Field
                        label={t('add.env')}
                        hint={t('add.env.hint')}
                        error={envParsed.bad.length > 0 ? `${t('add.env.hint')} — ${envParsed.bad.join(', ')}` : undefined}
                      >
                        <textarea
                          className="mcb-textarea"
                          value={envText}
                          placeholder="TAVILY_API_KEY=tvly-..."
                          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setEnvText(event.target.value)}
                        />
                      </Field>
                      <Field label={t('add.cwd')}>
                        <Input value={cwd} placeholder="/path/to/dir" onChange={(event: ChangeEvent<HTMLInputElement>) => setCwd(event.target.value)} />
                      </Field>
                    </>
                  )
                  : (
                    <Field
                      label={t('add.headers')}
                      hint={t('add.headers.hint')}
                      error={headersParsed.bad.length > 0 ? `${t('add.headers.hint')} — ${headersParsed.bad.join(', ')}` : undefined}
                    >
                      <textarea
                        className="mcb-textarea"
                        value={headersText}
                        placeholder="Authorization: Bearer xxx"
                        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setHeadersText(event.target.value)}
                      />
                    </Field>
                  )}
                <div className="mcb-row-2">
                  <Field label={t('add.timeout')}>
                    <Input
                      value={timeout}
                      inputMode="numeric"
                      placeholder="60000"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setTimeoutMs(event.target.value)}
                    />
                  </Field>
                  <Field label={t('add.reconnect.attempts')}>
                    <Input
                      value={maxAttempts}
                      inputMode="numeric"
                      placeholder="10"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setMaxAttempts(event.target.value)}
                    />
                  </Field>
                </div>
                <label className="mcb-check">
                  <input
                    type="checkbox"
                    checked={failOnStartup}
                    onChange={event => setFailOnStartup(event.target.checked)}
                  />
                  <span>{t('add.failOnStartup')}</span>
                </label>
              </div>
            )}
          </>
        )}

        {mode === 'json' && (
          <>
            <Field label={t('add.json.label')} hint={t('add.json.hint')} error={jsonFatal}>
              <textarea
                className="mcb-textarea"
                data-tall="true"
                value={jsonText}
                placeholder={'{\n  "mcpServers": {\n    "tavily": {\n      "command": "npx",\n      "args": ["-y", "tavily-mcp@latest"],\n      "env": { "TAVILY_API_KEY": "tvly-..." }\n    }\n  }\n}'}
                onChange={event => {
                  setJsonText(event.target.value)
                  setCandidates(null)
                  setJsonFatal(undefined)
                }}
              />
            </Field>
            <div className="mcb-dialog-actions">
              <Button variant="ghost" size="sm" onClick={runParse}>{t('add.json.parse')}</Button>
              <span className="mcb-spacer" />
              {candidates !== null && (
                <span className="mcb-field-hint">{t('add.json.detected', { count: importable.length })}</span>
              )}
            </div>
            {candidates !== null && candidates.length > 0 && (
              <ul className="mcb-jsonlist">
                {candidates.map(candidate => (
                  <li
                    key={candidate.name}
                    className="mcb-jsonitem"
                    data-bad={candidate.spec === undefined ? 'true' : undefined}
                  >
                    <code>{candidate.name}</code>
                    <span>
                      {candidate.serverName !== undefined && candidate.serverName !== candidate.name
                        ? <>→ <code>{candidate.serverName}</code></>
                        : null}
                    </span>
                    <span>
                      {candidate.spec === undefined
                        ? candidate.problem
                        : candidate.spec.transport === 'stdio'
                          ? `stdio · ${candidate.spec.command}`
                          : `http · ${candidate.spec.url}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {submitError !== undefined && <div className="mcb-field-error">{submitError}</div>}
      </div>
    </Modal>
  )
}

/** Re-exported so the panel can prefill an editor later without a new import. */
export { formatPairs }
