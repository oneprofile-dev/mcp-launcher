# curatedmcp

[![npm version](https://img.shields.io/npm/v/curatedmcp?color=brightgreen)](https://www.npmjs.com/package/curatedmcp)
[![npm downloads](https://img.shields.io/npm/dm/curatedmcp)](https://www.npmjs.com/package/curatedmcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js ≥18](https://img.shields.io/node/v/curatedmcp)](https://nodejs.org)

> **The CuratedMCP Agent.** One CLI to **discover, run, audit, and govern** every MCP server your AI tools (Claude, Cursor, Windsurf, Copilot, Gemini) use.

```bash
# 10-second risk scan of your machine — no signup
npx curatedmcp audit
```

**Plug it in once. Add servers anytime. Audit and govern them from one place.**

---

## What you get

| Command | What it does |
| --- | --- |
| `curatedmcp audit` | Scan your MCP configs for risky servers (high/medium/low). Zero auth, instant value. |
| `curatedmcp` *(no args)* | Run as an MCP hub server over stdio for Claude, Cursor, Windsurf, etc. |
| `curatedmcp add <slug>` | Add a server from the CuratedMCP catalog to your stack. |
| `curatedmcp remove <slug>` | Remove a server from your stack. |
| `curatedmcp list` | Show your current stack. |
| `curatedmcp init` | Print the config snippet to drop into your AI client. |
| `curatedmcp guard -- <cmd>` | Run a server behind the local action firewall. |
| `curatedmcp login` | Authenticate the agent to your CuratedMCP account. |
| `curatedmcp sync` | Pull your team's registry config and push audit results. |

---

## 1. Audit (the wedge — start here)

```bash
npx curatedmcp audit
```

Scans every MCP config file on your machine (Claude Desktop, Cursor, Windsurf, Claude Code, …),
classifies each server against the CuratedMCP catalog, and flags:

- 🔴 **HIGH** — unverified or known-risky servers with credentials
- 🟡 **MEDIUM** — verified servers running outside catalog defaults
- 🟢 **VERIFIED** — known-good catalog servers

No signup, no cloud, no data leaves your machine. Logged in? Add `--sync` to push the result to your dashboard.

---

## 2. Run as the MCP Hub

If you use MCP servers across multiple AI clients, you've felt this pain: configure GitHub MCP in
Claude Desktop, then re-do it in Cursor, then in Windsurf. New agent ships? Re-paste every config.

The agent fixes that. It's one MCP entry that fans out to every server you've added, in every AI client.

```
   Claude   Cursor   Windsurf   Copilot   Gemini
       \      \      |      /      /
        ┌──────────────────────────┐
        │       curatedmcp         │   ← one config in each agent
        │     (the MCP hub)        │
        └────┬──────┬──────┬───────┘
             │      │      │
          GitHub  Postgres  Stripe   ← `add`'d once, available everywhere
```

### Add it to your AI client

```json
{
  "mcpServers": {
    "curatedmcp": {
      "command": "npx",
      "args": ["-y", "curatedmcp"]
    }
  }
}
```

| Client          | Path                                                                  |
| --------------- | --------------------------------------------------------------------- |
| Claude Desktop  | `~/Library/Application Support/Claude/claude_desktop_config.json` (mac) / `%APPDATA%\Claude\claude_desktop_config.json` (win) |
| Cursor          | `~/.cursor/mcp.json`                                                  |
| Windsurf        | `~/.codeium/windsurf/mcp_config.json`                                 |
| Claude Code     | `~/.claude/mcp.json` (or `.claude/mcp.json` per-project)              |

### Add servers to your stack

```bash
npx curatedmcp add github          # prompts for GITHUB_TOKEN
npx curatedmcp add postgres --env DATABASE_URL=postgres://...
npx curatedmcp list
```

### Restart your AI client

Tools appear with a `<slug>__` prefix:

- `github__create_issue`
- `postgres__query`
- `filesystem__read_file`

---

## 3. Guard (local action firewall)

```bash
npx curatedmcp guard -- npx -y @modelcontextprotocol/server-github
```

Wraps an MCP server with a local policy engine that gates every `tools/call` against
`~/.curatedmcp/guard-policy.json`. Default policy allows read, prompts on write, blocks destructive.

```bash
npx curatedmcp guard --dashboard --port 7878 -- npx -y @some/server
# Then open http://localhost:7878 for the live action log
```

---

## 4. Login + sync (for teams)

Once you have a CuratedMCP account, link the CLI to it:

```bash
npx curatedmcp login                  # paste a registry key from your dashboard
npx curatedmcp sync                   # pull team registry config + push audit results
npx curatedmcp sync --team acme-eng   # pick a specific team if you're in more than one
```

Sync pulls the locked-down server list approved by your team and merges it into your local stack —
so every developer's machine runs the same vetted set of servers.

---

## Config files

`~/.curatedmcp/stack.json` — your stack, plain JSON, hand-editable, version-controllable:

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

Other files (created on first use):

- `~/.curatedmcp/auth.json` — login token (mode 0600)
- `~/.curatedmcp/guard-policy.json` — firewall policy
- `~/.curatedmcp/launcher.json` — anonymous client UUID

---

## In-agent discovery

The agent itself exposes discovery tools to your AI client, so you can ask:

> "Find me an MCP server for Postgres."
> "What's the best Stripe MCP?"
> "Add the Postgres MCP server to my stack."

The agent uses `search_servers`, `get_server_details`, and `add_to_stack` to do all of that without you leaving the chat.

---

## Privacy

- **All config is local** at `~/.curatedmcp/`. No cloud sync unless you `login`.
- **Anonymous telemetry only** (event names like "search", "add"). Disable with `--no-telemetry` or `CURATOR_TELEMETRY=false`.
- Audit results stay on your machine unless you `login` and run `--sync`.

---

## Compatibility

- Works with Claude Desktop, Claude Code, Cursor, Windsurf, Copilot, Gemini, OpenAI Agents — anything that supports MCP over stdio.
- Node.js ≥ 18.

---

## Migrating from the old packages

The agent replaces three earlier packages, which are now deprecated:

| Old | New |
| --- | --- |
| `@curatedmcp/launcher` | `curatedmcp` *(no args)* / `curatedmcp add` / `curatedmcp list` |
| `@curatedmcp/auditor` *(aka `mcp-audit`)* | `curatedmcp audit` |
| `@curatedmcp/sentinel` *(aka `sentinel`)* | `curatedmcp guard` |

A `launcher` bin alias is kept for back-compat.

---

## Links

- 🌐 [curatedmcp.com/launcher](https://curatedmcp.com/launcher)
- 📚 [Marketplace](https://curatedmcp.com/marketplace)
- 🐙 [GitHub](https://github.com/oneprofile-dev/mcp-launcher)
- 💬 [Issues](https://github.com/oneprofile-dev/mcp-launcher/issues)

MIT licensed.
