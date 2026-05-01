#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { searchServers } from "./tools/search.js";
import { getServerDetails } from "./tools/get-details.js";
import { installServer } from "./tools/install.js";
import { listCategories } from "./tools/list-categories.js";
import { Telemetry } from "./telemetry.js";
import { runCli, isCliInvocation } from "./cli.js";
import { Proxy } from "./proxy.js";
import { readStack } from "./stack.js";
import { addToStack } from "./cli/add.js";

const VERSION = "1.0.0";

// ─── CLI dispatch ────────────────────────────────────────────────────────────
// If invoked with subcommand args, run the CLI and exit.
// Otherwise, fall through to MCP server mode.
if (isCliInvocation(process.argv)) {
  runCli(process.argv).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  );
} else {
  startMcpServer().catch((err) => {
    console.error("[launcher] Fatal:", err);
    process.exit(1);
  });
}

// ─── MCP server (default mode when no CLI args) ──────────────────────────────

async function startMcpServer(): Promise<void> {
  const telemetry = new Telemetry();
  const proxy = new Proxy();

  // Load user's stack and lazy-spawn child MCP servers.
  // Failures here are logged but don't crash launcher — user gets discovery tools at minimum.
  const stack = readStack();
  if (stack.entries.length > 0) {
    await proxy.loadStack(stack).catch((err) => {
      console.error("[launcher] Stack load error:", err);
    });
  }

  const server = new Server(
    {
      name: "curatedmcp-launcher",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // ─── tools/list: discovery + proxied tools ─────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const proxiedTools = await proxy.aggregateTools();
    return {
      tools: [...DISCOVERY_TOOLS, ...proxiedTools],
    };
  });

  // ─── tools/call: route by name ─────────────────────────────────────────────
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;
      const argObj = (args || {}) as Record<string, unknown>;

      // Proxied tools have a "<slug>__<original>" prefix
      if (name.includes("__")) {
        try {
          return await proxy.routeCall(name, argObj);
        } catch (err) {
          return errorResponse(err);
        }
      }

      // Discovery tools
      try {
        await telemetry.logEvent({
          event: name.replace(/_/g, "-") as
            | "search"
            | "install"
            | "details"
            | "list-categories",
          slug: (argObj.slug as string) || null,
          client: (argObj.client as string) || null,
          query: (argObj.query as string) || null,
        });

        switch (name) {
          case "search_servers": {
            const results = await searchServers({
              query: argObj.query as string,
              category: argObj.category as string | undefined,
              limit: argObj.limit as number | undefined,
            });
            const text =
              `Found ${results.length} MCP server(s):\n\n` +
              results
                .map(
                  (s) =>
                    `**${s.name}** (${s.category})\n` +
                    `${s.tagline}\n` +
                    `Pricing: ${s.pricing} | Rating: ${s.rating ?? "N/A"} | Downloads: ${s.downloads}\n` +
                    `Slug: \`${s.slug}\``
                )
                .join("\n\n") +
              `\n\nNext steps:\n` +
              `• \`get_server_details\` for full info on any server\n` +
              `• \`add_to_stack\` to add a server to this Launcher (becomes available in your AI client after restart)\n` +
              `• \`install_server\` for the manual install snippet`;
            return { content: [{ type: "text", text }] };
          }

          case "get_server_details": {
            const details = await getServerDetails(argObj.slug as string);
            const text =
              `# ${details.name}\n\n${details.description}\n\n` +
              `**Pricing:** ${details.pricingType}\n` +
              `**Category:** ${details.category}\n` +
              `**Rating:** ${details.rating ?? "N/A"}\n` +
              `**Downloads:** ${details.downloadCount}\n\n` +
              `**Repository:** ${details.repo || "N/A"}\n` +
              `**Docs:** ${details.docsUrl || "N/A"}\n\n` +
              `Add this server to your Launcher stack with:\n` +
              `\`add_to_stack\` (slug: "${details.slug}")\n` +
              `Or get the manual install snippet with \`install_server\`.`;
            return { content: [{ type: "text", text }] };
          }

          case "install_server": {
            const config = await installServer(
              argObj.slug as string,
              (argObj.client || "claude") as "claude" | "cursor" | "windsurf"
            );
            return { content: [{ type: "text", text: config }] };
          }

          case "list_categories": {
            const categories = listCategories();
            const text =
              `Available MCP server categories:\n\n${categories.map((c) => `• ${c}`).join("\n")}\n\n` +
              `Use the category parameter in search_servers to filter results.`;
            return { content: [{ type: "text", text }] };
          }

          case "add_to_stack": {
            const slug = argObj.slug as string;
            if (!slug) throw new Error("slug is required");
            const result = await addToStack(slug, {
              env: (argObj.env as Record<string, string>) || {},
              nonInteractive: true,
            });
            return {
              content: [
                {
                  type: "text",
                  text:
                    `✅ Added \`${slug}\` to your Launcher stack.\n\n` +
                    `${result.summary}\n\n` +
                    `**Restart your AI client** for the new tools to appear. ` +
                    `They'll be exposed as \`${slug}__<tool>\`.`,
                },
              ],
            };
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown tool: ${name}` }],
              isError: true,
            };
        }
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[launcher] v${VERSION} ready (stack: ${stack.entries.length} server(s))`
  );

  // Graceful shutdown
  const shutdown = async () => {
    await proxy.shutdown().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ─── Static tool definitions ─────────────────────────────────────────────────

const DISCOVERY_TOOLS = [
  {
    name: "search_servers",
    description:
      "Search the CuratedMCP catalog for MCP servers by keyword, category, or use case",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g. 'GitHub', 'database', 'Stripe')",
        },
        category: {
          type: "string",
          enum: [
            "DEVELOPER_TOOLS",
            "WEB_AUTOMATION",
            "DATABASE",
            "CLOUD_SERVICES",
            "AI_AGENTS",
            "PRODUCTIVITY",
            "COMMUNICATION",
            "ANALYTICS",
          ],
          description: "Filter by category",
        },
        limit: {
          type: "number",
          description: "Max results (default 10, max 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_server_details",
    description:
      "Get full details about a specific MCP server including install instructions",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "Server slug (from search results)" },
      },
      required: ["slug"],
    },
  },
  {
    name: "install_server",
    description:
      "Get the manual install configuration snippet for an MCP server (use add_to_stack instead if you want it managed by Launcher)",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "Server slug" },
        client: {
          type: "string",
          enum: ["claude", "cursor", "windsurf"],
          description: "Target client (default: claude)",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "list_categories",
    description: "List all available MCP server categories",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "add_to_stack",
    description:
      "Add an MCP server to your Launcher stack so its tools become available through Launcher in every AI client. The server's tools appear as `<slug>__<tool>` after the AI client is restarted.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description:
            "Server slug from the CuratedMCP catalog (use search_servers to find one)",
        },
        env: {
          type: "object",
          description:
            "Environment variables for the server (e.g. API keys). Required env vars must be supplied here.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["slug"],
    },
  },
];

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}
