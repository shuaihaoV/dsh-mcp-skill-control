/**
 * Skill enable/disable persistence over the USER skill roots that
 * `@deepseek-ai/dsh-skill-filesystem` discovers (its `roots()` contract):
 *
 * | rank | source      | path                                  |
 * |------|-------------|---------------------------------------|
 * | 400  | user-dsh    | `$DSH_HOME/skills` (default ~/.dsh)   |
 * | 500  | user-agents | `$DSH_AGENTS_HOME` (default ~/.agents)|
 *
 * Project roots are deliberately NOT managed: they resolve against the
 * session's cwd and drift per conversation. The panel only flips the model
 * surface, which the provider reads from frontmatter:
 *
 * - disable  → `disable-model-invocation: true` is written into frontmatter
 * - enable   → that key is removed (both invocation surfaces default to on)
 *
 * Both discovery shapes are honoured (`<name>/SKILL.md` and flat `<name>.md`),
 * one level deep, exactly like the provider. Symlinked roots are realpath'd
 * and merged, so a machine where ~/.dsh/skills and ~/.agents/skills point at
 * one physical directory lists each skill once and edits one file.
 *
 * Writes are surgical: only the frontmatter block is re-serialized (through
 * yaml's Document AST, preserving comments/key order); the Markdown body is
 * spliced back byte-for-byte.
 */

import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isMap, parseDocument, type Document, type YAMLMap } from 'yaml'
import type { SkillRow, SkillSourceKind } from './types.ts'

/** frontmatter key the skill provider interprets as "hide from the model". */
const DISABLE_KEY = 'disable-model-invocation'

/** A failure carrying a machine-readable reason for the envelope. */
export class SkillIoError extends Error {
  constructor(readonly reason: string, message: string) {
    super(message)
    this.name = 'SkillIoError'
  }
}

/** One managed physical skill root. */
export interface SkillRoot {
  /** Realpath'd directory (symlinks followed); entries live directly inside. */
  readonly path: string
  /** Logical root labels that resolved here; rank order (user-dsh first). */
  readonly sources: readonly SkillSourceKind[]
}

/** Environment slice the root resolution honours (injectable for tests). */
export interface SkillRootEnv {
  readonly DSH_HOME?: string | undefined
  readonly DSH_AGENTS_HOME?: string | undefined
}

/**
 * Resolve the managed user roots: logical paths from the environment (mirrors
 * skill-filesystem's own resolution), realpath'd, missing ones skipped, and
 * logical roots landing on the same physical directory merged.
 * @param env - environment override (defaults to process.env).
 * @returns physical roots in rank order (user-dsh before user-agents).
 */
export function resolveSkillRoots(env: SkillRootEnv = process.env): SkillRoot[] {
  const logical: { source: SkillSourceKind; dir: string }[] = [
    { source: 'user-dsh', dir: join(env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'skills') },
    {
      source: 'user-agents',
      // Mirror skill-filesystem: DSH_AGENTS_HOME is the AGENTS ROOT itself
      // (default ~/.agents), and skills live in its `skills` child.
      dir: join(join(env.DSH_AGENTS_HOME?.trim() || join(homedir(), '.agents'), 'skills')),
    },
  ]
  const merged = new Map<string, SkillSourceKind[]>()
  for (const { source, dir } of logical) {
    if (!existsSync(dir)) continue
    let physical: string
    try {
      physical = realpathSync(dir)
    } catch {
      continue
    }
    if (!isDirectory(physical)) continue
    const sources = merged.get(physical)
    if (sources === undefined) merged.set(physical, [source])
    else if (!sources.includes(source)) sources.push(source)
  }
  return [...merged].map(([path, sources]) => ({ path, sources: [...sources] }))
}

/** Whether a path exists and is a directory (symlinks followed). */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Read a plain string field from a frontmatter map. */
function stringAt(node: YAMLMap, key: string): string | undefined {
  const value = node.get(key, false) as unknown
  return typeof value === 'string' ? value : undefined
}

