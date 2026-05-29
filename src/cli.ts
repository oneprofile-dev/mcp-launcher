/**
 * CLI dispatcher.
 *
 * `npx @curatedmcp/launcher` (no args) → MCP server mode (handled in index.ts)
 * `npx @curatedmcp/launcher <subcommand>` → run that subcommand and exit
 */
import { createRequire } from "module";
import { addToStack, parseEnvFlags } from "./cli/add.js";
import { removeFromStack } from "./cli/remove.js";
import { listStack } from "./cli/list.js";
import { runInit } from "./cli/init.js";
import { runAuditCommand } from "./cli/audit.js";
import { runGuardCommand } from "./cli/guard.js";
import { runLogin } from "./cli/login.js";
import { runSync } from "./cli/sync.js";
import { runFeedback } from "./cli/feedback.js";
import { track, type FunnelEvent } from "./telemetry.js";
import { maybeNudge } from "./nudge.js";

const require = createRequire(import.meta.url);
// Read version from package.json so it never drifts from the published version.
const VERSION: string =
  (require("../package.json") as { version: string }).version;

const HELP = `
curatedmcp v${VERSION}
The CuratedMCP agent — discover, run, audit, and govern every MCP server your AI tools use.

USAGE
  npx curatedmcp [SUBCOMMAND] [OPTIONS]

SUBCOMMANDS
  (no subcommand)        Run as an MCP hub server over stdio (used by AI clients).
  audit                  Scan this machine for MCP servers and flag security risks.
  add <slug>             Add a server from the CuratedMCP catalog to your stack.
  remove <slug>          Remove a server from your stack.
  list                   List the servers currently in your stack.
  guard -- <cmd>         Run the action firewall in front of a downstream MCP server.
  login [token]          Sign in to your CuratedMCP account (enables sync & alerts).
  sync [--team <slug>]   Pull your team's MCP allow-list and report a local audit.
  feedback [message]     Send feedback to the CuratedMCP team.
  init                   Show the one-line config snippet to add the agent to your AI client.
  --version, -v          Print version and exit.
  --help, -h             Print this help.

EXAMPLES
  npx curatedmcp audit
  npx curatedmcp add github --env GITHUB_TOKEN=ghp_xxx
  npx curatedmcp guard -- npx -y @modelcontextprotocol/server-filesystem /tmp
  npx curatedmcp login
  npx curatedmcp sync

CONFIG
  Stack lives at ~/.curatedmcp/stack.json (hand-editable JSON).
  Auth token at ~/.curatedmcp/auth.json. Set CURATOR_API_URL to override the API base
  (default: https://www.curatedmcp.com).

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
  const SUBCOMMANDS = new Set([
    "add",
    "remove",
    "list",
    "init",
    "audit",
    "guard",
    "login",
    "sync",
    "feedback",
    "--help",
    "-h",
    "--version",
    "-v",
  ]);
  return SUBCOMMANDS.has(first);
}

/** Map a subcommand to its activation funnel event, if it has one. */
function funnelEventFor(cmd: string): { event: FunnelEvent; metadata?: Record<string, unknown> } | null {
  switch (cmd) {
    case "audit":
      return { event: "audit_run" };
    case "login":
      return { event: "login" };
    case "sync":
      return { event: "sync" };
    case "add":
    case "remove":
    case "list":
    case "init":
    case "guard":
      return { event: "command_run", metadata: { command: cmd } };
    default:
      return null; // version/help/feedback/unknown handled elsewhere
  }
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const args = argv.slice(2);
  const [cmd, ...rest] = args;

  // Fire the activation funnel event up-front (fire-and-forget) so we still
  // capture intent even if the command itself later errors.
  const funnel = funnelEventFor(cmd);
  if (funnel) void track(funnel.event, funnel.metadata);

  const code = await dispatch(cmd, rest);

  // Post-command upgrade prompt / feedback hint — only for real subcommands,
  // never for version/help/unknown. Fully non-blocking.
  if (funnel || cmd === "feedback") await maybeNudge(VERSION);

  return code;
}

async function dispatch(cmd: string, rest: string[]): Promise<number> {
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

    case "audit":
      return runAuditCommand(rest);

    case "guard":
      return runGuardCommand(rest);

    case "login":
      return runLogin(rest);

    case "sync":
      return runSync(rest);

    case "feedback":
      return runFeedback(rest);

    case "list":
      return listStack();

    case "add": {
      const slug = rest.find((a) => !a.startsWith("-"));
      if (!slug) {
        console.error("Usage: curatedmcp add <slug> [--env KEY=value ...]");
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
        console.error("Usage: curatedmcp remove <slug>");
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
