/**
 * `launcher init` — print the one-line config snippet to add Launcher to each AI client.
 *
 * This is the lowest-friction onboarding: a developer who just installed Launcher
 * runs `launcher init`, copy-pastes the snippet that matches their tool, and they're done.
 */
import { stackPath } from "../stack.js";

const CONFIG_SNIPPET = JSON.stringify(
  {
    mcpServers: {
      curatedmcp: {
        command: "npx",
        args: ["-y", "@curatedmcp/launcher"],
      },
    },
  },
  null,
  2
);

const INSTRUCTIONS = `
@curatedmcp/launcher — The MCP Hub
Add this entry to your AI client's MCP config:

${CONFIG_SNIPPET}

Config locations:
  Claude Desktop  ~/Library/Application Support/Claude/claude_desktop_config.json
                  %APPDATA%\\Claude\\claude_desktop_config.json   (Windows)
  Cursor          ~/.cursor/mcp.json
  Windsurf        ~/.codeium/windsurf/mcp_config.json
  Claude Code     ~/.claude/mcp.json (or .claude/mcp.json in your project)

Then add servers to your stack:
  launcher add github           # interactive — prompts for GITHUB_TOKEN
  launcher add postgres         # adds the Postgres server
  launcher list                 # see your stack

Servers in your stack live at:
  ${stackPath()}

Restart your AI client after adding/removing servers — their tools will appear
under the prefix "<slug>__" (e.g. "github__create_issue").
`.trim();

export function runInit(): number {
  console.log(INSTRUCTIONS);
  return 0;
}
