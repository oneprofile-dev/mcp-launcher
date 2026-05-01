/**
 * Unit tests for stack.ts — the local MCP server registry.
 *
 * Uses a temp directory so tests never touch ~/.curatedmcp.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Redirect homedir to a temp directory before importing the module under test.
const testHome = join(tmpdir(), `curatedmcp-test-${process.pid}`);

vi.mock("os", async (importOriginal) => {
  const original = await importOriginal<typeof import("os")>();
  return { ...original, homedir: () => testHome };
});

// Types for the stack module
type StackEntry = {
  slug: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  name?: string;
  addedAt?: string;
};

type Stack = { version: 1; entries: StackEntry[] };

type StackModule = {
  readStack: () => Stack;
  writeStack: (s: Stack) => void;
  upsertEntry: (e: StackEntry) => Stack;
  removeEntry: (slug: string) => boolean;
  stackPath: () => string;
};

let mod: StackModule;

beforeAll(async () => {
  mod = await import("../stack.js") as StackModule;
});

describe("stack", () => {
  beforeEach(() => {
    mkdirSync(testHome, { recursive: true });
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("returns empty stack when file does not exist", () => {
    const stack = mod.readStack();
    expect(stack.version).toBe(1);
    expect(stack.entries).toHaveLength(0);
  });

  it("writes and reads back a stack", () => {
    mod.writeStack({
      version: 1,
      entries: [
        {
          slug: "github",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "ghp_test" },
        },
      ],
    });
    const stack = mod.readStack();
    expect(stack.entries).toHaveLength(1);
    expect(stack.entries[0].slug).toBe("github");
    expect(stack.entries[0].env?.GITHUB_TOKEN).toBe("ghp_test");
  });

  it("upsertEntry adds a new entry", () => {
    mod.upsertEntry({
      slug: "postgres",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
    });
    const stack = mod.readStack();
    expect(stack.entries).toHaveLength(1);
    expect(stack.entries[0].slug).toBe("postgres");
  });

  it("upsertEntry updates an existing entry (dedup)", () => {
    mod.upsertEntry({ slug: "postgres", command: "npx", args: ["-y", "pkg-v1"] });
    mod.upsertEntry({ slug: "postgres", command: "npx", args: ["-y", "pkg-v2"] });
    const stack = mod.readStack();
    expect(stack.entries).toHaveLength(1);
    expect(stack.entries[0].args).toContain("pkg-v2");
  });

  it("upsertEntry stamps addedAt", () => {
    mod.upsertEntry({ slug: "stripe", command: "npx", args: [] });
    const stack = mod.readStack();
    expect(stack.entries[0].addedAt).toBeDefined();
    expect(new Date(stack.entries[0].addedAt!).getFullYear()).toBeGreaterThan(2020);
  });

  it("removeEntry removes an existing entry and returns true", () => {
    mod.upsertEntry({ slug: "github", command: "npx", args: [] });
    const removed = mod.removeEntry("github");
    expect(removed).toBe(true);
    expect(mod.readStack().entries).toHaveLength(0);
  });

  it("removeEntry returns false for unknown slug", () => {
    const removed = mod.removeEntry("nonexistent");
    expect(removed).toBe(false);
  });

  it("readStack returns empty stack on corrupt JSON", () => {
    const configDir = join(testHome, ".curatedmcp");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "stack.json"), "{ broken json }", "utf-8");
    const stack = mod.readStack();
    expect(stack.entries).toHaveLength(0);
  });

  it("stackPath points to ~/.curatedmcp/stack.json", () => {
    expect(mod.stackPath()).toContain(".curatedmcp");
    expect(mod.stackPath()).toContain("stack.json");
  });
});
