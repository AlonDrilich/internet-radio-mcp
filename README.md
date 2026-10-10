# internet-radio-mcp

An open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for internet radio. It lets Claude, Cursor, VS Code Copilot and other MCP clients search radio stations worldwide and get their direct stream URLs. It also lists top and trending stations, countries and genres.

The station data comes from [Radio Browser](https://www.radio-browser.info), a community-maintained, public-domain directory with over 50,000 stations that have working streams. The server is built by [72FM](https://72fm.com), a free web radio player built on the same directory. Every result includes a `listen_url` that plays the station in the browser on 72FM, as well as the station's own `stream_url`.

> Stations belong to their broadcasters. Neither 72FM nor this server owns, operates or curates them. Anyone can add or edit entries in the directory, so a stream can occasionally be offline.

- No API key, no account, read-only.
- 5 tools, 1 prompt, stdio transport.
- Runtime dependencies: `@modelcontextprotocol/server` (the official MCP TypeScript SDK, v2) and `zod`.

## Example questions

- "Find jazz stations in Brazil"
- "What are the most popular stations in Japan?"
- "Give me the stream URL for BBC World Service"
- "What's trending on internet radio right now?"
- "Which countries have the most radio stations?"
- "What genres can I search for? Then find me some lofi stations."

## Install

Requires Node.js 20 or newer. The server runs straight from GitHub with `npx`, so there is nothing to install globally.

### Claude Code

```sh
claude mcp add internet-radio -- npx -y github:AlonDrilich/internet-radio-mcp
```

Then run `/mcp` in a session to confirm that `internet-radio` is connected.

### Claude Desktop

Open **Settings → Developer → Edit Config**. This opens `claude_desktop_config.json`: on macOS it is at `~/Library/Application Support/Claude/claude_desktop_config.json`, and on Windows at `%APPDATA%\Claude\claude_desktop_config.json`. Add:

```json
{
  "mcpServers": {
    "internet-radio": {
      "command": "npx",
      "args": ["-y", "github:AlonDrilich/internet-radio-mcp"]
    }
  }
}
```

Restart Claude Desktop.

### Cursor

[Add to Cursor](https://cursor.com/en/install-mcp?name=internet-radio&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImdpdGh1YjpBbG9uRHJpbGljaC9pbnRlcm5ldC1yYWRpby1tY3AiXX0%3D) with one click, or add the server to `~/.cursor/mcp.json` to use it everywhere, or to `.cursor/mcp.json` to use it in one project:

```json
{
  "mcpServers": {
    "internet-radio": {
      "command": "npx",
      "args": ["-y", "github:AlonDrilich/internet-radio-mcp"]
    }
  }
}
```

### VS Code (GitHub Copilot, Agent mode)

[Install in VS Code](https://insiders.vscode.dev/redirect/mcp/install?name=internet-radio&config=%7B%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22github%3AAlonDrilich%2Finternet-radio-mcp%22%5D%7D) with one click, or add the server to `.vscode/mcp.json`, or run **MCP: Add Server** from the Command Palette:

```json
{
  "servers": {
    "internet-radio": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:AlonDrilich/internet-radio-mcp"]
    }
  }
}
```

### Gemini CLI

```sh
gemini extensions install https://github.com/AlonDrilich/internet-radio-mcp
```

The repository carries a `gemini-extension.json`, so the server is added as the `internet-radio` extension.

### Other clients

Any MCP client that can launch a stdio server can use the same command: `npx -y github:AlonDrilich/internet-radio-mcp`.

The first launch downloads the package from GitHub, which takes a few seconds. Later launches use the npx cache.

### Docker

The same server is published as a container image, and is listed in the [official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.AlonDrilich/internet-radio-mcp) as `io.github.AlonDrilich/internet-radio-mcp`:

```sh
docker run -i --rm ghcr.io/alondrilich/internet-radio-mcp:latest
```

In a client config, use `"command": "docker"` with `"args": ["run", "-i", "--rm", "ghcr.io/alondrilich/internet-radio-mcp:latest"]`.

## Tools

All tools are read-only and annotated with `readOnlyHint: true` and `openWorldHint: true`. Each result contains:

- a one-line summary,
- the same data as JSON text,
- `structuredContent` that matches the tool's `outputSchema`.

Broken streams (streams that failed the directory's last automated check) are excluded from searches.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `search_stations` | `name?`, `tag?` (genre), `countrycode?` (ISO 3166-1 alpha-2, e.g. `BR`), `language?` (e.g. `portuguese`), `order` = `votes` \| `clickcount` (default `votes`), `limit` 1–50 (default 10) | Matching stations |
| `get_station` | `id` (Radio Browser `stationuuid`) | One station |
| `top_stations` | `by` = `votes` \| `clicks` \| `trending` (default `votes`), `countrycode?`, `tag?`, `limit` 1–50 (default 10) | Most voted, most played, or trending stations |
| `list_countries` | `min_stations?` (default 1), `limit?` | Country name, ISO code, station count and 72FM country page (`https://72fm.com/radio/<iso2>?source=mcp`) |
| `list_genres` | `limit` 1–100 (default 30) | Top genre tags by station count. Placeholder and non-genre tags are filtered out (e.g. `undefined`, `radio`, `fm`, and country, region or language names). |

### Station fields

```json
{
  "id": "963fa65f-0601-11e8-ae97-52543be04c81",
  "name": "Antena 1 São Paulo, SP (ZYD823 94,7 MHz FM) [aac]",
  "country": "Brazil",
  "countrycode": "BR",
  "language": "portuguese",
  "tags": ["adult contemporary", "jazz", "pop", "smooth jazz"],
  "codec": "AAC+",
  "bitrate": 96,
  "homepage": "http://antena1.com.br/",
  "stream_url": "http://antena1.newradio.it/stream?ext=.mp3",
  "favicon": null,
  "votes": 33238,
  "lastcheckok": true,
  "listen_url": "https://72fm.com/station/963fa65f-0601-11e8-ae97-52543be04c81?source=mcp"
}
```

- `stream_url` is the directory's resolved stream URL, or the original URL when no resolved one exists.
- `listen_url` plays the station in the browser on 72FM. The `?source=mcp` at the end only tells 72FM that the visit came from this server (apps send no referrer); it carries no id and nothing about you or your question.
- `tags` holds up to 8 tags.

### Prompt

`find_radio(request)` finds stations for a mood, place, activity or genre, for example "calm jazz for a rainy evening" or "radio from Lisbon".

## Untrusted data

Station names, tags, languages, countries and URLs come from a public directory that anyone can edit, and the server hands them to an AI assistant. The server therefore treats every field as untrusted input:

- Text is reduced to a single line: line breaks and control characters become spaces; zero-width characters, bidirectional controls, private-use code points, the invisible Unicode "tag" characters and every other invisible "default-ignorable" code point (variation selectors, fillers, joiners) are removed, except the emoji selector and the zero-width joiners that real text needs, which survive only in runs of at most two; names are cut at 120 characters, tags at 40, other fields at 60.
- URLs (`stream_url`, `homepage`, `favicon`) must be plain `http` or `https` written out in full, without credentials or backslashes, and are returned in their parsed canonical form; anything else (`javascript:`, `data:`, `file:`, `https:host`, a bare word) is dropped, and a station with no valid id or no playable stream is left out of the results.
- `bitrate` is converted when a station reports bits per second, and dropped when it is implausible; the directory's own bitrate sort is not offered because it ranks those entries first.
- Every result and the server instructions say that these fields are data, not instructions.
- Replies are capped at 5 MB, must be a JSON list, and a mirror that redirects or answers with something else counts as failed.

This reduces the risk of indirect prompt injection; it cannot remove it. A station can still be called "Ignore previous instructions", and that text will be shown, as one capped line, like any other name. Treat results as untrusted when you build on them.

## Reliability

The server queries the Radio Browser mirrors in this order, with an 8-second timeout for each:

1. `de1.api.radio-browser.info`
2. `de2.api.radio-browser.info`
3. `all.api.radio-browser.info`

If all three fail, the tool returns a clear error (`isError: true`) and the server keeps running. Requests identify themselves with `User-Agent: internet-radio-mcp/1.0 (+https://72fm.com)`.

You can change this behavior with two optional environment variables:

- `RADIO_BROWSER_MIRRORS`: comma-separated base URLs to use instead of the defaults. Only `https` URLs without credentials are accepted (plain `http` only for `localhost`, `127.0.0.1` or `[::1]`, for testing); anything else is ignored with a warning on stderr. Redirects are never followed.
- `RADIO_BROWSER_TIMEOUT_MS`: the timeout for each mirror, in milliseconds: a whole number from 100 to 60000 (default `8000`).

## Development

```sh
git clone https://github.com/AlonDrilich/internet-radio-mcp
cd internet-radio-mcp
npm install
npm run typecheck   # tsc checkJs over the JSDoc-typed sources
npm run smoke       # spawns the server over stdio and calls every tool against the live API
npx @modelcontextprotocol/inspector node src/index.js   # interactive testing
```

The source is plain ES modules with JSDoc types (`src/`), so there is no build step. That is why `npx github:…` works without an npm publish.

## Related

- [radio-playlists](https://github.com/AlonDrilich/radio-playlists): weekly M3U playlists by country and genre from the same directory ([browse online](https://alondrilich.github.io/radio-playlists/)).
- [radio-player-72fm](https://github.com/AlonDrilich/radio-player-72fm): WordPress plugin for putting a station's player on a site.
- All 72FM tools: [72fm.com/developers](https://72fm.com/developers).

## Data and credits

- The station directory data comes from [Radio Browser](https://www.radio-browser.info) and is in the public domain. Thanks to its maintainers and contributors. If you use this server heavily, please consider [supporting Radio Browser](https://www.radio-browser.info).
- Streams, names and logos belong to their respective broadcasters.
- [72FM](https://72fm.com) is a free web radio player built on the Radio Browser directory.

## License

[MIT](LICENSE) © Alon Drilich (72FM)
