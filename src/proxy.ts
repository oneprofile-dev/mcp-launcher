/**
 * Proxy — spawns child MCP servers from the user's stack and aggregates their tools.
 *
 * Architecture:
 *   Agent (Claude/Cursor/...) --> Launcher (parent MCP server)
 *                                      |
 *                                      +--> child Client #1 -- stdio --> server #1 process
 *                                      +--> child Client #2 -- stdio --> server #2 process
 *                                      +--> ...
 *
 * Tool name routing:
 *   Each child's tools are exposed to the agent with a `<slug>__<original_name>` prefix.
 *   On tools/call, we strip the prefix and forward to the right child.
 *
 * Failure isolation:
 *   - Children are loaded lazily and in parallel; one failing to connect doesn't block others
 *   - On a child crash mid-session, the proxy marks it unhealthy and surfaces a clean error
 *     to the agent rather than crashing Launcher itself
 *   - Children with "disabled: true" in stack.json are skipped entirely
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Stack, StackEntry } from "./stack.js";

const PREFIX_SEPARATOR = "__";

/** A tool, as returned by an MCP server's tools/list. */
interface McpTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

interface ChildState {
  entry: StackEntry;
  client: Client;
  /** Tool names this child exposes (without prefix). Populated on first listTools. */
  toolNames: Set<string>;
  /** If non-null, child is unhealthy and any call returns this error. */
  error?: string;
}

export class Proxy {
  private children = new Map<string, ChildState>();

  /**
   * Spawn each enabled child in parallel. A single failure is logged but
   * doesn't abort the whole load — partial proxying is better than none.
   */
  async loadStack(stack: Stack): Promise<void> {
    const enabled = stack.entries.filter((e) => !e.disabled);
    await Promise.all(enabled.map((entry) => this.spawnChild(entry)));
  }

  private async spawnChild(entry: StackEntry): Promise<void> {
    const transport = new StdioClientTransport({
      command: entry.command,
      args: entry.args,
      env: entry.env ? { ...inheritedEnv(), ...entry.env } : undefined,
      // Pipe child stderr through ours so server log lines aren't lost.
      stderr: "pipe",
    });

    const client = new Client(
      { name: `curatedmcp-launcher-proxy:${entry.slug}`, version: "1.0.0" },
      { capabilities: {} }
    );

    const state: ChildState = {
      entry,
      client,
      toolNames: new Set<string>(),
    };
    this.children.set(entry.slug, state);

    try {
      await client.connect(transport);
      // Pre-fetch tool list so aggregateTools() is fast and we know what we route.
      const list = await client.listTools();
      state.toolNames = new Set(list.tools.map((t: McpTool) => t.name));
      // Pipe child stderr to ours (best-effort) for visibility into upstream issues.
      const childStderr = transport.stderr as unknown as
        | { on?: (e: string, cb: (chunk: Buffer) => void) => void }
        | undefined;
      if (childStderr && typeof childStderr.on === "function") {
        childStderr.on("data", (chunk: Buffer) => {
          process.stderr.write(`[${entry.slug}] ${chunk.toString()}`);
        });
      }
      console.error(
        `[launcher] Proxied ${entry.slug} (${state.toolNames.size} tools)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.error = `Failed to connect to ${entry.slug}: ${message}`;
      console.error(`[launcher] ${state.error}`);
    }
  }

  /**
   * Returns all tools from all healthy children, prefixed with `<slug>__`.
   * Disabled or unhealthy children contribute nothing.
   */
  async aggregateTools(): Promise<McpTool[]> {
    const out: McpTool[] = [];
    for (const [slug, state] of this.children) {
      if (state.error) continue;
      try {
        const list = await state.client.listTools();
        // Refresh cached tool names in case the child added/removed tools.
        state.toolNames = new Set(list.tools.map((t: McpTool) => t.name));
        for (const t of list.tools as McpTool[]) {
          out.push({
            name: `${slug}${PREFIX_SEPARATOR}${t.name}`,
            description: t.description
              ? `[${slug}] ${t.description}`
              : `[${slug}] (proxied)`,
            inputSchema: t.inputSchema,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.error = `listTools failed: ${message}`;
        console.error(`[launcher] [${slug}] ${state.error}`);
      }
    }
    return out;
  }

  /**
   * Route a `<slug>__<tool>` call to the right child and return its response unchanged.
   * Throws if the prefix doesn't match any known child or if the child is unhealthy.
   */
  async routeCall(prefixedName: string, args: Record<string, unknown>) {
    const sepIdx = prefixedName.indexOf(PREFIX_SEPARATOR);
    if (sepIdx <= 0) {
      throw new Error(
        `Tool name "${prefixedName}" is missing the "<slug>__" prefix.`
      );
    }
    const slug = prefixedName.slice(0, sepIdx);
    const toolName = prefixedName.slice(sepIdx + PREFIX_SEPARATOR.length);

    const state = this.children.get(slug);
    if (!state) {
      throw new Error(
        `Server "${slug}" is not in your stack. Run \`launcher list\` to see what's loaded.`
      );
    }
    if (state.error) {
      throw new Error(state.error);
    }

    return state.client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  /** Cleanly close all child clients. Best-effort; never throws. */
  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.children.values()).map((s) =>
        s.client.close().catch(() => {})
      )
    );
    this.children.clear();
  }
}

/**
 * Minimal env passthrough. We don't want to leak the parent's full env to children
 * because that often includes secrets meant for other tools — but the child needs
 * the basics (PATH, HOME, etc.) to even spawn.
 */
function inheritedEnv(): Record<string, string> {
  const keys = [
    "PATH",
    "HOME",
    "USER",
    "USERNAME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "LANG",
    "LC_ALL",
    "SHELL",
    "TERM",
    "PWD",
    // Allow npx/uvx to find their caches without forcing global install
    "NPM_CONFIG_CACHE",
    "UV_CACHE_DIR",
    "XDG_CACHE_HOME",
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
