/**
 * Tests for CLI helper utilities.
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// parseEnvFlags — extracted inline here so we can test without spinning up
// the full CLI (which would need a real server endpoint).
// ---------------------------------------------------------------------------

function parseEnvFlags(args: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env" && i + 1 < args.length) {
      const kv = args[++i];
      const eq = kv.indexOf("=");
      if (eq > 0) {
        env[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    } else if (args[i].startsWith("--env=")) {
      const kv = args[i].slice("--env=".length);
      const eq = kv.indexOf("=");
      if (eq > 0) {
        env[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    }
  }
  return env;
}

describe("parseEnvFlags", () => {
  it("parses --env KEY=value", () => {
    const result = parseEnvFlags(["--env", "GITHUB_TOKEN=abc123"]);
    expect(result).toEqual({ GITHUB_TOKEN: "abc123" });
  });

  it("parses multiple --env flags", () => {
    const result = parseEnvFlags([
      "--env",
      "FOO=bar",
      "--env",
      "BAZ=qux",
    ]);
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("parses --env=KEY=value (equals form)", () => {
    const result = parseEnvFlags(["--env=API_KEY=secret"]);
    expect(result).toEqual({ API_KEY: "secret" });
  });

  it("handles value with = in it", () => {
    const result = parseEnvFlags(["--env", "DB_URL=postgres://user:pass@host/db?ssl=true"]);
    expect(result.DB_URL).toBe("postgres://user:pass@host/db?ssl=true");
  });

  it("ignores unknown flags", () => {
    const result = parseEnvFlags(["add", "github", "--no-telemetry"]);
    expect(result).toEqual({});
  });

  it("returns empty object for no args", () => {
    expect(parseEnvFlags([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// isCliInvocation heuristic
// ---------------------------------------------------------------------------

const CLI_SUBCOMMANDS = new Set(["add", "remove", "list", "init", "--version", "--help", "-v", "-h"]);

function isCliInvocation(argv: string[]): boolean {
  const args = argv.slice(2);
  return args.some((a) => CLI_SUBCOMMANDS.has(a));
}

describe("isCliInvocation", () => {
  it("returns true for 'add'", () => {
    expect(isCliInvocation(["node", "launcher", "add", "github"])).toBe(true);
  });

  it("returns true for 'list'", () => {
    expect(isCliInvocation(["node", "launcher", "list"])).toBe(true);
  });

  it("returns true for '--version'", () => {
    expect(isCliInvocation(["node", "launcher", "--version"])).toBe(true);
  });

  it("returns false when invoked as MCP server (no args)", () => {
    expect(isCliInvocation(["node", "launcher"])).toBe(false);
  });

  it("returns false for unknown flags only", () => {
    expect(isCliInvocation(["node", "launcher", "--no-telemetry"])).toBe(false);
  });
});
