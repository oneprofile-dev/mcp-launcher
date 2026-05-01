# @curatedmcp/launcher

[![npm version](https://img.shields.io/npm/v/@curatedmcp/launcher?color=brightgreen)](https://www.npmjs.com/package/@curatedmcp/launcher)
[![npm downloads](https://img.shields.io/npm/dm/@curatedmcp/launcher)](https://www.npmjs.com/package/@curatedmcp/launcher)
[![CI](https://github.com/oneprofile-dev/mcp-launcher/actions/workflows/test.yml/badge.svg)](https://github.com/oneprofile-dev/mcp-launcher/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js ≥18](https://img.shields.io/node/v/@curatedmcp/launcher)](https://nodejs.org)

> **The MCP Hub.** One config that bridges every AI agent (Claude, Cursor, Windsurf, Copilot, Gemini) to every MCP server you register.

```bash
npx @curatedmcp/launcher init
```

**Plug it in once. Add servers anytime. Use them in any AI agent.**

---

## Why

If you use MCP servers across multiple AI clients, you've felt this pain:

- You configure GitHub MCP in Claude Desktop. Then you switch to Cursor and have to do it again.
- You add five servers to Claude. Want them in Windsurf too? Edit a different config file.
- A new AI agent ships? Re-paste every server config from scratch.

**Launcher fixes that.** It's one MCP entry that fans out to every server you've added, in every AI client.

```
   Claude   Cursor   Windsurf   Copilot   Gemini
       \      \      |      /      /
        ┌──────────────────────────┐
        │  @curatedmcp/launcher    │   ← one config in each agent
        │  (the MCP hub)           │
        └────┬──────┬──────┬───────┘
             │      │      │
          GitHub  Postgres  Stripe   ← `launcher add`'d once, available everywhere
```

---

## Install (60 seconds)

### 1. Add Launcher to your AI client

Drop this entry into your MCP config:

```json
{
  "mcpServers": {
    "curatedmcp": {
      "command": "npx",
      "args": ["-y", "@curatedmcp/launcher"]
    }
  }
}
```

Config file location:

| Client          | Path                                                                  |
| --------------- | --------------------------------------------------------------------- |
| Claude Desktop  | `~/Library/Application Support/Claude/claude_desktop_config.json` (mac) / `%APPDATA%\Claude\claude_desktop_config.json` (win) |
| Cursor          | `~/.cursor/mcp.json`                                                  |
| Windsurf        | `~/.codeium/windsurf/mcp_config.json`                                 |
| Claude Code     | `~/.claude/mcp.json` (or `.claude/mcp.json` per-project)              |

### 2. Add servers to your stack

```bash
npx @curatedmcp/launcher add github
# Prompts for GITHUB_TOKEN

npx @curatedmcp/launcher add postgres --env DATABASE_URL=postgres://...
npx @curatedmcp/launcher list
```

### 3. Restart your AI client

Tools appear with a `<slug>__` prefix:

- `github__create_issue`
- `postgres__query`
- `filesystem__read_file`

That's it. Add more servers any time — just `add` and restart.

---

## CLI Reference

```
launcher                      # Run as MCP server (used by AI clients)
launcher init                 # Print the config snippet for your AI client
launcher add <slug>           # Add a server from the CuratedMCP catalog
  --env KEY=value             # Pre-supply env vars (otherwise prompted)
launcher remove <slug>        # Remove a server from your stack
launcher list                 # Show your stack
launcher --version            # Print version
launcher --help               # Print help
```

---

## How it works

1. Your AI client launches `npx @curatedmcp/launcher` over stdio (one MCP entry, like any other).
2. Launcher reads `~/.curatedmcp/stack.json` and **spawns each registered server as a child process** over stdio.
3. On `tools/list`, Launcher **aggregates** every child's tools and returns them prefixed with the server's slug.
4. On `tools/call`, Launcher **routes** the request to the matching child by name prefix and forwards the response unchanged.

This makes Launcher invisible to the agent — it sees one MCP server with all the tools — while behind the scenes you've got N independent processes, isolated, each with its own credentials.

---

## Config file

`~/.curatedmcp/stack.json` — plain JSON, hand-editable, version-controllable:

```json
{
  "version": 1,
  "entries": [
    {
      "slug": "github",
      "name": "GitHub",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx" },
      "addedAt": "2026-05-01T10:14:00.000Z"
    }
  ]
}
```

Set `"disabled": true` on an entry to skip it without removing it.

---

## In-agent discovery

Launcher itself exposes 5 discovery tools to your AI client, so you can ask the agent:

> "Find me an MCP server for Postgres."
> "What's the best Stripe MCP?"
> "Add the Postgres MCP server to my stack."

The agent uses `search_servers`, `get_server_details`, and `add_to_stack` to do all of that without you leaving the chat.

---

## Privacy

- **All config is local** at `~/.curatedmcp/stack.json`. No cloud sync, no account.
- **Anonymous telemetry only** (event names like "search", "add"). Disable with `--no-telemetry` or `CURATOR_TELEMETRY=false`.
- A persistent UUID is stored at `~/.curatedmcp/launcher.json` for de-duplication.

---

## Compatibility

- Works with Claude Desktop, Claude Code, Cursor, Windsurf, Copilot, Gemini, OpenAI Agents — anything that supports MCP over stdio.
- Node.js ≥ 18.
- Single dependency: `@modelcontextprotocol/sdk`.

---

## Links

- 🌐 [curatedmcp.com/launcher](https://curatedmcp.com/launcher)
- 📚 [Marketplace](https://curatedmcp.com/marketplace)
- 🐙 [GitHub](https://github.com/curatedmcp/launcher)
- 💬 [Issues](https://github.com/curatedmcp/launcher/issues)

MIT licensed.
