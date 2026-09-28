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

Add the server to `~/.cursor/mcp.json` to use it everywhere, or to `.cursor/mcp.json` to use it in one project:

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

Add the server to `.vscode/mcp.json`, or run **MCP: Add Server** from the Command Palette:

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

### Other clients

Any MCP client that can launch a stdio server can use the same command: `npx -y github:AlonDrilich/internet-radio-mcp`.

The first launch downloads the package from GitHub, which takes a few seconds. Later launches use the npx cache.

## Tools

All tools are read-only and annotated with `readOnlyHint: true` and `openWorldHint: true`. Each result contains:

- a one-line summary,
- the same data as JSON text,
- `structuredContent` that matches the tool's `outputSchema`.

Broken streams (streams that failed the directory's last automated check) are excluded from searches.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `search_stations` | `name?`, `tag?` (genre), `countrycode?` (ISO 3166-1 alpha-2, e.g. `BR`), `language?` (e.g. `portuguese`), `order` = `votes` \| `clickcount` \| `bitrate` (default `votes`), `limit` 1–50 (default 10) | Matching stations |
| `get_station` | `id` (Radio Browser `stationuuid`) | One station |
| `top_stations` | `by` = `votes` \| `clicks` \| `trending` (default `votes`), `countrycode?`, `tag?`, `limit` 1–50 (default 10) | Most voted, most played, or trending stations |
| `list_countries` | `min_stations?` (default 1), `limit?` | Country name, ISO code, station count and 72FM country page (`https://72fm.com/radio/<iso2>`) |
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
  "listen_url": "https://72fm.com/station/963fa65f-0601-11e8-ae97-52543be04c81"
}
```

- `stream_url` is the directory's resolved stream URL, or the original URL when no resolved one exists.
- `listen_url` plays the station in the browser on 72FM.
- `tags` holds up to 8 tags.

### Prompt

`find_radio(request)` finds stations for a mood, place, activity or genre, for example "calm jazz for a rainy evening" or "radio from Lisbon".

## Reliability

The server queries the Radio Browser mirrors in this order, with an 8-second timeout for each:

1. `de1.api.radio-browser.info`
2. `de2.api.radio-browser.info`
3. `all.api.radio-browser.info`

If all three fail, the tool returns a clear error (`isError: true`) and the server keeps running. Requests identify themselves with `User-Agent: internet-radio-mcp/1.0 (+https://72fm.com)`.

You can change this behavior with two optional environment variables:

- `RADIO_BROWSER_MIRRORS`: comma-separated base URLs to use instead of the defaults.
- `RADIO_BROWSER_TIMEOUT_MS`: the timeout for each mirror, in milliseconds (default `8000`).

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
