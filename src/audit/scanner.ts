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

  const cwd = process.cwd();

  const paths: string[] = [
    // Claude Code — primary user config (top-level + per-project mcpServers)
    path.join(home, ".claude.json"),
    // Claude Code — alternate user-level location
    path.join(home, ".claude", "mcp.json"),
    // Claude Code — project-scoped config (committed to the repo)
    path.join(cwd, ".mcp.json"),
    path.join(cwd, ".claude", "mcp.json"),
    // Cursor / VS Code — project-scoped
    path.join(cwd, ".cursor", "mcp.json"),
    path.join(cwd, ".vscode", "mcp.json"),
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

  // De-dupe (cwd-based paths can collide with home when run from $HOME).
  return [...new Set(paths)];
}

function toEntries(
  servers: unknown,
  filePath: string
): MCPServerEntry[] {
  if (!servers || typeof servers !== "object") return [];
  return Object.entries(servers as Record<string, unknown>).map(
    ([name, def]) => {
      const d = (def ?? {}) as Record<string, unknown>;
      return {
        name,
        command: typeof d.command === "string" ? d.command : undefined,
        args: Array.isArray(d.args) ? (d.args as string[]) : undefined,
        env:
          typeof d.env === "object" && d.env !== null
            ? (d.env as Record<string, string>)
            : undefined,
        url: typeof d.url === "string" ? d.url : undefined,
        type: typeof d.type === "string" ? d.type : undefined,
        sourceFile: filePath,
      };
    }
  );
}

function parseConfig(filePath: string): MCPServerEntry[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw) as Record<string, unknown>;

    const entries: MCPServerEntry[] = [];
    // Top-level mcpServers (Claude Desktop, Cursor, project .mcp.json, etc.)
    entries.push(...toEntries(json.mcpServers, filePath));

    // Claude Code (~/.claude.json) nests per-project servers under projects[path].
    if (json.projects && typeof json.projects === "object") {
      for (const project of Object.values(
        json.projects as Record<string, unknown>
      )) {
        if (project && typeof project === "object") {
          entries.push(
            ...toEntries((project as Record<string, unknown>).mcpServers, filePath)
          );
        }
      }
    }

    // De-dupe servers that appear under multiple project entries of one file.
    const seen = new Set<string>();
    return entries.filter((e) => {
      const k = `${e.name}|${e.command ?? e.url ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
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
