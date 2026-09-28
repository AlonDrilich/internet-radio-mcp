# Submission notes (owner checklist)

Research date: 2026-09-28. Everything in this repo is local only. Nothing has been pushed, published or submitted.

## 1. SDK state of the art (what this server is built on)

- **The MCP TypeScript SDK now has two lines.**
  - **v2 is the stable line.** It ships as split packages: `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.1.0 (released 2026-09-23; 2.0.0 was released 2026-07-27). It is on the SDK's `main` branch and implements the 2026-07-28 spec.
  - **v1 is maintenance only.** `@modelcontextprotocol/sdk` 1.30.1 gets "bug fixes and security updates for at least 6 months after v2's release", according to the SDK README.
- **The current server API:**
  - `new McpServer(info, { instructions })`.
  - `server.registerTool(name, { title, description, inputSchema: z.object(...), outputSchema: z.object(...), annotations }, handler)`.
  - `server.registerPrompt(name, { argsSchema }, cb)`.
  - `serveStdio(factory)` from `@modelcontextprotocol/server/stdio`. It replaces `new StdioServerTransport()` + `connect()` and serves both 2025-era clients (`initialize` handshake) and 2026-era clients from the same factory.
  - Schemas are Standard Schema, and zod v4 (>= 4.2) is the documented choice.
- **`outputSchema` and `structuredContent` are supported cleanly.** The SDK validates `structuredContent` before sending it. Every tool here uses them and also returns the JSON as text for older clients.
- **Why v2 and not `@modelcontextprotocol/sdk`:**
  - v2 is the recommended line.
  - Its runtime tree is only 3 packages (`server`, `core`, `zod`). v1 pulls in 91 packages (express, hono, etc.).
  - Verified by raw stdio: a client asking for protocol `2025-06-18` or `2025-11-25` gets that version back, so current Claude Desktop, Claude Code, Cursor and VS Code clients are served.
- **Consequence: `engines.node` is `>=20`, not `>=18`.** `@modelcontextprotocol/server` itself declares `node >=20`, and Node 18 has been end-of-life since April 2025.

## 2. How `npx -y github:AlonDrilich/internet-radio-mcp` works without an npm publish

- **The source is plain ES modules with JSDoc types, so there is no build step.**
  - `bin` points at `src/index.js`, which has a shebang and is committed with the executable bit.
  - There is no `dist/` and no `prepare` script.
- **npm installs only the 3 runtime packages.** It fetches the git ref and installs `@modelcontextprotocol/server`, `@modelcontextprotocol/core` and `zod`. No devDependencies and no compiler run on the user's machine.
- **Verified locally with fresh, isolated npm caches:**
  - `npx -y git+file://<repo>` passed the full smoke test (all tools against the live API). This is the same git-dependency code path npm uses for `github:` specs.
  - `npm pack` + `npx -y --package=./internet-radio-mcp-1.0.0.tgz internet-radio-mcp` also passed the full smoke test. This is the flow a future npm publish would use.
- **The alternative (a `prepare` build) was tested and rejected.** A variant with a `prepare` script also works on npm 11. However, it installs the whole devDependency tree (TypeScript and the rest) and runs a build inside the MCP client's first launch. That is slower and a known failure point on older npm versions and locked-down machines.
- **Type safety is still checked.** `npm run typecheck` runs `tsc` with `checkJs` and `strict` over `src/` and `scripts/`. It was confirmed to catch an injected error, so it is not a no-op config.

## 3. awesome-mcp-servers (punkpeye/awesome-mcp-servers)

### Rules

These come from CONTRIBUTING.md, the README legend, and the `.github/workflows/check-glama.yml` bot that labels every PR.

- **Scope.** The list is for servers with a public GitHub repo that you install and run yourself. Remote-only servers go to awesome-remote-mcp-servers.
- **Format.** One line per server, in the right category, in alphabetical order within the category, following the existing style.
- **Link text must be `owner/repo`.** The bot labels a PR `invalid-name` otherwise.
- **The primary link must be a `https://github.com/...` URL.** The bot labels a PR `non-github-url` otherwise.
- **No duplicates.** The bot labels a PR `duplicate` otherwise.
- **A Glama score badge is effectively required.** The bot labels a PR `missing-glama` and asks for:
  1. The server listed on https://glama.ai/mcp/servers and passing its checks. Glama only needs the server to start and answer introspection. Its comment says the Dockerfile must be added on Glama itself.
  2. This badge placed right after the repo link:
     `[![OWNER/REPO MCP server](https://glama.ai/mcp/servers/OWNER/REPO/badges/score.svg)](https://glama.ai/mcp/servers/OWNER/REPO)`
- **Emojis come from a fixed legend.** Any other emoji gets the PR labeled `missing-emoji`.
  - 🎖️ official
  - Language: 🐍 Python, 📇 TypeScript/JavaScript, 🏎️ Go, 🦀 Rust, #️⃣ C#, ☕ Java, 🌊 C/C++, 💎 Ruby
  - Scope: ☁️ cloud service, 🏠 local service, 📟 embedded
  - OS: 🍎 macOS, 🪟 Windows, 🐧 Linux
  - The legend says to use ☁️ when the server talks to remote APIs (this server does) and 🏠 when it controls locally installed software.
