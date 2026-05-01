# Contributing to @curatedmcp/launcher

Thanks for your interest in contributing! This is a small, focused package — contributions that keep it simple and reliable are most welcome.

## Getting started

```bash
git clone https://github.com/oneprofile-dev/mcp-launcher.git
cd mcp-launcher
npm install
npm run build
npm test
```

## Development workflow

```bash
npm run build          # compile TypeScript → dist/
npm test               # run vitest suite
node dist/index.js     # run as MCP server (connect via stdin)
node dist/index.js add github   # test CLI add flow
```

## What we accept

- Bug fixes with a clear repro case
- New CLI flags / subcommands that fit the "local-first hub" philosophy
- Improved error messages and user-facing UX
- Tests

## What we don't accept (yet)

- Cloud sync or remote config
- Breaking changes to `~/.curatedmcp/stack.json` schema without a migration path
- Additional npm dependencies (keep the dep tree minimal — only `@modelcontextprotocol/sdk`)

## Pull request checklist

- [ ] `npm run build` passes
- [ ] `npm test` passes  
- [ ] Smoke test: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' | node dist/index.js` exits cleanly
- [ ] Description explains the *why*, not just the what

## Publishing (maintainers only)

1. Bump version in `package.json`
2. `git tag v<version> && git push --tags`
3. GitHub Actions publishes to npm automatically on tag push

## License

MIT — your contributions will be released under the same license.