/**
 * Split a skill file into its frontmatter YAML text and body.
 * Only a leading `---` opener with a matching closer counts; anything else is
 * a body-only file (which the provider would reject, so callers treat it as
 * invalid rather than inventing frontmatter).
 * @returns line indexes of the fence pair plus the two slices, or undefined.
 */
function splitFrontmatter(text: string): { fmText: string; body: string } | undefined {
  // Opener: a leading `---` line (LF or CRLF). BOM-free UTF-8 is assumed
  // (readFileSync utf8 keeps any BOM as \uFEFF; such files are left alone).
  if (!/^---[^\S\r\n]*\r?\n/.test(text)) return undefined
  // Search for a closing `---` on its own line after the opener.
  const rest = text.slice(text.match(/^---[^\S\r\n]*\r?\n/)![0].length)
  const close = rest.search(/^---[^\S\r\n]*\r?\n?$/m)
  if (close < 0) return undefined
  const fmText = rest.slice(0, close)
  // Capture the closer LINE (fence + trailing blanks ON ITS LINE + its line
  // ending) so the body starts exactly where it did in the source. `\s` would
  // swallow the blank line AFTER the fence, so trailing blanks are matched
  // with `[^\S\r\n]` (horizontal whitespace only).
  const closer = rest.slice(close).match(/^---[^\S\r\n]*\r?\n?/)
  const body = closer === null ? '' : rest.slice(close + closer[0].length)
  return { fmText, body }
}

/** Parse frontmatter text into a YAML document whose root is a map. */
function parseFrontmatter(fmText: string, path: string): Document {
  const doc = parseDocument(fmText, { prettyErrors: true })
  if (doc.errors.length > 0) {
    throw new SkillIoError('bad-frontmatter', `${path}: invalid frontmatter YAML: ${doc.errors[0]?.message ?? 'parse error'}`)
  }
  if (!isMap(doc.contents)) {
    throw new SkillIoError('bad-frontmatter', `${path}: frontmatter is not a YAML mapping`)
  }
  return doc
}

/** One discovered skill file with its parsed frontmatter map. */
interface SkillFile {
  readonly row: SkillRow
  readonly doc: Document
  readonly fm: YAMLMap
  readonly body: string
}

/**
 * Discover every managed skill across the physical roots.
 *
 * Mirrors the provider's discovery contract: one level deep, directory
 * `<name>/SKILL.md` bundles and flat `<name>.md` files, dot-entries skipped,
 * and entries without a valid frontmatter `name`+`description` dropped (the
 * provider drops them from the catalog the same way).
 * @param env - environment override forwarded to root resolution.
 * @returns discovered rows sorted by name.
 */
