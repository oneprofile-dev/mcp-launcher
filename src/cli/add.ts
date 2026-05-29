/**
 * `launcher add <slug>` — fetch install config from curatedmcp.com and write to stack.json.
 *
 * Two modes:
 *  1. Interactive (CLI): prompts for required env vars at the terminal
 *  2. Non-interactive (MCP `add_to_stack` tool): env supplied as an argument
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { upsertEntry, type StackEntry, stackPath } from "../stack.js";

const API_URL = process.env.CURATOR_API_URL || "https://www.curatedmcp.com";

/**
 * The shape returned by GET /api/launcher/stack-config?slug=<slug>.
 * Defined here so we don't depend on the backend at typecheck time.
 */
interface StackConfigResponse {
  slug: string;
  name: string;
  description?: string;
  command: string;
  args: string[];
  /** Env vars the server needs (e.g. API tokens). */
  requiredEnv: Array<{ key: string; description?: string }>;
  /** Env vars that improve behavior but aren't strictly required. */
  optionalEnv: Array<{ key: string; description?: string; default?: string }>;
}

export interface AddOptions {
  /** Pre-supplied env vars (used in non-interactive mode). */
  env?: Record<string, string>;
  /** When true, skip prompts. Required env vars must already be in `env` or we error. */
  nonInteractive: boolean;
}

export interface AddResult {
  entry: StackEntry;
  summary: string;
}

export async function addToStack(
  slug: string,
  opts: AddOptions
): Promise<AddResult> {
  const config = await fetchStackConfig(slug);

  // Resolve required env: pre-supplied → prompt → error
  const env: Record<string, string> = { ...(opts.env || {}) };
  const missing: typeof config.requiredEnv = [];
  for (const v of config.requiredEnv) {
    if (env[v.key] === undefined || env[v.key] === "") missing.push(v);
  }

  if (missing.length > 0) {
    if (opts.nonInteractive) {
      throw new Error(
        `Missing required env vars for "${slug}": ${missing
          .map((v) => v.key)
          .join(", ")}. Re-run with these in the env argument.`
      );
    }
    const filled = await promptForEnv(missing);
    Object.assign(env, filled);
  }

  // Optional env: prefill defaults but don't prompt
  for (const v of config.optionalEnv) {
    if (env[v.key] === undefined && v.default !== undefined) {
      env[v.key] = v.default;
    }
  }

  const entry: StackEntry = {
    slug: config.slug,
    name: config.name,
    command: config.command,
    args: config.args,
    env: Object.keys(env).length > 0 ? env : undefined,
  };

  upsertEntry(entry);

  const summary =
    `Added \`${config.name}\` (${config.slug}) to stack at ${stackPath()}.\n` +
    `Command: ${config.command} ${config.args.join(" ")}` +
    (Object.keys(env).length > 0
      ? `\nEnv: ${Object.keys(env).join(", ")}`
      : "");

  return { entry, summary };
}

/**
 * Parse `--env KEY=value` flags from CLI argv tail.
 * Also accepts `--env=KEY=value`.
 */
export function parseEnvFlags(args: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    let value: string | undefined;
    if (a === "--env" || a === "-e") {
      value = args[++i];
    } else if (a.startsWith("--env=")) {
      value = a.slice("--env=".length);
    } else {
      continue;
    }
    if (!value) continue;
    const eq = value.indexOf("=");
    if (eq <= 0) {
      throw new Error(
        `Bad --env flag "${value}". Expected KEY=value (e.g. --env GITHUB_TOKEN=ghp_xxx).`
      );
    }
    env[value.slice(0, eq)] = value.slice(eq + 1);
  }
  return env;
}

async function fetchStackConfig(slug: string): Promise<StackConfigResponse> {
  const url = `${API_URL}/api/launcher/stack-config?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "curatedmcp/2.0.0" },
  });
  if (res.status === 404) {
    throw new Error(
      `Server "${slug}" not found in the CuratedMCP catalog. ` +
        `Browse https://curatedmcp.com/marketplace to find the right slug.`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch install config for "${slug}": ${res.status} ${res.statusText}`
    );
  }
  return (await res.json()) as StackConfigResponse;
}

async function promptForEnv(
  vars: Array<{ key: string; description?: string }>
): Promise<Record<string, string>> {
  const rl = createInterface({ input, output });
  try {
    const out: Record<string, string> = {};
    console.log(
      `\nThis server needs ${vars.length} environment variable${vars.length === 1 ? "" : "s"}:`
    );
    for (const v of vars) {
      if (v.description) console.log(`  ${v.key} — ${v.description}`);
      const answer = await rl.question(`  ${v.key}: `);
      if (!answer.trim()) {
        throw new Error(`${v.key} is required.`);
      }
      out[v.key] = answer.trim();
    }
    console.log("");
    return out;
  } finally {
    rl.close();
  }
}
