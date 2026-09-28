// @ts-check
/**
 * Live smoke test: spawns the server over stdio with the official MCP client,
 * lists tools/prompts, and calls every tool against the real Radio Browser API.
 *
 *   node scripts/smoke.mjs                       # runs ./src/index.js with this Node
 *   node scripts/smoke.mjs -- npx -y ./pkg.tgz   # runs any launch command instead
 *
 * Exits non-zero on the first failed check.
 */
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const sep = process.argv.indexOf('--');
const launch =
  sep >= 0
    ? { command: process.argv[sep + 1], args: process.argv.slice(sep + 2) }
    : { command: process.execPath, args: [fileURLToPath(new URL('../src/index.js', import.meta.url))] };

let failures = 0;
/** @param {boolean} cond @param {string} label */
function check(cond, label) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

function npmConfigEnv() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(process.env)) if (/^npm_config_/i.test(k) && v !== undefined) out[k] = v;
  return out;
}

/** @param {Record<string, string>} [extraEnv] */
async function connect(extraEnv = {}) {
  const client = new Client({ name: 'internet-radio-smoke', version: '1.0.0' });
  const transport = new StdioClientTransport({
    ...launch,
    // Forward npm_config_* so `-- npx ...` runs can use an isolated npm cache.
    env: { ...getDefaultEnvironment(), ...npmConfigEnv(), ...extraEnv },
    stderr: 'pipe'
  });
  await client.connect(transport);
  return client;
}

/**
 * @param {Client} client
 * @param {string} name
 * @param {Record<string, unknown>} args
 */
