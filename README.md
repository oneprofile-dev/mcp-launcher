# @curatedmcp/launcher

Find and install MCP servers from inside Claude, Cursor, or Windsurf — without ever leaving your AI client.

## Install (30 seconds)

Add one line to your MCP config:

**Claude Desktop**
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
Config path: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

**Cursor**
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
Config path: `~/.cursor/mcp.json`

**Windsurf**
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
Config path: `~/.codeium/windsurf/mcp_config.json`

Restart your client, and you're done.

## Usage

Ask your AI assistant:

- "Find me an MCP server for GitHub"
- "What's the best Postgres MCP?"
- "Install the Stripe MCP server"
- "List available categories"

The launcher will search a curated catalog of 60+ security-reviewed MCP servers and return install instructions.

## Tools

### `search_servers`
Search for MCP servers by keyword or category.

```
search_servers(query="postgres", category="DATABASE", limit=10)
```

### `get_server_details`
Get full details about a specific server.

```
get_server_details(slug="postgres")
```

### `install_server`
Get the install config snippet for your client.

```
install_server(slug="stripe", client="claude")
```

### `list_categories`
List all available server categories.

```
list_categories()
```

## Privacy

- **Anonymous telemetry only.** No PII, no user tracking.
- Your UUID is stored in `~/.curatedmcp/launcher.json` for deduplicating events.
- Disable telemetry: pass `--no-telemetry` to the command, or set `CURATOR_TELEMETRY=false`.

## Open source

This is open source under MIT. Report bugs and request features at https://github.com/curatedmcp/launcher

## Support

- Web: https://www.curatedmcp.com/launcher
- Docs: https://www.curatedmcp.com/docs
- GitHub Issues: https://github.com/curatedmcp/launcher/issues