- **CONTRIBUTING.md also has a note addressed to automated agents.** It says agent PRs can opt in to a fast track by adding `🤖🤖🤖` to the PR title. This applies only if an agent opens the PR. If you open it yourself, ignore it.

### Category

**🎨 Art & Culture** (`#art-and-culture`). This is where the list keeps music and listening services: Spotify (gupta-kush/spotify-mcp, XavierFabregat/spotify-mcp), Apple Music, Discogs, and Bide & Musique (a French music radio catalogue). No internet-radio server is listed yet. A search for "radio" found only GNU Radio, which is RF software.

The fallback category would be 🎥 Multimedia Process. It is less apt because it covers audio and video editing and conversion.

### Exact line to add

Insert it alphabetically (case-insensitive) between `aliafsahnoudeh/shahnameh-mcp-server` and `arikusi/nakkas`:

```markdown
- [AlonDrilich/internet-radio-mcp](https://github.com/AlonDrilich/internet-radio-mcp) [![AlonDrilich/internet-radio-mcp MCP server](https://glama.ai/mcp/servers/AlonDrilich/internet-radio-mcp/badges/score.svg)](https://glama.ai/mcp/servers/AlonDrilich/internet-radio-mcp) 📇 ☁️ 🍎 🪟 🐧 - Search 50,000+ internet radio stations from the public-domain Radio Browser directory by name, genre, country or language; get stream URLs, top and trending stations, countries and genres.
```

- **Check the Glama path before submitting.** After you add the server on Glama, confirm that its URL really is `glama.ai/mcp/servers/AlonDrilich/internet-radio-mcp`. Some older entries use an `@owner/repo` path, so copy the path Glama actually shows.
- **Suggested PR title:** `Add AlonDrilich/internet-radio-mcp (Art & Culture)`.

## 4. Official MCP Registry (registry.modelcontextprotocol.io)

`server.json` follows the current schema, `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`. That is the newest dated schema; the registry only has an unreleased draft beyond it. It was validated locally against that schema with ajv. Its contents:

- `name`: `io.github.AlonDrilich/internet-radio-mcp`. This is a GitHub namespace, so you authenticate with GitHub as AlonDrilich.
- One `npm` package entry, `internet-radio-mcp@1.0.0`, with stdio transport and `runtimeHint: npx`.
- `package.json` has the matching `"mcpName": "io.github.AlonDrilich/internet-radio-mcp"`. The registry uses this to verify npm ownership.

**The registry hosts metadata only.** It does not accept a bare GitHub repo; it needs a package on a supported registry, or a remote URL. The npm name `internet-radio-mcp` was free on 2026-09-28. Publishing is the owner's step:

```sh
npm login
npm publish --access public          # publishes internet-radio-mcp@1.0.0 (files: src/, README, LICENSE, server.json)
brew install mcp-publisher           # or download the release binary from github.com/modelcontextprotocol/registry
mcp-publisher login github           # device-flow login as AlonDrilich
mcp-publisher publish                # reads ./server.json
```

- **Alternative that skips npm:** attach an `.mcpb` bundle to a GitHub Release. You would then switch the package entry to `registryType: "mcpb"` with the release URL and a `fileSha256`. This is more moving parts.
- **Keep versions in sync.** `version` in `server.json` must be bumped together with `package.json` on every release.
- **The registry is still in preview.** Its docs say "breaking changes or data resets may occur".

## 5. Owner to-do, in order

1. **Create the public GitHub repo `AlonDrilich/internet-radio-mcp`** (MIT) and push this local repo (`git remote add origin …; git push -u origin main`).
2. **Test the npx install from GitHub** on a clean machine or cache:
   - `npx -y github:AlonDrilich/internet-radio-mcp --version` should print `1.0.0`.
   - `claude mcp add internet-radio -- npx -y github:AlonDrilich/internet-radio-mcp`, then ask "Find jazz stations in Brazil".
3. **Add the server on Glama** (https://glama.ai/mcp/servers):
   - `glama.json`, which claims maintainership for `AlonDrilich`, and a `Dockerfile` are already in the repo. Paste or point Glama at the Dockerfile if it asks.
   - Wait for the checks and score to appear.
4. **Open the awesome-mcp-servers PR** with the line in section 3, using the real Glama path.
5. **Optional: npm publish and the MCP Registry** (section 4). After publishing, the shorter `npx -y internet-radio-mcp` also works. The README uses the `github:` form, so it stays correct either way.

## Local verification summary

- `npm run typecheck`: clean. It is confirmed to catch errors.
- `npm run smoke`: all checks pass against the live Radio Browser API.
  - 5 tools listed, all `readOnlyHint` + `openWorldHint`, all with an `outputSchema`, plus the `find_radio` prompt.
  - Jazz stations in BR, top stations in JP by votes, trending, and clicks for rock.
  - `get_station` round-trip, the BBC World Service stream URL, and `list_countries` with 72FM country page URLs.
  - `list_genres` with noise tags filtered out.
  - Validation error and unknown-id error paths.
  - The all-mirrors-down path returns a clear tool error and the server stays up.
- The same smoke test passed through `npx -y git+file://…` and through `npx` of the `npm pack` tarball, each with a fresh npm cache.
- The Dockerfile's steps (`npm ci --omit=dev --ignore-scripts`, `node src/index.js`) were simulated outside Docker: the server answered `initialize` and `tools/list`. The image itself was not built because the local Docker daemon was not running.
