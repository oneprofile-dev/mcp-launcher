import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { MCPServerEntry } from "./types.js";

interface ConfigFile {
  filePath: string;
  servers: MCPServerEntry[];
}

// All known MCP config locations, keyed by platform
function getConfigPaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;
  const appdata = process.env.APPDATA ?? "";

  const paths: string[] = [
    // Claude Code — user-level
    path.join(home, ".claude", "mcp.json"),
    // Claude Code — project-level (current working directory)
    path.join(process.cwd(), ".claude", "mcp.json"),
  ];

  if (platform === "darwin" || platform === "linux") {
    paths.push(
      // Claude Desktop (macOS)
      path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      // Cursor (macOS/Linux)
      path.join(home, ".cursor", "mcp.json"),
      // Windsurf (macOS/Linux)
      path.join(home, ".codeium", "windsurf", "mcp_config.json"),
    );
  }

  if (platform === "win32") {
    paths.push(
      // Claude Desktop (Windows)
      path.join(appdata, "Claude", "claude_desktop_config.json"),
      // Cursor (Windows)
      path.join(appdata, ".cursor", "mcp.json"),
      // Windsurf (Windows)
      path.join(appdata, "Codeium", "Windsurf", "mcp_config.json"),
    );
  }

  return paths;
}

function parseConfig(filePath: string): MCPServerEntry[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);
    const servers = json.mcpServers ?? {};
    return Object.entries(servers).map(([name, def]: [string, unknown]) => {
      const d = def as Record<string, unknown>;
      return {
        name,
        command: typeof d.command === "string" ? d.command : undefined,
        args: Array.isArray(d.args) ? (d.args as string[]) : undefined,
        env: typeof d.env === "object" && d.env !== null
          ? (d.env as Record<string, string>)
          : undefined,
        url: typeof d.url === "string" ? d.url : undefined,
        type: typeof d.type === "string" ? d.type : undefined,
        sourceFile: filePath,
      };
    });
  } catch {
    return [];
  }
}

export function scanConfigs(): ConfigFile[] {
  const results: ConfigFile[] = [];
  for (const filePath of getConfigPaths()) {
    if (fs.existsSync(filePath)) {
      const servers = parseConfig(filePath);
      results.push({ filePath, servers });
    }
  }
  return results;
}
