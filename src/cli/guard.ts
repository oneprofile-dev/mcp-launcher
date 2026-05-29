import { runGuard, type GuardOptions } from "../guard/index.js";

/**
 * Parse `guard [options] -- <downstream command...>`.
 * Everything after `--` (or the first non-flag token) is the downstream MCP server command.
 */
function parse(args: string[]): GuardOptions {
  const opts: GuardOptions = { command: [] };
  const sep = args.indexOf("--");
  const flagArgs = sep === -1 ? args : args.slice(0, sep);
  let command = sep === -1 ? [] : args.slice(sep + 1);

  for (let i = 0; i < flagArgs.length; i++) {
    const a = flagArgs[i];
    const next = () => flagArgs[++i];
    switch (a) {
      case "--dashboard":
        opts.dashboard = true;
        break;
      case "--port":
        opts.port = parseInt(next(), 10);
        break;
      case "--policy":
        opts.policyPath = next();
        break;
      case "--db":
        opts.dbPath = next();
        break;
      case "--registry-key":
        opts.registryKey = next();
        break;
      case "--registry-slug":
        opts.registrySlug = next();
        break;
      case "--registry-url":
        opts.registryUrl = next();
        break;
      default:
        // No `--` separator used: treat the first bare token (and rest) as the command.
        if (sep === -1 && !a.startsWith("-")) {
          command = flagArgs.slice(i);
          i = flagArgs.length;
        }
    }
  }

  opts.command = command;
  return opts;
}

export async function runGuardCommand(args: string[]): Promise<number> {
  const opts = parse(args);
  if (opts.command.length === 0) {
    console.error(
      "Usage: curatedmcp guard [--dashboard] [--port N] -- <mcp server command>\n" +
        "Example: curatedmcp guard -- npx -y @modelcontextprotocol/server-filesystem /tmp"
    );
    return 1;
  }
  await runGuard(opts);
  // Proxy + dashboard keep the process alive; resolve only on shutdown.
  return 0;
}
