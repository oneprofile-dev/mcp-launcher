const API_URL = process.env.CURATOR_API_URL || "https://www.curatedmcp.com";

const CLIENT_PATHS: Record<"claude" | "cursor" | "windsurf", string> = {
  claude: "~/Library/Application Support/Claude/claude_desktop_config.json",
  cursor: "~/.cursor/mcp.json",
  windsurf: "~/.codeium/windsurf/mcp_config.json",
};

interface ServerData {
  name: string;
  command: string;
  args?: string[];
  documentationUrl?: string;
  environmentVariables?: Array<{ key: string; description?: string }>;
}

export async function installServer(
  slug: string,
  client: "claude" | "cursor" | "windsurf" = "claude"
): Promise<string> {
  // Fetch server metadata
  const url = `${API_URL}/api/servers/${slug}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "@curatedmcp/launcher/1.0.0" },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Server "${slug}" not found`);
    }
    throw new Error(`Failed to fetch server: ${res.status}`);
  }

  const server = (await res.json()) as ServerData;
  const configPath = CLIENT_PATHS[client];

  // Build config snippet based on server command type
  const configEntry: Record<string, any> = {};

  if (server.command === "npx") {
    configEntry.command = "npx";
    configEntry.args = ["-y", server.args?.[0] || slug];
  } else if (server.command === "uvx") {
    configEntry.command = "uvx";
    configEntry.args = server.args || [];
  } else if (server.command === "node") {
    configEntry.command = "node";
    configEntry.args = server.args || [];
  } else {
    configEntry.command = server.command;
    configEntry.args = server.args || [];
  }

  // Add environment variables if present
  if (server.environmentVariables && server.environmentVariables.length > 0) {
    configEntry.env = server.environmentVariables.reduce(
      (acc: Record<string, string>, v) => {
        acc[v.key] = `<your-${v.key.toLowerCase()}>`;
        return acc;
      },
      {}
    );
  }

  const configJson = JSON.stringify(
    {
      mcpServers: {
        [slug]: configEntry,
      },
    },
    null,
    2
  );

  // Prepare markdown response
  const markdown = `# Install ${server.name}

Add this to your \`${client}\` MCP config file:

\`\`\`json
${configJson}
\`\`\`

**Config path for ${client.toUpperCase()}:**
\`\`\`
${configPath}
\`\`\`

${
  server.environmentVariables && server.environmentVariables.length > 0
    ? `**Environment variables needed:**\n\n${server.environmentVariables.map((v) => `- \`${v.key}\`: ${v.description || "See docs"}`).join("\n")}\n\n`
    : ""
}

**Learn more:** ${server.documentationUrl || `https://www.curatedmcp.com/marketplace/${slug}`}

Once installed, restart your client and ${server.name} will be available to use with \`@\` prompts.`;

  return markdown;
}
