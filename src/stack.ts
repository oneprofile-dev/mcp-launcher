/**
 * Stack — read/write the user's local MCP server registry at ~/.curatedmcp/stack.json
 *
 * This is the source of truth for which MCP servers Launcher proxies. It's intentionally
 * file-based (no cloud sync, no auth) so users own their config and can hand-edit if they want.
 *
 * Schema is versioned so we can migrate forward without breaking older installs.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".curatedmcp");
const STACK_FILE = join(CONFIG_DIR, "stack.json");

export interface StackEntry {
  /** CuratedMCP catalog slug (e.g. "github", "postgres"). */
  slug: string;
  /** Executable to spawn (e.g. "npx", "uvx", "node", "/usr/local/bin/foo"). */
  command: string;
  /** Args passed to the executable. */
  args: string[];
  /** Optional env vars (API keys, tokens, paths). */
  env?: Record<string, string>;
  /** When set, the entry is in stack.json but not loaded by the proxy. */
  disabled?: boolean;
  /** Free-form note (e.g. "Personal account"). */
  note?: string;
  /** Display name for `launcher list`. Falls back to slug. */
  name?: string;
  /** ISO timestamp of when this was added. */
  addedAt?: string;
}

export interface Stack {
  /** Schema version. Bump when the schema is not backward-compatible. */
  version: 1;
  entries: StackEntry[];
}

const EMPTY_STACK: Stack = { version: 1, entries: [] };

/** Returns the path to stack.json (so callers can show it to users). */
export function stackPath(): string {
  return STACK_FILE;
}

/**
 * Read the stack from disk.
 * Returns an empty stack if the file is missing, unreadable, or malformed —
 * so a corrupt config never crashes the launcher.
 */
export function readStack(): Stack {
  if (!existsSync(STACK_FILE)) return { ...EMPTY_STACK, entries: [] };
  try {
    const raw = readFileSync(STACK_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Stack>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      console.error(
        `[stack] ${STACK_FILE} has unexpected shape; treating as empty.`
      );
      return { ...EMPTY_STACK, entries: [] };
    }
    return { version: 1, entries: parsed.entries.filter(isValidEntry) };
  } catch (err) {
    console.error(`[stack] Failed to read ${STACK_FILE}:`, err);
    return { ...EMPTY_STACK, entries: [] };
  }
}

/**
 * Atomically write the stack to disk.
 * Writes to a temp sibling file, then renames — avoids a half-written file
 * if the process is killed mid-write.
 */
export function writeStack(stack: Stack): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const tmp = `${STACK_FILE}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(stack, null, 2) + "\n", "utf-8");
  renameSync(tmp, STACK_FILE);
}

/**
 * Add or replace an entry by slug. If an entry with the same slug exists,
 * it's overwritten (so calling `add` twice updates env vars cleanly).
 */
export function upsertEntry(entry: StackEntry): Stack {
  const stack = readStack();
  const idx = stack.entries.findIndex((e) => e.slug === entry.slug);
  const stamped: StackEntry = {
    ...entry,
    addedAt: entry.addedAt ?? new Date().toISOString(),
  };
  if (idx >= 0) {
    stack.entries[idx] = stamped;
  } else {
    stack.entries.push(stamped);
  }
  writeStack(stack);
  return stack;
}

/** Remove an entry by slug. No-op (returns false) if it wasn't there. */
export function removeEntry(slug: string): boolean {
  const stack = readStack();
  const before = stack.entries.length;
  stack.entries = stack.entries.filter((e) => e.slug !== slug);
  if (stack.entries.length === before) return false;
  writeStack(stack);
  return true;
}

function isValidEntry(e: unknown): e is StackEntry {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x.slug === "string" &&
    typeof x.command === "string" &&
    Array.isArray(x.args) &&
    x.args.every((a) => typeof a === "string")
  );
}
