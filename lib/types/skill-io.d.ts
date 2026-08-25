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
import type { SkillRow, SkillSourceKind } from './types.ts';
/** A failure carrying a machine-readable reason for the envelope. */
export declare class SkillIoError extends Error {
    readonly reason: string;
    constructor(reason: string, message: string);
}
/** One managed physical skill root. */
export interface SkillRoot {
    /** Realpath'd directory (symlinks followed); entries live directly inside. */
    readonly path: string;
    /** Logical root labels that resolved here; rank order (user-dsh first). */
    readonly sources: readonly SkillSourceKind[];
}
/** Environment slice the root resolution honours (injectable for tests). */
export interface SkillRootEnv {
    readonly DSH_HOME?: string | undefined;
    readonly DSH_AGENTS_HOME?: string | undefined;
}
/**
 * Resolve the managed user roots: logical paths from the environment (mirrors
 * skill-filesystem's own resolution), realpath'd, missing ones skipped, and
 * logical roots landing on the same physical directory merged.
 * @param env - environment override (defaults to process.env).
 * @returns physical roots in rank order (user-dsh before user-agents).
 */
export declare function resolveSkillRoots(env?: SkillRootEnv): SkillRoot[];
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
export declare function listSkills(env?: SkillRootEnv): SkillRow[];
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
export declare function setModelDisabled(path: string, disabled: boolean): boolean;
/**
 * Resolve a caller-supplied path against the managed roots (guard for the
 * RPC surface): the path must be a file a previous listing could have
 * returned, i.e. realpath-equal to a discovered skill file.
 * @param path - candidate path from the browser.
 * @param env - environment override forwarded to root resolution.
 * @returns the canonical discovered path.
 */
export declare function resolveManagedSkillPath(path: string, env?: SkillRootEnv): string;
