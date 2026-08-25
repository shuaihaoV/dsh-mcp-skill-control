window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-mcp-skill-control",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/shared.js
		/** mcp-client's `serverName` constraint, enforced before a write. */
		const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
		/** Whether a server name satisfies mcp-client's namespace contract. */
		function isValidServerName(serverName) {
			return SERVER_NAME_PATTERN.test(serverName);
		}
		//#endregion
		//#region lib/types/client/spec-parse.js
		/**
		* Pure parsing helpers shared by the add dialog: free-text field parsers and
		* the importer for third-party MCP configuration JSON.
		*
		* The importer accepts the shapes users actually have on disk, because DSH's
		* `mcp-client` config is not what any other tool writes:
		*
		* - Claude Desktop / OpenCode / Cursor: `{ "mcpServers": { "<name>": {...} } }`
		* - a bare map of servers: `{ "<name>": {...} }`
		* - a single server object, with or without a `name`
		*
		* Per-server shapes recognised:
		* - stdio:  `{ command, args?, env?, cwd? }`  (also `type: "stdio"`)
		* - http:   `{ url | httpUrl, headers? }`     (also `type: "http"|"streamable-http"|"sse"`)
		* - OpenCode: `{ type: "local", command: [bin, ...args], environment? }`
		*
		* `sse` is recognised only to REJECT it with an actionable message: DSH's
		* mcp-client speaks stdio and Streamable HTTP only (see its Config union), so
		* silently importing an SSE endpoint would produce a row that can never
		* connect — exactly the failure mode the panel's `unreachable` state exists to
		* expose.
		*/
		/**
		* Coerce a foreign server name into a valid DSH `serverName`.
		*
		* Other tools allow names DSH cannot use verbatim: OpenCode and Claude Desktop
		* happily key servers as `"Tavily MCP"`, but mcp-client requires
		* `[A-Za-z0-9_-]{1,32}` because the name becomes part of every public tool
		* name (`mcp__<serverName>__<tool>`). Rejecting those outright made real
		* config files un-importable, so they are slugified instead.
		* @param name - the source document's server name.
		* @returns a valid serverName, or undefined when nothing usable remains.
		*/
		function slugifyServerName(name) {
			const slug = name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "");
			return slug === "" ? void 0 : slug;
		}
		/** Split an args field: one per line, or whitespace-separated on a single line. */
		function parseArgs(text) {
			const trimmed = text.trim();
			if (trimmed === "") return [];
			if (trimmed.includes("\n")) return trimmed.split("\n").map((line) => line.trim()).filter((line) => line !== "");
			return trimmed.split(/\s+/).filter((part) => part !== "");
		}
		/** Parse `KEY=VALUE` lines into a record; blank lines and `#` comments skipped. */
		function parseEnv(text) {
			const values = {};
			const bad = [];
			for (const raw of text.split("\n")) {
				const line = raw.trim();
				if (line === "" || line.startsWith("#")) continue;
				const eq = line.indexOf("=");
				if (eq <= 0) {
					bad.push(line);
					continue;
				}
				values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
			}
			return {
				values,
				bad
			};
		}
		/** Parse `Name: Value` lines into a header record. */
		function parseHeaders(text) {
			const values = {};
			const bad = [];
			for (const raw of text.split("\n")) {
				const line = raw.trim();
				if (line === "" || line.startsWith("#")) continue;
				const colon = line.indexOf(":");
				if (colon <= 0) {
					bad.push(line);
					continue;
				}
				values[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
			}
			return {
				values,
				bad
			};
		}
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function stringOf(value) {
			return typeof value === "string" && value !== "" ? value : void 0;
		}
		/** Collect a string→string map, ignoring non-string values. */
		function stringMap(value) {
			if (!isRecord(value)) return {};
			const out = {};
			for (const [key, item] of Object.entries(value)) if (typeof item === "string") out[key] = item;
			return out;
		}
		/** Collect a string array, ignoring non-strings (numbers are stringified). */
		function stringArray(value) {
			if (!Array.isArray(value)) return [];
			return value.filter((item) => typeof item === "string" || typeof item === "number").map((item) => String(item));
		}
		/** Reconnect block, when the source document carries one. */
		function reconnectOf(value) {
			if (!isRecord(value)) return void 0;
			const out = {};
			if (typeof value.enabled === "boolean") out.enabled = value.enabled;
			if (typeof value.initialDelayMs === "number") out.initialDelayMs = value.initialDelayMs;
			if (typeof value.maxDelayMs === "number") out.maxDelayMs = value.maxDelayMs;
			if (typeof value.maxAttempts === "number") out.maxAttempts = value.maxAttempts;
			return Object.keys(out).length === 0 ? void 0 : out;
		}
		/**
		* Convert one third-party server entry into a DSH spec.
		* @param name - server name from the document key or `name` field.
		* @param raw - the server object.
		* @returns a candidate carrying either a spec or a problem description.
		*/
		function candidateFrom(name, raw) {
			if (!isRecord(raw)) return {
				name,
				problem: "not a JSON object"
			};
			if (raw.disabled === true || raw.enabled === false) return {
				name,
				problem: "marked disabled in the source document"
			};
			const declared = stringOf(raw.type) ?? stringOf(raw.transport);
			if (declared === "sse") return {
				name,
				problem: "legacy SSE transport is not supported by DSH mcp-client (stdio and streamable-http only)"
			};
			const serverName = isValidServerName(name) ? name : slugifyServerName(name);
			if (serverName === void 0) return {
				name,
				problem: "name has no characters usable in a DSH serverName ([A-Za-z0-9_-])"
			};
			const url = stringOf(raw.url) ?? stringOf(raw.httpUrl) ?? stringOf(raw.endpoint);
			const commandField = raw.command;
			let command = stringOf(commandField);
			let args = stringArray(raw.args);
			if (command === void 0 && Array.isArray(commandField)) {
				const parts = stringArray(commandField);
				command = parts[0];
				if (args.length === 0) args = parts.slice(1);
			}
			const timeout = typeof raw.toolCallTimeoutMs === "number" ? raw.toolCallTimeoutMs : typeof raw.timeout === "number" ? raw.timeout : void 0;
			const reconnect = reconnectOf(raw.reconnect);
			const shared = {
				serverName,
				...timeout === void 0 ? {} : { toolCallTimeoutMs: timeout },
				...raw.failOnStartupError === true ? { failOnStartupError: true } : {},
				...reconnect === void 0 ? {} : { reconnect }
			};
			if (command !== void 0) {
				const env = {
					...stringMap(raw.env),
					...stringMap(raw.environment)
				};
				const cwd = stringOf(raw.cwd) ?? stringOf(raw.workingDirectory);
				return {
					name,
					serverName,
					spec: {
						...shared,
						transport: "stdio",
						command,
						...args.length > 0 ? { args } : {},
						...Object.keys(env).length > 0 ? { env } : {},
						...cwd === void 0 ? {} : { cwd }
					}
				};
			}
			if (url !== void 0) {
				let parsed;
				try {
					parsed = new URL(url);
				} catch {
					return {
						name,
						problem: `url "${url}" is not a valid absolute URL`
					};
				}
				if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return {
					name,
					problem: `url protocol "${parsed.protocol}" must be http or https`
				};
				const headers = {
					...stringMap(raw.headers),
					...stringMap(raw.header)
				};
				if (!(declared === "streamable-http" || declared === "http") && parsed.pathname.endsWith("/sse")) return {
					name,
					serverName,
					problem: `endpoint path "${parsed.pathname}" looks like a legacy SSE endpoint, which DSH mcp-client cannot speak — use the server's Streamable HTTP URL (often /mcp)`
				};
				return {
					name,
					serverName,
					spec: {
						...shared,
						transport: "streamable-http",
						url,
						...Object.keys(headers).length > 0 ? { headers } : {}
					}
				};
			}
			return {
				name,
				problem: "neither a command (stdio) nor a url (streamable-http) was found"
			};
		}
		/**
		* Parse pasted MCP configuration JSON into importable candidates.
		* @param text - raw JSON text from the dialog.
		* @returns candidates, or a fatal parse/shape error.
		*/
		function parseImport(text) {
			const trimmed = text.trim();
			if (trimmed === "") return {
				candidates: [],
				fatal: "paste a JSON document first"
			};
			let parsed;
			try {
				parsed = JSON.parse(trimmed);
			} catch (error) {
				return {
					candidates: [],
					fatal: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`
				};
			}
			if (!isRecord(parsed)) return {
				candidates: [],
				fatal: "the document root must be a JSON object"
			};
			const wrapper = parsed.mcpServers ?? parsed.servers ?? parsed.mcp;
			if (isRecord(wrapper)) {
				const candidates = Object.entries(wrapper).map(([name, raw]) => candidateFrom(name, raw));
				return candidates.length === 0 ? {
					candidates: [],
					fatal: "the server map is empty"
				} : { candidates };
			}
			if ("command" in parsed || "url" in parsed || "httpUrl" in parsed || "endpoint" in parsed) {
				const name = stringOf(parsed.name) ?? stringOf(parsed.serverName) ?? "";
				if (name === "") return {
					candidates: [],
					fatal: "a single server object needs a \"name\" field (or paste it under an mcpServers map)"
				};
				return { candidates: [candidateFrom(name, parsed)] };
			}
			const entries = Object.entries(parsed).filter(([, raw]) => isRecord(raw));
			if (entries.length > 0) return { candidates: entries.map(([name, raw]) => candidateFrom(name, raw)) };
			return {
				candidates: [],
				fatal: "no MCP server definitions were found in the document"
			};
		}
		//#endregion
		//#region lib/types/client/McpAddDialog.js
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
		/** One labelled form field. */
		function Field({ label, hint, error, children }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "mcb-field",
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: "mcb-field-label",
						children: label
					}),
					children,
					error !== void 0 && (0, react_jsx_runtime.jsx)("span", {
						className: "mcb-field-error",
						children: error
					}),
					error === void 0 && hint !== void 0 && (0, react_jsx_runtime.jsx)("span", {
						className: "mcb-field-hint",
						children: hint
					})
				]
			});
		}
		/** Add-server modal. */
		function McpAddDialog({ open, busy, takenNames, onClose, onSubmit, t }) {
			const [mode, setMode] = (0, react.useState)("form");
			const [transport, setTransport] = (0, react.useState)("stdio");
			const [serverName, setServerName] = (0, react.useState)("");
			const [rowId, setRowId] = (0, react.useState)("");
			const [command, setCommand] = (0, react.useState)("");
			const [args, setArgs] = (0, react.useState)("");
			const [url, setUrl] = (0, react.useState)("");
			const [envText, setEnvText] = (0, react.useState)("");
			const [headersText, setHeadersText] = (0, react.useState)("");
			const [cwd, setCwd] = (0, react.useState)("");
			const [timeout, setTimeoutMs] = (0, react.useState)("");
			const [failOnStartup, setFailOnStartup] = (0, react.useState)(false);
			const [maxAttempts, setMaxAttempts] = (0, react.useState)("");
			const [advanced, setAdvanced] = (0, react.useState)(false);
			const [jsonText, setJsonText] = (0, react.useState)("");
			const [candidates, setCandidates] = (0, react.useState)(null);
			const [jsonFatal, setJsonFatal] = (0, react.useState)(void 0);
			const [submitError, setSubmitError] = (0, react.useState)(void 0);
			const reset = () => {
				setMode("form");
				setTransport("stdio");
				setServerName("");
				setRowId("");
				setCommand("");
				setArgs("");
				setUrl("");
				setEnvText("");
				setHeadersText("");
				setCwd("");
				setTimeoutMs("");
				setFailOnStartup(false);
				setMaxAttempts("");
				setAdvanced(false);
				setJsonText("");
				setCandidates(null);
				setJsonFatal(void 0);
				setSubmitError(void 0);
			};
			const close = () => {
				reset();
				onClose();
			};
			const nameError = (0, react.useMemo)(() => {
				if (serverName === "") return void 0;
				if (!isValidServerName(serverName)) return t("add.serverName.hint");
				if (takenNames.has(serverName)) return t("add.error", { message: `serverName "${serverName}" already exists` });
			}, [
				serverName,
				takenNames,
				t
			]);
			const urlError = (0, react.useMemo)(() => {
				if (transport !== "streamable-http" || url === "") return void 0;
				try {
					const parsed = new URL(url);
					if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return t("add.url.hint");
					return;
				} catch {
					return t("add.url.hint");
				}
			}, [
				transport,
				url,
				t
			]);
			const envParsed = (0, react.useMemo)(() => parseEnv(envText), [envText]);
			const headersParsed = (0, react.useMemo)(() => parseHeaders(headersText), [headersText]);
			const formValid = serverName !== "" && nameError === void 0 && (transport === "stdio" ? command.trim() !== "" : url !== "" && urlError === void 0);
			/** Assemble the spec from the current form state. */
			const buildSpec = () => {
				const timeoutValue = Number(timeout);
				const attemptsValue = Number(maxAttempts);
				const shared = {
					serverName,
					...rowId.trim() === "" ? {} : { rowId: rowId.trim() },
					...timeout.trim() !== "" && Number.isFinite(timeoutValue) && timeoutValue > 0 ? { toolCallTimeoutMs: timeoutValue } : {},
					...failOnStartup ? { failOnStartupError: true } : {},
					...maxAttempts.trim() !== "" && Number.isFinite(attemptsValue) && attemptsValue > 0 ? { reconnect: { maxAttempts: attemptsValue } } : {}
				};
				if (transport === "stdio") {
					const parsedArgs = parseArgs(args);
					return {
						...shared,
						transport: "stdio",
						command: command.trim(),
						...parsedArgs.length > 0 ? { args: parsedArgs } : {},
						...Object.keys(envParsed.values).length > 0 ? { env: envParsed.values } : {},
						...cwd.trim() === "" ? {} : { cwd: cwd.trim() }
					};
				}
				return {
					...shared,
					transport: "streamable-http",
					url: url.trim(),
					...Object.keys(headersParsed.values).length > 0 ? { headers: headersParsed.values } : {}
				};
			};
			const submitForm = async () => {
				setSubmitError(void 0);
				const result = await onSubmit(buildSpec());
				if (result.ok) close();
				else setSubmitError(result.message);
			};
			const runParse = () => {
				const outcome = parseImport(jsonText);
				setJsonFatal(outcome.fatal);
				setCandidates(outcome.fatal === void 0 ? outcome.candidates : null);
				setSubmitError(void 0);
			};
			const importable = (candidates ?? []).filter((item) => item.spec !== void 0);
			const submitImport = async () => {
				setSubmitError(void 0);
				let ok = 0;
				const failures = [];
				for (const candidate of importable) {
					if (candidate.spec === void 0) continue;
					const result = await onSubmit(candidate.spec);
					if (result.ok) ok += 1;
					else failures.push(`${candidate.name}: ${result.message}`);
				}
				if (failures.length === 0) {
					close();
					return;
				}
				setSubmitError(`${t("add.partial", {
					ok,
					failed: failures.length
				})} — ${failures.join("; ")}`);
			};
			const footer = (0, react_jsx_runtime.jsxs)("div", {
				className: "mcb-dialog-actions",
				children: [
					(0, react_jsx_runtime.jsx)("span", { className: "mcb-spacer" }),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						size: "sm",
						onClick: close,
						disabled: busy,
						children: t("add.cancel")
					}),
					mode === "form" ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						size: "sm",
						disabled: !formValid || busy,
						onClick: () => void submitForm(),
						children: busy ? t("add.working") : t("add.submit")
					}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						size: "sm",
						disabled: importable.length === 0 || busy,
						onClick: () => void submitImport(),
						children: busy ? t("add.working") : t("add.submitAll", { count: importable.length })
					})
				]
			});
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose: close,
				title: t("add.title"),
				closeLabel: t("add.cancel"),
				footer,
				className: "mcb-modal",
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: "mcb-form",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-tabs",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: mode === "form",
								onClick: () => setMode("form"),
								children: t("add.mode.form")
							}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: mode === "json",
								onClick: () => setMode("json"),
								children: t("add.mode.json")
							})]
						}),
						mode === "form" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("add.transport"),
								children: (0, react_jsx_runtime.jsxs)("div", {
									className: "mcb-tabs",
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
										active: transport === "stdio",
										onClick: () => setTransport("stdio"),
										children: t("add.transport.stdio")
									}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
										active: transport === "streamable-http",
										onClick: () => setTransport("streamable-http"),
										children: t("add.transport.http")
									})]
								})
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "mcb-row-2",
								children: [(0, react_jsx_runtime.jsx)(Field, {
									label: t("add.serverName"),
									hint: t("add.serverName.hint"),
									error: nameError,
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										value: serverName,
										placeholder: "tavily",
										onChange: (event) => setServerName(event.target.value)
									})
								}), (0, react_jsx_runtime.jsx)(Field, {
									label: t("add.rowId"),
									hint: t("add.rowId.hint"),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										value: rowId,
										placeholder: serverName === "" ? "mcp-<name>" : `mcp-${serverName}`,
										onChange: (event) => setRowId(event.target.value)
									})
								})]
							}),
							transport === "stdio" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Field, {
								label: t("add.command"),
								hint: t("add.command.hint"),
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									value: command,
									placeholder: "npx",
									onChange: (event) => setCommand(event.target.value)
								})
							}), (0, react_jsx_runtime.jsx)(Field, {
								label: t("add.args"),
								hint: t("add.args.hint"),
								children: (0, react_jsx_runtime.jsx)("textarea", {
									className: "mcb-textarea",
									value: args,
									placeholder: "-y\ntavily-mcp@latest",
									onChange: (event) => setArgs(event.target.value)
								})
							})] }) : (0, react_jsx_runtime.jsx)(Field, {
								label: t("add.url"),
								hint: t("add.url.hint"),
								error: urlError,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									value: url,
									placeholder: "https://mcp.example.com/mcp",
									onChange: (event) => setUrl(event.target.value)
								})
							}),
							(0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "mcb-advanced-toggle",
								"aria-expanded": advanced,
								onClick: () => setAdvanced((value) => !value),
								children: [(0, react_jsx_runtime.jsx)("span", { children: advanced ? "▾" : "▸" }), (0, react_jsx_runtime.jsx)("span", { children: t("add.advanced") })]
							}),
							advanced && (0, react_jsx_runtime.jsxs)("div", {
								className: "mcb-advanced",
								children: [
									transport === "stdio" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Field, {
										label: t("add.env"),
										hint: t("add.env.hint"),
										error: envParsed.bad.length > 0 ? `${t("add.env.hint")} — ${envParsed.bad.join(", ")}` : void 0,
										children: (0, react_jsx_runtime.jsx)("textarea", {
											className: "mcb-textarea",
											value: envText,
											placeholder: "TAVILY_API_KEY=tvly-...",
											onChange: (event) => setEnvText(event.target.value)
										})
									}), (0, react_jsx_runtime.jsx)(Field, {
										label: t("add.cwd"),
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											value: cwd,
											placeholder: "/path/to/dir",
											onChange: (event) => setCwd(event.target.value)
										})
									})] }) : (0, react_jsx_runtime.jsx)(Field, {
										label: t("add.headers"),
										hint: t("add.headers.hint"),
										error: headersParsed.bad.length > 0 ? `${t("add.headers.hint")} — ${headersParsed.bad.join(", ")}` : void 0,
										children: (0, react_jsx_runtime.jsx)("textarea", {
											className: "mcb-textarea",
											value: headersText,
											placeholder: "Authorization: Bearer xxx",
											onChange: (event) => setHeadersText(event.target.value)
										})
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										className: "mcb-row-2",
										children: [(0, react_jsx_runtime.jsx)(Field, {
											label: t("add.timeout"),
											children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												value: timeout,
												inputMode: "numeric",
												placeholder: "60000",
												onChange: (event) => setTimeoutMs(event.target.value)
											})
										}), (0, react_jsx_runtime.jsx)(Field, {
											label: t("add.reconnect.attempts"),
											children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												value: maxAttempts,
												inputMode: "numeric",
												placeholder: "10",
												onChange: (event) => setMaxAttempts(event.target.value)
											})
										})]
									}),
									(0, react_jsx_runtime.jsxs)("label", {
										className: "mcb-check",
										children: [(0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: failOnStartup,
											onChange: (event) => setFailOnStartup(event.target.checked)
										}), (0, react_jsx_runtime.jsx)("span", { children: t("add.failOnStartup") })]
									})
								]
							})
						] }),
						mode === "json" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsx)(Field, {
								label: t("add.json.label"),
								hint: t("add.json.hint"),
								error: jsonFatal,
								children: (0, react_jsx_runtime.jsx)("textarea", {
									className: "mcb-textarea",
									"data-tall": "true",
									value: jsonText,
									placeholder: "{\n  \"mcpServers\": {\n    \"tavily\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"tavily-mcp@latest\"],\n      \"env\": { \"TAVILY_API_KEY\": \"tvly-...\" }\n    }\n  }\n}",
									onChange: (event) => {
										setJsonText(event.target.value);
										setCandidates(null);
										setJsonFatal(void 0);
									}
								})
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "mcb-dialog-actions",
								children: [
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										onClick: runParse,
										children: t("add.json.parse")
									}),
									(0, react_jsx_runtime.jsx)("span", { className: "mcb-spacer" }),
									candidates !== null && (0, react_jsx_runtime.jsx)("span", {
										className: "mcb-field-hint",
										children: t("add.json.detected", { count: importable.length })
									})
								]
							}),
							candidates !== null && candidates.length > 0 && (0, react_jsx_runtime.jsx)("ul", {
								className: "mcb-jsonlist",
								children: candidates.map((candidate) => (0, react_jsx_runtime.jsxs)("li", {
									className: "mcb-jsonitem",
									"data-bad": candidate.spec === void 0 ? "true" : void 0,
									children: [
										(0, react_jsx_runtime.jsx)("code", { children: candidate.name }),
										(0, react_jsx_runtime.jsx)("span", { children: candidate.serverName !== void 0 && candidate.serverName !== candidate.name ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: ["→ ", (0, react_jsx_runtime.jsx)("code", { children: candidate.serverName })] }) : null }),
										(0, react_jsx_runtime.jsx)("span", { children: candidate.spec === void 0 ? candidate.problem : candidate.spec.transport === "stdio" ? `stdio · ${candidate.spec.command}` : `http · ${candidate.spec.url}` })
									]
								}, candidate.name))
							})
						] }),
						submitError !== void 0 && (0, react_jsx_runtime.jsx)("div", {
							className: "mcb-field-error",
							children: submitError
						})
					]
				})
			});
		}
		//#endregion
		//#region lib/types/client/McpPanel.js
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
		const STATE_KEY = {
			connected: "state.connected",
			connecting: "state.connecting",
			unreachable: "state.unreachable",
			failed: "state.failed",
			disabled: "state.disabled"
		};
		/**
		* Map an MCP state onto the design system's four dot states. `disabled` has no
		* StateDot equivalent (the set is done/warning/ongoing/error), so it renders a
		* neutral dot from tokens instead.
		*/
		const DOT_STATE = {
			connected: "done",
			connecting: "ongoing",
			unreachable: "warning",
			failed: "error",
			disabled: null
		};
		/** Header capsule trigger + dropdown panel (MCP servers and Skills tabs). */
		function McpPanel(props) {
			const { t, useInventory, useSkills, onDisable, onEnable, onRestart, onRemove, onAdd, onSkillToggle, onSkillReveal, onRefresh, onDismissError } = props;
			const inventory = useInventory((snapshot) => snapshot);
			const skills = useSkills((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [tab, setTab] = (0, react.useState)("mcp");
			const [expanded, setExpanded] = (0, react.useState)(null);
			const [expandedSkill, setExpandedSkill] = (0, react.useState)(null);
			const [addOpen, setAddOpen] = (0, react.useState)(false);
			const [pendingRemoval, setPendingRemoval] = (0, react.useState)(null);
			const rootRef = (0, react.useRef)(null);
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open && !addOpen && pendingRemoval === null, setOpen);
			const { rows } = inventory;
			const takenNames = (0, react.useMemo)(() => new Set(rows.map((row) => row.serverName)), [rows]);
			const confirmRemoval = async () => {
				const row = pendingRemoval;
				if (row === null) return;
				setPendingRemoval(null);
				await onRemove(row.entryId);
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "mcb-root",
				children: [
					(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "mcb-trigger",
						"aria-expanded": open,
						onClick: () => {
							setOpen((value) => !value);
							if (!open) onRefresh();
						},
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 12 }), (0, react_jsx_runtime.jsx)("span", { children: t("trigger.label") })]
					}),
					open && (0, react_jsx_runtime.jsxs)("div", {
						className: "mcb-panel",
						role: "dialog",
						"aria-label": t("panel.title"),
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: "mcb-header",
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: "mcb-tabbar",
										role: "tablist",
										children: [(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											role: "tab",
											"aria-selected": tab === "mcp",
											className: "mcb-tab",
											"data-active": tab === "mcp" ? "true" : void 0,
											onClick: () => setTab("mcp"),
											children: t("tab.mcp")
										}), (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											role: "tab",
											"aria-selected": tab === "skills",
											className: "mcb-tab",
											"data-active": tab === "skills" ? "true" : void 0,
											onClick: () => setTab("skills"),
											children: t("tab.skills")
										})]
									}),
									tab === "mcp" && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 12 }),
										onClick: () => setAddOpen(true),
										children: t("panel.add")
									}),
									tab === "skills" && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutline16, { size: 12 }),
										onClick: () => {
											onSkillReveal();
										},
										children: t("skills.reveal")
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, { size: 11 }),
										onClick: onRefresh,
										children: t("panel.refresh")
									})
								]
							}),
							inventory.actionError !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
								className: "mcb-error",
								role: "alert",
								children: [
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, { size: 12 }),
									(0, react_jsx_runtime.jsx)("span", {
										className: "mcb-error-text",
										children: t("panel.actionError", { message: inventory.actionError })
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										onClick: onDismissError,
										children: t("panel.dismiss")
									})
								]
							}),
							inventory.read && inventory.error !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
								className: "mcb-error",
								role: "alert",
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, { size: 12 }), (0, react_jsx_runtime.jsx)("span", {
									className: "mcb-error-text",
									children: t("panel.error", { message: inventory.error })
								})]
							}),
							tab === "mcp" && (!inventory.read ? (0, react_jsx_runtime.jsx)("div", {
								className: "mcb-notice",
								children: t("panel.loading")
							}) : inventory.error === void 0 && rows.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
								className: "mcb-notice",
								children: t("panel.empty")
							}) : rows.length > 0 && (0, react_jsx_runtime.jsx)("div", {
								className: "mcb-scroll",
								children: (0, react_jsx_runtime.jsx)("ul", {
									className: "mcb-list",
									children: rows.map((row) => (0, react_jsx_runtime.jsx)(ServerRow, {
										row,
										busy: inventory.busy[row.entryId] === true,
										expanded: expanded === row.entryId,
										onToggleExpand: () => setExpanded(expanded === row.entryId ? null : row.entryId),
										onDisable,
										onEnable,
										onRestart,
										onRequestRemove: () => setPendingRemoval(row),
										t
									}, row.entryId))
								})
							})),
							tab === "skills" && (!skills.read ? (0, react_jsx_runtime.jsx)("div", {
								className: "mcb-notice",
								children: t("panel.loading")
							}) : skills.rows.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
								className: "mcb-notice",
								children: t("skills.empty")
							}) : (0, react_jsx_runtime.jsx)("div", {
								className: "mcb-scroll",
								children: (0, react_jsx_runtime.jsx)("ul", {
									className: "mcb-list",
									children: skills.rows.map((row) => (0, react_jsx_runtime.jsx)(SkillRowView, {
										row,
										busy: skills.busy[row.path] === true,
										expanded: expandedSkill === row.path,
										onToggleExpand: () => setExpandedSkill(expandedSkill === row.path ? null : row.path),
										onToggle: onSkillToggle,
										t
									}, row.path))
								})
							}))
						]
					}),
					(0, react_jsx_runtime.jsx)(McpAddDialog, {
						open: addOpen,
						busy: inventory.adding,
						takenNames,
						onClose: () => setAddOpen(false),
						onSubmit: onAdd,
						t
					}),
					pendingRemoval !== null && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: true,
						onClose: () => setPendingRemoval(null),
						title: t("remove.title"),
						closeLabel: t("remove.cancel"),
						footer: (0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-dialog-actions",
							children: [
								(0, react_jsx_runtime.jsx)("span", { className: "mcb-spacer" }),
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									size: "sm",
									onClick: () => setPendingRemoval(null),
									children: t("remove.cancel")
								}),
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									size: "sm",
									onClick: () => void confirmRemoval(),
									children: t("remove.confirm")
								})
							]
						}),
						children: (0, react_jsx_runtime.jsx)("div", {
							className: "mcb-warnbox",
							children: t("remove.body", {
								name: pendingRemoval.serverName || pendingRemoval.rowId,
								rowId: pendingRemoval.rowId
							})
						})
					})
				]
			});
		}
		function ServerRow({ row, busy, expanded, onToggleExpand, onDisable, onEnable, onRestart, onRequestRemove, t }) {
			const dot = DOT_STATE[row.state];
			const stateLabel = t(STATE_KEY[row.state]);
			const toggleTitle = !row.stableId ? t("row.unstable.hint") : row.disabled ? t("row.enable") : t("row.disable");
			return (0, react_jsx_runtime.jsxs)("li", {
				className: "mcb-row",
				"data-state": row.state,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: "mcb-row-head",
					children: [(0, react_jsx_runtime.jsxs)("label", {
						className: "mcb-switch",
						title: toggleTitle,
						onClick: (event) => event.stopPropagation(),
						children: [(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: !row.disabled,
							disabled: busy || !row.stableId,
							"aria-label": toggleTitle,
							onChange: () => {
								row.disabled ? onEnable(row.entryId) : onDisable(row.entryId);
							}
						}), (0, react_jsx_runtime.jsx)("span", { className: "mcb-switch-track" })]
					}), (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "mcb-row-main",
						"aria-expanded": expanded,
						onClick: onToggleExpand,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-chev",
								"data-open": expanded ? "true" : void 0,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 10 })
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-name",
								title: row.entryId,
								children: row.serverName || row.rowId
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-dot-slot",
								title: stateLabel,
								"aria-label": stateLabel,
								children: dot === null ? (0, react_jsx_runtime.jsx)("span", { className: "mcb-dot-idle" }) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
									state: dot,
									size: 8
								})
							})
						]
					})]
				}), expanded && (0, react_jsx_runtime.jsxs)("div", {
					className: "mcb-details",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: "mcb-detail-label",
									children: t("details.state")
								}),
								(0, react_jsx_runtime.jsxs)("span", {
									className: "mcb-detail-value",
									children: [stateLabel, row.persistedDisabled && ` · ${t("row.persisted")}`]
								}),
								(0, react_jsx_runtime.jsxs)("span", {
									className: "mcb-row-actions",
									children: [!row.disabled && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										size: "sm",
										disabled: busy,
										onClick: () => void onRestart(row.entryId),
										children: busy ? t("row.working") : t("row.restart")
									}), row.origin === "patch" ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 12 }),
										disabled: busy,
										onClick: onRequestRemove,
										children: t("row.remove")
									}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
										label: t("row.foreign.hint"),
										children: (0, react_jsx_runtime.jsx)("span", { children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 12 }),
											disabled: true,
											children: t("row.remove")
										}) })
									})]
								})
							]
						}),
						row.detail !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("details.diagnosis")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value mcb-diagnosis",
								children: row.detail
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("details.transport")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value",
								children: row.transport === "stdio" ? t("transport.stdio") : t("transport.http")
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("details.endpoint")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value mcb-endpoint",
								title: row.endpoint,
								children: row.endpoint
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("details.entry")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value",
								children: row.rowId
							})]
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: "mcb-detail-label",
							children: t("details.tools", { count: row.toolCount })
						}),
						row.tools.length > 0 ? (0, react_jsx_runtime.jsx)("ul", {
							className: "mcb-toollist",
							children: row.tools.map((name) => (0, react_jsx_runtime.jsx)("li", {
								className: "mcb-toolitem",
								children: name
							}, name))
						}) : (0, react_jsx_runtime.jsx)("div", {
							className: "mcb-detail-value",
							children: t("details.noTools")
						})
					]
				})]
			});
		}
		function SkillRowView({ row, busy, expanded, onToggleExpand, onToggle, t }) {
			const title = row.modelDisabled ? t("skills.enable") : t("skills.disable");
			return (0, react_jsx_runtime.jsxs)("li", {
				className: "mcb-row",
				"data-state": row.modelDisabled ? "disabled" : void 0,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: "mcb-row-head",
					children: [(0, react_jsx_runtime.jsxs)("label", {
						className: "mcb-switch",
						title,
						onClick: (event) => event.stopPropagation(),
						children: [(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: !row.modelDisabled,
							disabled: busy,
							"aria-label": title,
							onChange: () => {
								onToggle(row.path, !row.modelDisabled);
							}
						}), (0, react_jsx_runtime.jsx)("span", { className: "mcb-switch-track" })]
					}), (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "mcb-row-main",
						"aria-expanded": expanded,
						onClick: onToggleExpand,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-chev",
								"data-open": expanded ? "true" : void 0,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 10 })
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-name",
								title: row.name,
								children: row.name
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-dot-slot",
								title: row.modelDisabled ? t("skills.state.off") : t("skills.state.on"),
								children: row.modelDisabled ? (0, react_jsx_runtime.jsx)("span", { className: "mcb-dot-idle" }) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
									state: "done",
									size: 8
								})
							})
						]
					})]
				}), expanded && (0, react_jsx_runtime.jsxs)("div", {
					className: "mcb-details",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("skills.desc")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value",
								children: row.description
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("skills.state.label")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value",
								children: row.modelDisabled ? t("skills.state.off") : t("skills.state.on")
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("skills.source")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value",
								children: row.sources.map((s) => s === "user-dsh" ? "~/.dsh/skills" : "~/.agents/skills").join(" + ")
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("skills.path")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value mcb-endpoint",
								title: row.path,
								children: row.path
							})]
						}),
						row.flat && (0, react_jsx_runtime.jsxs)("div", {
							className: "mcb-detail-line",
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-label",
								children: t("skills.form")
							}), (0, react_jsx_runtime.jsx)("span", {
								className: "mcb-detail-value",
								children: t("skills.form.flat")
							})]
						})
					]
				})]
			});
		}
		//#endregion
		//#region lib/types/client/port.js
		/**
		* Browser-side port: call the Host MCP manager through the typed /api RPC
		* channel (primary) or the plugin's fallback plain-HTTP route (when the
		* gateway has not discovered the namespace, e.g. older dsh builds).
		*/
		/** RPC failure carrying the gateway's error code for fallback decisions. */
		var RpcFailure = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "RpcFailure";
			}
		};
		/** Create the panel's Host port. */
		function createPort(ctx) {
			const connection = ctx.get("connection");
			async function call(method, args) {
				try {
					const result = await connection.rpc.call("/api", `mcpManager/${method}`, { args });
					if (result.ok) return result.value;
					throw new RpcFailure(result.error.code, result.error.message);
				} catch (error) {
					if (error instanceof RpcFailure && error.code !== "invocation-unavailable") throw error;
					const fallback = await fetchFallback(method, args);
					if (!fallback.ok) throw new RpcFailure(fallback.error.code, fallback.error.message);
					return fallback.value;
				}
			}
			return {
				list: () => call("list", {}),
				disable: (entryId) => call("disable", { entryId }),
				enable: (entryId) => call("enable", { entryId }),
				restart: (entryId) => call("restart", { entryId }),
				remove: (entryId) => call("remove", { entryId }),
				add: (spec) => call("add", { spec }),
				skillList: () => call("skillList", {}),
				skillSetDisabled: (path, disabled) => call("skillSetDisabled", {
					path,
					disabled
				}),
				skillReveal: (path) => call("skillReveal", { path })
			};
		}
		/** Plain-HTTP fallback against the webServer route registered by the Host half. */
		async function fetchFallback(method, args) {
			const response = await fetch(`/mcp-manager/api/${method}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(args)
			});
			if (!response.ok) throw new RpcFailure("transport", `fallback route failed: HTTP ${response.status}`);
			return await response.json();
		}
		//#endregion
		//#region lib/types/client/store.js
		/**
		* Panel store: one observable snapshot (rows + read state + per-row busy
		* flags) driven by polling and post-action refreshes. The renderer binds it
		* as a `useInventory` hook from the inject hooks compartment.
		*
		* Two bugs in the previous revision shaped this design:
		*
		* 1. Busy flags were rebuilt from a stale closure (`{...snapshot.busy}` read
		*    in a `finally` that ran after `refresh()` had already replaced the
		*    snapshot), so concurrent operations could resurrect a cleared flag or
		*    drop a live one. Busy state is now kept in a mutable Set that is the
		*    single source of truth and projected into each snapshot.
		* 2. A failed action set `error` and then immediately called `refresh()`,
		*    whose success path built a fresh snapshot WITHOUT the error — so the
		*    reason for the failure vanished before it could be read. Read failures
		*    and action failures are therefore separate fields with separate
		*    lifetimes: `error` (transport/read) clears on the next good read, while
		*    `actionError` persists until dismissed or superseded.
		*/
		const EMPTY = {
			read: false,
			rows: [],
			busy: {},
			adding: false
		};
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/**
		* Create the inventory store. Polling is owned by the caller (apply), which
		* drives refresh() on an interval and on lifecycle events.
		* @param port - Host RPC port.
		* @param onError - sink for unexpected failures (console diagnostics).
		* @returns the inventory store.
		*/
		function createMcpInventory(port, onError) {
			let snapshot = EMPTY;
			const listeners = /* @__PURE__ */ new Set();
			const busy = /* @__PURE__ */ new Set();
			let adding = 0;
			const emit = () => {
				for (const fn of [...listeners]) fn();
			};
			/** Project the mutable busy/adding state into a snapshot patch. */
			const flags = () => ({
				busy: Object.fromEntries([...busy].map((id) => [id, true])),
				adding: adding > 0
			});
			const set = (next) => {
				snapshot = {
					...next,
					...flags()
				};
				emit();
			};
			/** Re-emit with current flags, preserving the rest of the snapshot. */
			const touch = () => {
				snapshot = {
					...snapshot,
					...flags()
				};
				emit();
			};
			async function refresh() {
				try {
					const rows = await port.list();
					set({
						read: true,
						rows,
						...snapshot.actionError === void 0 ? {} : { actionError: snapshot.actionError }
					});
				} catch (error) {
					onError(error);
					set({
						read: true,
						rows: snapshot.rows,
						error: messageOf(error),
						...snapshot.actionError === void 0 ? {} : { actionError: snapshot.actionError }
					});
				}
			}
			/** Record an action failure so it survives the refresh that follows. */
			const failAction = (message) => {
				set({
					read: snapshot.read,
					rows: snapshot.rows,
					...snapshot.error === void 0 ? {} : { error: snapshot.error },
					actionError: message
				});
			};
			async function act(entryId, op) {
				busy.add(entryId);
				touch();
				try {
					const result = await op();
					if (!result.ok) failAction(result.message);
					return result;
				} catch (error) {
					const message = messageOf(error);
					failAction(message);
					return {
						ok: false,
						reason: "transport",
						message
					};
				} finally {
					busy.delete(entryId);
					await refresh();
				}
			}
			return {
				getSnapshot: () => snapshot,
				subscribe(fn) {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				},
				refresh,
				disable: (entryId) => act(entryId, () => port.disable(entryId)),
				enable: (entryId) => act(entryId, () => port.enable(entryId)),
				restart: (entryId) => act(entryId, () => port.restart(entryId)),
				remove: (entryId) => act(entryId, () => port.remove(entryId)),
				async add(spec) {
					adding += 1;
					touch();
					try {
						const result = await port.add(spec);
						if (!result.ok) failAction(result.message);
						return result;
					} catch (error) {
						const message = messageOf(error);
						failAction(message);
						return {
							ok: false,
							reason: "transport",
							message
						};
					} finally {
						adding -= 1;
						await refresh();
					}
				},
				reportActionError: (message) => failAction(message),
				clearActionError() {
					if (snapshot.actionError === void 0) return;
					set({
						read: snapshot.read,
						rows: snapshot.rows,
						...snapshot.error === void 0 ? {} : { error: snapshot.error }
					});
				},
				reset() {
					busy.clear();
					adding = 0;
					snapshot = EMPTY;
					emit();
				}
			};
		}
		const SKILL_EMPTY = {
			read: false,
			rows: [],
			busy: {}
		};
		/**
		* Create the skills inventory store. Mirrors the MCP store's design: busy
		* state lives in a mutable Set (single source of truth), and read errors
		* clear on the next good read. Action failures are surfaced through the MCP
		* store's sticky actionError banner via the shared onError sink.
		* @param port - Host RPC port.
		* @param onActionError - sink for action failures (the shared banner).
		* @returns the skills inventory store.
		*/
		function createSkillInventory(port, onActionError) {
			let snapshot = SKILL_EMPTY;
			const listeners = /* @__PURE__ */ new Set();
			const busy = /* @__PURE__ */ new Set();
			const emit = () => {
				for (const fn of [...listeners]) fn();
			};
			const set = (next) => {
				snapshot = {
					...next,
					busy: Object.fromEntries([...busy].map((p) => [p, true]))
				};
				emit();
			};
			const touch = () => {
				snapshot = {
					...snapshot,
					busy: Object.fromEntries([...busy].map((p) => [p, true]))
				};
				emit();
			};
			async function refresh() {
				try {
					const rows = await port.skillList();
					set({
						read: true,
						rows
					});
				} catch {
					set({
						read: true,
						rows: snapshot.rows,
						...snapshot.error === void 0 ? {} : { error: snapshot.error }
					});
				}
			}
			async function setDisabled(path, disabled) {
				busy.add(path);
				touch();
				try {
					const result = await port.skillSetDisabled(path, disabled);
					if (!result.ok) onActionError(result.message);
					return result;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					onActionError(message);
					return {
						ok: false,
						reason: "transport",
						message
					};
				} finally {
					busy.delete(path);
					await refresh();
				}
			}
			return {
				getSnapshot: () => snapshot,
				subscribe(fn) {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				},
				refresh,
				setDisabled,
				reset() {
					busy.clear();
					snapshot = SKILL_EMPTY;
					emit();
				}
			};
		}
		//#endregion
		//#region lib/types/client/styles.js
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
		const STYLE_TAG_ID = "@dsh-external/dsh-mcp-skill-control/panel.css";
		const PLUGIN_ID = "@dsh-external/dsh-mcp-skill-control";
		/** Monospace stack: the design system ships no mono token. */
		const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
		const PANEL_CSS = `
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
		function ensurePanelStyle(doc) {
			const existing = doc.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`);
			if (existing !== null) {
				if (existing.textContent !== PANEL_CSS) existing.textContent = PANEL_CSS;
				return;
			}
			const tag = doc.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.dataset.pluginCss = STYLE_TAG_ID;
			tag.textContent = PANEL_CSS;
			doc.head.appendChild(tag);
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** MCP control-bar UI dictionaries (zh primary, en mirror). */
		const NS = "mcp-control-bar";
		/** Simplified Chinese panel texts. */
		const zh = {
			"trigger.label": "工具/技能",
			"panel.title": "MCP 服务器",
			"panel.refresh": "刷新",
			"panel.add": "添加",
			"panel.loading": "读取中…",
			"panel.empty": "未发现 MCP 服务器——点「添加」新建一个",
			"panel.error": "读取失败：{message}",
			"panel.actionError": "操作失败：{message}",
			"panel.dismiss": "关闭",
			"state.connected": "已连接",
			"state.connecting": "连接中",
			"state.unreachable": "不可达",
			"state.failed": "失败",
			"state.disabled": "已停用",
			"row.disable": "停用（写入配置，重启后保持）",
			"row.enable": "启用（移除配置覆盖）",
			"row.restart": "重启",
			"row.remove": "删除",
			"row.persisted": "重启保持",
			"row.persisted.hint": "停用状态已写入 cordis.patch.yml，重启 DSH 后仍然停用",
			"row.working": "处理中…",
			"row.foreign.hint": "该行由 bundle 层定义，patch 语法无法删除——只能停用",
			"row.unstable.hint": "该行没有稳定 id，无法写入持久配置——请先在 cordis.patch.yml 为它指定 id",
			"details.state": "状态",
			"details.transport": "传输",
			"details.endpoint": "端点",
			"details.entry": "行 id",
			"details.tools": "工具（{count}）",
			"details.noTools": "无已注册工具",
			"details.diagnosis": "诊断",
			"transport.stdio": "stdio",
			"transport.http": "streamable-http",
			"remove.title": "删除 MCP 服务器",
			"remove.body": "将从 cordis.patch.yml 永久删除「{name}」（行 id：{rowId}）。此操作不可撤销，配置内容不会保留。",
			"remove.confirm": "确认删除",
			"remove.cancel": "取消",
			"add.title": "添加 MCP 服务器",
			"add.mode.form": "表单",
			"add.mode.json": "JSON 导入",
			"add.transport": "调用方式",
			"add.transport.stdio": "本地命令（stdio）",
			"add.transport.http": "远程 URL（streamable-http）",
			"add.serverName": "服务器名",
			"add.serverName.hint": "工具前缀为 mcp__<名称>__，限 [A-Za-z0-9_-]，最长 32",
			"add.rowId": "行 id（可选）",
			"add.rowId.hint": "留空则自动生成 mcp-<服务器名>",
			"add.command": "命令",
			"add.command.hint": "如 npx、uvx、docker 或可执行文件绝对路径",
			"add.args": "参数",
			"add.args.hint": "每行一个，或用空格分隔（不做 shell 解析）",
			"add.env": "环境变量",
			"add.env.hint": "每行 KEY=VALUE",
			"add.cwd": "工作目录",
			"add.url": "端点 URL",
			"add.url.hint": "必须是 http/https 绝对地址；DSH 不支持传统 SSE 传输",
			"add.headers": "请求头",
			"add.headers.hint": "每行 Name: Value（鉴权信息写在这里）",
			"add.advanced": "高级选项",
			"add.timeout": "单次调用超时（ms）",
			"add.failOnStartup": "启动连接失败时使插件加载失败",
			"add.reconnect": "自动重连",
			"add.reconnect.attempts": "最大尝试次数",
			"add.json.label": "粘贴 MCP 配置 JSON",
			"add.json.hint": "支持 Claude Desktop / OpenCode 的 mcpServers 格式，或单个服务器对象",
			"add.json.parse": "解析",
			"add.json.detected": "已识别 {count} 个服务器",
			"add.submit": "添加",
			"add.submitAll": "添加全部（{count}）",
			"add.cancel": "取消",
			"add.working": "添加中…",
			"add.error": "{message}",
			"add.done": "已添加 {name}",
			"add.partial": "成功 {ok} 个，失败 {failed} 个",
			"tab.mcp": "MCP",
			"tab.skills": "Skills",
			"skills.empty": "用户目录下未发现 skill（~/.dsh/skills、~/.agents/skills）",
			"skills.disable": "停用（模型不再加载该 skill；“/” 菜单仍可手动调用）",
			"skills.enable": "启用（恢复模型自动加载）",
			"skills.state.on": "已启用",
			"skills.state.off": "已停用",
			"skills.state.label": "状态",
			"skills.desc": "描述",
			"skills.source": "来源",
			"skills.path": "路径",
			"skills.form": "形态",
			"skills.form.flat": "扁平 .md 文件",
			"skills.reveal": "查看"
		};
		/** English panel texts. */
		const en = {
			"trigger.label": "Tools/Skills",
			"panel.title": "MCP Servers",
			"panel.refresh": "Refresh",
			"panel.add": "Add",
			"panel.loading": "Loading…",
			"panel.empty": "No MCP servers found — use “Add” to create one",
			"panel.error": "Read failed: {message}",
			"panel.actionError": "Action failed: {message}",
			"panel.dismiss": "Dismiss",
			"state.connected": "connected",
			"state.connecting": "connecting",
			"state.unreachable": "unreachable",
			"state.failed": "failed",
			"state.disabled": "disabled",
			"row.disable": "Disable (written to config, persists across restarts)",
			"row.enable": "Enable (remove the config override)",
			"row.restart": "Restart",
			"row.remove": "Remove",
			"row.persisted": "persisted",
			"row.persisted.hint": "The disabled state is written into cordis.patch.yml and survives DSH restarts",
			"row.working": "Working…",
			"row.foreign.hint": "This row comes from a bundle layer; the patch grammar cannot delete it — disable it instead",
			"row.unstable.hint": "This row has no stable id, so no override can be persisted — give it an id in cordis.patch.yml first",
			"details.state": "State",
			"details.transport": "Transport",
			"details.endpoint": "Endpoint",
			"details.entry": "Row id",
			"details.tools": "Tools ({count})",
			"details.noTools": "No registered tools",
			"details.diagnosis": "Diagnosis",
			"transport.stdio": "stdio",
			"transport.http": "streamable-http",
			"remove.title": "Remove MCP server",
			"remove.body": "“{name}” (row id: {rowId}) will be permanently deleted from cordis.patch.yml. This cannot be undone and the configuration is not kept.",
			"remove.confirm": "Remove",
			"remove.cancel": "Cancel",
			"add.title": "Add MCP server",
			"add.mode.form": "Form",
			"add.mode.json": "Import JSON",
			"add.transport": "Transport",
			"add.transport.stdio": "Local command (stdio)",
			"add.transport.http": "Remote URL (streamable-http)",
			"add.serverName": "Server name",
			"add.serverName.hint": "Tools are prefixed mcp__<name>__; [A-Za-z0-9_-], max 32",
			"add.rowId": "Row id (optional)",
			"add.rowId.hint": "Left blank, mcp-<serverName> is generated",
			"add.command": "Command",
			"add.command.hint": "e.g. npx, uvx, docker, or an absolute executable path",
			"add.args": "Arguments",
			"add.args.hint": "One per line, or space-separated (no shell parsing)",
			"add.env": "Environment",
			"add.env.hint": "One KEY=VALUE per line",
			"add.cwd": "Working directory",
			"add.url": "Endpoint URL",
			"add.url.hint": "Absolute http/https URL; DSH does not speak legacy SSE",
			"add.headers": "Headers",
			"add.headers.hint": "One Name: Value per line (put auth here)",
			"add.advanced": "Advanced",
			"add.timeout": "Per-call timeout (ms)",
			"add.failOnStartup": "Fail plugin load when the initial connection fails",
			"add.reconnect": "Auto reconnect",
			"add.reconnect.attempts": "Max attempts",
			"add.json.label": "Paste MCP configuration JSON",
			"add.json.hint": "Accepts the Claude Desktop / OpenCode mcpServers shape, or a single server object",
			"add.json.parse": "Parse",
			"add.json.detected": "{count} server(s) detected",
			"add.submit": "Add",
			"add.submitAll": "Add all ({count})",
			"add.cancel": "Cancel",
			"add.working": "Adding…",
			"add.error": "{message}",
			"add.done": "Added {name}",
			"add.partial": "{ok} succeeded, {failed} failed",
			"tab.mcp": "MCP",
			"tab.skills": "Skills",
			"skills.empty": "No skills found under the user roots (~/.dsh/skills, ~/.agents/skills)",
			"skills.disable": "Disable (the model no longer loads it; the “/” menu can still invoke it)",
			"skills.enable": "Enable (restore automatic model loading)",
			"skills.state.on": "enabled",
			"skills.state.off": "disabled",
			"skills.state.label": "State",
			"skills.desc": "Description",
			"skills.source": "Source",
			"skills.path": "Path",
			"skills.form": "Form",
			"skills.form.flat": "flat .md file",
			"skills.reveal": "Reveal"
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* dsh-mcp-skill-control Browser half: registers the MCP panel into the session
		* header utilities slot and drives the polling inventory store.
		*/
		/** Services required by the panel registration, RPC port, and dictionaries. */
		const inject = [
			"slots",
			"connection",
			"locale"
		];
		/** Idle polling period while the page is visible (ms). */
		const POLL_IDLE_MS = 5e3;
		/**
		* Faster polling while any row is still settling. A row that is connecting (or
		* one the Host has just probed) changes state within seconds, and the panel is
		* usually open exactly then.
		*/
		const POLL_ACTIVE_MS = 2e3;
		/** Mount the MCP control-bar panel. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "mcp-control-bar: dictionaries");
			ensurePanelStyle(document);
			const port = createPort(ctx);
			const inventory = createMcpInventory(port, (error) => {
				console.error("[mcp-control-bar] reading the MCP inventory failed:", error);
			});
			const skills = createSkillInventory(port, (message) => {
				inventory.reportActionError(message);
			});
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "mcp-manager",
				order: -10,
				locale: NS,
				inject: () => ({
					hooks: {
						inventory,
						skills
					},
					onDisable: (entryId) => inventory.disable(entryId),
					onEnable: (entryId) => inventory.enable(entryId),
					onRestart: (entryId) => inventory.restart(entryId),
					onRemove: (entryId) => inventory.remove(entryId),
					onAdd: (spec) => inventory.add(spec),
					onSkillToggle: (path, disabled) => skills.setDisabled(path, disabled),
					onSkillReveal: (path) => port.skillReveal(path).then((result) => {
						if (!result.ok) inventory.reportActionError(result.message);
						return result;
					}),
					onRefresh: () => {
						inventory.refresh();
						skills.refresh();
					},
					onDismissError: () => inventory.clearActionError()
				})
			}, McpPanel));
			ctx.effect(() => {
				let timer;
				let stopped = false;
				const period = () => {
					const { rows } = inventory.getSnapshot();
					return rows.some((row) => row.state === "connecting") ? POLL_ACTIVE_MS : POLL_IDLE_MS;
				};
				const schedule = () => {
					if (stopped) return;
					timer = setTimeout(tick, period());
				};
				const tick = () => {
					if (document.hidden) {
						schedule();
						return;
					}
					Promise.all([inventory.refresh(), skills.refresh()]).finally(schedule);
				};
				Promise.all([inventory.refresh(), skills.refresh()]).finally(schedule);
				const onVisible = () => {
					if (!document.hidden) inventory.refresh();
				};
				document.addEventListener("visibilitychange", onVisible);
				return () => {
					stopped = true;
					if (timer !== void 0) clearTimeout(timer);
					document.removeEventListener("visibilitychange", onVisible);
				};
			}, "mcp-control-bar: polling");
			ctx.on("connection/reset", () => {
				inventory.reset();
				skills.reset();
				inventory.refresh();
				skills.refresh();
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map