async function call(client, name, args) {
  const t0 = Date.now();
  const res = await client.callTool({ name, arguments: args });
  const ms = Date.now() - t0;
  const blocks = /** @type {{ type: string, text?: string }[]} */ (res.content ?? []);
  const summary = blocks.find(b => b.type === 'text')?.text ?? '';
  console.log(`\n> ${name} ${JSON.stringify(args)}  [${ms} ms]${res.isError ? '  (isError)' : ''}\n  ${summary}`);
  return { res, data: /** @type {any} */ (res.structuredContent), summary };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

console.log(`Launch: ${launch.command} ${launch.args.join(' ')}`);
const client = await connect();
try {
  const info = client.getServerVersion();
  console.log(`Connected to ${info?.name} ${info?.version}`);

  // tools/list ------------------------------------------------------------
  const { tools } = await client.listTools();
  console.log(`\nTools (${tools.length}):`);
  for (const t of tools) console.log(`  - ${t.name}: readOnly=${t.annotations?.readOnlyHint} openWorld=${t.annotations?.openWorldHint} outputSchema=${!!t.outputSchema}`);
  const expected = ['search_stations', 'get_station', 'top_stations', 'list_countries', 'list_genres'];
  check(expected.every(n => tools.some(t => t.name === n)), 'all 5 tools listed');
  check(tools.every(t => t.annotations?.readOnlyHint === true && t.annotations?.openWorldHint === true), 'every tool is readOnly + openWorld');
  check(tools.every(t => !!t.outputSchema), 'every tool advertises an outputSchema');

  // prompts ---------------------------------------------------------------
  const { prompts } = await client.listPrompts();
  check(prompts.some(p => p.name === 'find_radio'), 'find_radio prompt listed');
  const prompt = await client.getPrompt({ name: 'find_radio', arguments: { request: 'calm jazz for a rainy evening' } });
  check(prompt.messages.length === 1, 'find_radio returns a message');

  // search_stations: jazz in Brazil ---------------------------------------
  const jazz = await call(client, 'search_stations', { tag: 'jazz', countrycode: 'br', limit: 5 });
  check(!jazz.res.isError && jazz.data?.count > 0, 'search_stations(jazz, BR) returns stations');
  check(jazz.data?.stations.every((/** @type {any} */ s) => s.countrycode === 'BR'), 'all results are in BR');
  const first = jazz.data?.stations[0];
  check(!!first && UUID.test(first.id) && first.listen_url === `https://72fm.com/station/${first.id}`, 'listen_url = https://72fm.com/station/<uuid>');
  check(!!first && Array.isArray(first.tags) && first.tags.length <= 8 && typeof first.lastcheckok === 'boolean', 'station shape: tags[] <= 8, lastcheckok boolean');
  check(jazz.res.content.length === 2 && JSON.parse(/** @type {any} */ (jazz.res.content[1]).text).count === jazz.data.count, 'JSON also returned as text content');
  if (first) console.log(`  first: ${first.name} | ${first.codec} ${first.bitrate ?? '?'} kbps | ${first.stream_url}`);

  // get_station ------------------------------------------------------------
  const one = await call(client, 'get_station', { id: first?.id });
  check(!one.res.isError && one.data?.station.id === first?.id, 'get_station returns the same station');

  // BBC World Service stream URL ------------------------------------------
  const bbc = await call(client, 'search_stations', { name: 'BBC World Service', limit: 3 });
  check(bbc.data?.stations.some((/** @type {any} */ s) => /bbc/i.test(s.name) && s.stream_url), 'BBC World Service has a stream_url');
  for (const s of bbc.data?.stations ?? []) console.log(`  ${s.name} (${s.countrycode}) -> ${s.stream_url}`);

  // top_stations in Japan --------------------------------------------------
  const jp = await call(client, 'top_stations', { by: 'votes', countrycode: 'JP', limit: 5 });
  check(!jp.res.isError && jp.data?.count > 0 && jp.data.stations.every((/** @type {any} */ s) => s.countrycode === 'JP'), 'top_stations(votes, JP) returns JP stations');
  const votes = (jp.data?.stations ?? []).map((/** @type {any} */ s) => s.votes);
  check(votes.every((/** @type {number} */ v, /** @type {number} */ i) => i === 0 || votes[i - 1] >= v), 'sorted by votes, descending');
  const trending = await call(client, 'top_stations', { by: 'trending', limit: 5 });
  check(!trending.res.isError && trending.data?.count > 0, 'top_stations(trending) returns stations');
  const clicks = await call(client, 'top_stations', { by: 'clicks', tag: 'rock', limit: 3 });
  check(!clicks.res.isError && clicks.data?.count > 0, 'top_stations(clicks, rock) returns stations');

  // list_countries ----------------------------------------------------------
  const countries = await call(client, 'list_countries', { min_stations: 100 });
  const br = countries.data?.countries.find((/** @type {any} */ c) => c.code === 'BR');
  check(!countries.res.isError && countries.data?.count > 10, 'list_countries(min 100) returns many countries');
  check(br?.page_url === 'https://72fm.com/radio/br', 'BR page_url = https://72fm.com/radio/br');
  check(countries.data?.countries.every((/** @type {any} */ c) => c.station_count >= 100), 'min_stations respected');

  // list_genres -------------------------------------------------------------
  const genres = await call(client, 'list_genres', { limit: 25 });
  const names = (genres.data?.genres ?? []).map((/** @type {any} */ g) => g.name.toLowerCase());
  console.log(`  genres: ${names.join(', ')}`);
  check(names.length === 25, 'list_genres returns 25 genres');
  check(!names.some((/** @type {string} */ n) => ['music', 'radio', 'fm', 'méxico', 'undefined', 'null', 'español'].includes(n)), 'noise tags filtered out');
  check(['pop', 'rock', 'jazz'].every(g => names.includes(g)), 'pop, rock and jazz present');

  // error paths --------------------------------------------------------------
  const bad = await call(client, 'search_stations', { countrycode: 'Brazil' });
  check(bad.res.isError === true, 'invalid countrycode -> isError (validation)');
  const missing = await call(client, 'get_station', { id: '00000000-0000-0000-0000-000000000000' });
  check(missing.res.isError === true && /search_stations/.test(missing.summary), 'unknown id -> isError with a hint');
} finally {
  await client.close();
}

// all mirrors down ------------------------------------------------------------
console.log('\nAll-mirrors-down scenario (RADIO_BROWSER_MIRRORS points at closed local ports):');
const down = await connect({
  RADIO_BROWSER_MIRRORS: 'http://127.0.0.1:59998,http://127.0.0.1:59999',
  RADIO_BROWSER_TIMEOUT_MS: '1500'
});
try {
  const r = await call(down, 'search_stations', { tag: 'jazz' });
  check(r.res.isError === true && /could not be reached/.test(r.summary), 'all mirrors down -> clear tool error');
  const again = await down.listTools();
  check(again.tools.length === 5, 'server still alive after upstream failure');
} finally {
  await down.close();
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll smoke checks passed.');
process.exit(failures ? 1 : 0);
