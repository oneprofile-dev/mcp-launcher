/**
 * CLI dispatcher.
 *
 * `npx @curatedmcp/launcher` (no args) → MCP server mode (handled in index.ts)
 * `npx @curatedmcp/launcher <subcommand>` → run that subcommand and exit
 */
import { addToStack, parseEnvFlags } from "./cli/add.js";
import { removeFromStack } from "./cli/remove.js";
import { listStack } from "./cli/list.js";
import { runInit } from "./cli/init.js";

const VERSION = "1.0.0";

const HELP = `
@curatedmcp/launcher v${VERSION}
The MCP Hub — one config that bridges every AI agent to every MCP server.

USAGE
  npx @curatedmcp/launcher [SUBCOMMAND] [OPTIONS]

SUBCOMMANDS
  (no subcommand)        Run as an MCP server over stdio (used by AI clients).
  add <slug>             Add a server from the CuratedMCP catalog to your stack.
  remove <slug>          Remove a server from your stack.
  list                   List the servers currently in your stack.
  init                   Show the one-line config snippet to add Launcher to your AI client.
  --version, -v          Print version and exit.
  --help, -h             Print this help.

EXAMPLES
  npx @curatedmcp/launcher init
  npx @curatedmcp/launcher add github --env GITHUB_TOKEN=ghp_xxx
  npx @curatedmcp/launcher list
  npx @curatedmcp/launcher remove github

CONFIG
  Stack lives at ~/.curatedmcp/stack.json (hand-editable JSON).
  Set CURATOR_API_URL to override the catalog endpoint (default: https://www.curatedmcp.com).

LEARN MORE
  https://curatedmcp.com/launcher
`.trim();

/**
 * True if argv contains a CLI subcommand or top-level flag.
 * False means run as an MCP server (the default mode used by AI clients).
 *
 * NOTE: We deliberately exclude `--no-telemetry` here because Telemetry
 * already handles that flag in MCP server mode.
 */
export function isCliInvocation(argv: readonly string[]): boolean {
  const args = argv.slice(2);
  if (args.length === 0) return false;
  // First non-flag arg is the subcommand
  const first = args[0];
  if (
    first === "add" ||
    first === "remove" ||
    first === "list" ||
    first === "init" ||
    first === "--help" ||
    first === "-h" ||
    first === "--version" ||
    first === "-v"
  ) {
    return true;
  }
  return false;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const args = argv.slice(2);
  const [cmd, ...rest] = args;

  switch (cmd) {
    case "--version":
    case "-v":
      console.log(VERSION);
      return 0;

    case "--help":
    case "-h":
      console.log(HELP);
      return 0;

    case "init":
      return runInit();

    case "list":
      return listStack();

    case "add": {
      const slug = rest.find((a) => !a.startsWith("-"));
      if (!slug) {
        console.error("Usage: launcher add <slug> [--env KEY=value ...]");
        return 1;
      }
      const env = parseEnvFlags(rest);
      const result = await addToStack(slug, { env, nonInteractive: false });
      console.log(result.summary);
      return 0;
    }

    case "remove": {
      const slug = rest.find((a) => !a.startsWith("-"));
      if (!slug) {
        console.error("Usage: launcher remove <slug>");
        return 1;
      }
      return removeFromStack(slug);
    }

    default:
      console.error(`Unknown subcommand: ${cmd}\n`);
      console.error(HELP);
      return 1;
  }
}
