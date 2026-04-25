#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { searchServers } from "./tools/search.js";
import { getServerDetails } from "./tools/get-details.js";
import { installServer } from "./tools/install.js";
import { listCategories } from "./tools/list-categories.js";
import { Telemetry } from "./telemetry.js";

const telemetry = new Telemetry();

const server = new Server(
  {
    name: "curatedmcp-launcher",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
          slug: {
            type: "string",
            description: "Server slug (from search results)",
          },
        },
        required: ["slug"],
      },
    },
    {
      name: "install_server",
      description:
        "Get the install configuration snippet for a specific MCP server and client",
      inputSchema: {
        type: "object" as const,
        properties: {
          slug: {
            type: "string",
            description: "Server slug",
          },
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
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    await telemetry.logEvent({
      event: name.replace(/_/g, "-") as any,
      slug: args.slug || null,
      client: args.client || null,
      query: args.query || null,
    });

    switch (name) {
      case "search_servers": {
        const results = await searchServers({
          query: args.query as string,
          category: args.category as string | undefined,
          limit: args.limit as number | undefined,
        });
        return {
          content: [
            {
              type: "text",
              text:
                `Found ${results.length} MCP server(s):\n\n` +
                results
                  .map(
                    (s) =>
                      `**${s.name}** (${s.category})\n` +
                      `${s.tagline}\n` +
                      `Pricing: ${s.pricing} | Rating: ${s.rating || "N/A"} | Downloads: ${s.downloads}\n` +
                      `Slug: \`${s.slug}\``
                  )
                  .join("\n\n") +
                `\n\nTo get more details, call \`get_server_details\` with the server slug.` +
                `\nTo install one, call \`install_server\` with the slug and client.`,
            },
          ],
        };
      }

      case "get_server_details": {
        const details = await getServerDetails(args.slug as string);
        return {
          content: [
            {
              type: "text",
              text: `# ${details.name}\n\n${details.description}\n\n**Pricing:** ${details.pricingType}\n**Category:** ${details.category}\n**Rating:** ${details.rating || "N/A"}\n**Downloads:** ${details.downloadCount}\n\n**Repository:** ${details.repo || "N/A"}\n**Docs:** ${details.docsUrl || "N/A"}\n\nCall \`install_server\` with slug "${details.slug}" to get the config snippet.`,
            },
          ],
        };
      }

      case "install_server": {
        const config = await installServer(
          args.slug as string,
          (args.client || "claude") as "claude" | "cursor" | "windsurf"
        );
        return {
          content: [
            {
              type: "text",
              text: config,
            },
          ],
        };
      }

      case "list_categories": {
        const categories = listCategories();
        return {
          content: [
            {
              type: "text",
              text: `Available MCP server categories:\n\n${categories.map((c) => `• ${c}`).join("\n")}\n\nUse the category parameter in search_servers to filter results.`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[launcher] Started on stdio");
}

main().catch(console.error);