export function listSkills(env: SkillRootEnv = process.env): SkillRow[] {
  const rows: SkillRow[] = []
  for (const root of resolveSkillRoots(env)) {
    let entries: string[]
    try {
      entries = readdirSync(root.path, { withFileTypes: true })
        .filter(dirent => !dirent.name.startsWith('.'))
        .map(dirent => dirent.name)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(root.path, entry)
      let skillPath: string | undefined
      let flat = false
      if (isDirectory(full)) {
        const candidate = join(full, 'SKILL.md')
        if (isFile(candidate)) skillPath = candidate
      } else if (entry.endsWith('.md')) {
        skillPath = full
        flat = true
      }
      if (skillPath === undefined) continue
      const file = readSkillFile(skillPath, root.sources, entry, flat)
      if (file !== undefined) rows.push(file.row)
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

/** Whether a path exists and is a regular file (symlinks followed). */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Read and parse one skill file into a row; invalid entries yield undefined
 * (matching the provider's drop-with-warning discovery behaviour).
 */
function readSkillFile(
  path: string,
  sources: readonly SkillSourceKind[],
  dirName: string,
  flat: boolean,
): SkillFile | undefined {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  let parsed: { fmText: string; body: string } | undefined
  let doc: Document
  try {
    parsed = splitFrontmatter(text)
    if (parsed === undefined) return undefined
    doc = parseFrontmatter(parsed.fmText, path)
  } catch (error) {
    if (error instanceof SkillIoError) return undefined
    throw error
  }
  const fm = doc.contents as YAMLMap
  const name = stringAt(fm, 'name')
  const description = stringAt(fm, 'description')
  if (name === undefined || description === undefined) return undefined
  return {
    row: {
      name,
      description,
      sources: [...sources],
      dirName,
      path,
      flat,
      modelDisabled: fm.get(DISABLE_KEY, false) === true,
    },
    doc,
    fm,
    body: parsed.body,
  }
}

/**
 * Flip one skill's model-invocation switch by editing its frontmatter.
 *
 * The write is surgical: the frontmatter block is re-serialized through the
 * yaml AST (comments and key order preserved) while the Markdown body is
 * spliced back byte-for-byte. Setting `disabled: false` removes the key
 * entirely — the provider's default for an absent key is "enabled".
 * @param path - absolute skill-file path as previously returned by listSkills.
 * @param disabled - true writes `disable-model-invocation: true`; false removes the key.
 * @returns true when the file changed.
 */
export function setModelDisabled(path: string, disabled: boolean): boolean {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new SkillIoError('skill-not-found', `cannot read ${path}: ${(error as Error).message}`)
  }
  const parsed = splitFrontmatter(text)
  if (parsed === undefined) {
    throw new SkillIoError('bad-frontmatter', `${path} has no frontmatter block to edit`)
  }
  const doc = parseFrontmatter(parsed.fmText, path)
  const fm = doc.contents as YAMLMap
  const name = stringAt(fm, 'name')
  if (name === undefined) {
    throw new SkillIoError('bad-frontmatter', `${path} has no frontmatter name — not a managed skill`)
  }
  const current = fm.get(DISABLE_KEY, false)
  if (disabled) {
    if (current === true) return false
    fm.set(DISABLE_KEY, true)
  } else {
    if (current !== true && !fm.has(DISABLE_KEY)) return false
    if (!fm.has(DISABLE_KEY)) return false
    fm.delete(DISABLE_KEY)
  }
  // Normalize the serialized frontmatter to exactly one trailing newline
  // before the closing fence, so re-serialization cannot accumulate blank
  // lines across repeated toggles (byte-stable round trips).
  const fmOut = doc.toString({ lineWidth: 0, singleQuote: true, flowCollectionPadding: false }).replace(/\n+$/, '\n')
  // Fence line endings follow the ORIGINAL opener's style, so a CRLF file
  // stays CRLF and an LF file stays LF across toggles.
  const eol = text.startsWith('---\r\n') ? '\r\n' : '\n'
  const next = `---${eol}${fmOut.replaceAll('\n', eol)}---${eol}${parsed.body}`
  try {
    writeFileSync(path, next, 'utf8')
  } catch (error) {
    throw new SkillIoError('io-error', `cannot write ${path}: ${(error as Error).message}`)
  }
  return true
}

/**
 * Resolve a caller-supplied path against the managed roots (guard for the
 * RPC surface): the path must be a file a previous listing could have
 * returned, i.e. realpath-equal to a discovered skill file.
 * @param path - candidate path from the browser.
 * @param env - environment override forwarded to root resolution.
 * @returns the canonical discovered path.
 */
export function resolveManagedSkillPath(path: string, env: SkillRootEnv = process.env): string {
  if (typeof path !== 'string' || path === '') {
    throw new SkillIoError('bad-request', 'path must be a non-empty string')
  }
  let canonical: string
  try {
    canonical = realpathSync(path)
  } catch {
    throw new SkillIoError('skill-not-found', `skill file "${path}" does not exist`)
  }
  for (const row of listSkills(env)) {
    if (row.path === canonical) return canonical
  }
  throw new SkillIoError('skill-not-found', `"${path}" is not a skill under a managed user root`)
}
