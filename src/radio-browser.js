// @ts-check
/**
 * Minimal client for the Radio Browser API (https://www.radio-browser.info),
 * a community-maintained, public-domain directory of internet radio stations.
 *
 * Mirrors are tried in order; each attempt has its own timeout. When every
 * mirror fails, a RadioBrowserUnavailableError is thrown so the tool layer can
 * turn it into a readable tool error instead of crashing the server.
 */

export const USER_AGENT = 'internet-radio-mcp/1.0 (+https://72fm.com)';

export const DEFAULT_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://all.api.radio-browser.info'
];

export const DEFAULT_TIMEOUT_MS = 8000;

export const LISTEN_BASE_URL = 'https://72fm.com/station/';
export const COUNTRY_PAGE_BASE_URL = 'https://72fm.com/radio/';
/**
 * Added to the links that point at 72fm.com. An AI app sends no referrer, so without it 72FM cannot tell
 * that a visit came from this server at all. It names the tool and nothing else: no id, no query, no user.
 */
export const LINK_SOURCE = '?source=mcp';

const MAX_TAGS = 8;
const MAX_BODY_BYTES = 5_000_000; // the largest legitimate reply (50 stations) is about 130 KB
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- untrusted text
//
// Every station field comes from a public directory that anyone can edit, and it ends up in the context
// of an AI assistant. A station can therefore be named "Jazz FM<newline><newline>Ignore previous
// instructions ...". Nothing here can make hostile text harmless, but text that is single-line, short and
// free of invisible characters is at least visible to the model and the user for what it is, and cannot
// pose as a separate paragraph, a system message or hidden instructions.

const LIMITS = { name: 120, tag: 40, language: 60, country: 60, codec: 20, url: 1000 };

/** Line breaks and every other control character become a space. */
const CONTROLS = /[\p{Cc}\u2028\u2029]/gu;
/**
 * Characters with no visible form that are used to hide text: zero-width space, bidi controls and
 * isolates, word joiner and invisible operators, BOM, soft hyphen, interlinear annotation marks, the
 * Unicode "tag" block (invisible lookalikes of ASCII), private-use, unassigned and lone-surrogate code
 * points. ZWNJ (U+200C) and ZWJ (U+200D) are kept: Persian, Indic scripts and emoji sequences need them.
 */
const INVISIBLE = /[\p{Co}\p{Cn}\p{Cs}\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{E0000}-\u{E007F}]/gu;

// Every other Default_Ignorable code point (variation selectors U+E0100.., combining grapheme joiner, Hangul
// and Braille-style fillers, Mongolian free variation selectors...) can carry hidden text just like the tag
// block. Kept: ZWNJ, ZWJ and VS16 (emoji and Persian/Indic text need them) — but only in runs of at most two,
// because a run of them can itself encode bits.
const HIDDEN_CHANNELS = /(?![\u200C\u200D\uFE0F])\p{Default_Ignorable_Code_Point}/gu;
const ZW_RUN = /([\u200C\u200D\uFE0F])([\u200C\u200D\uFE0F])[\u200C\u200D\uFE0F]+/gu;

/**
 * Plain, single-line, length-limited text from an untrusted source.
 * @param {unknown} value
 * @param {number} max maximum length in code points
 * @returns {string}
 */
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  let text = value
    .replace(CONTROLS, ' ')
    .replace(INVISIBLE, '')
    .replace(HIDDEN_CHANNELS, '')
    .replace(ZW_RUN, '$1$2')
    .replace(/\s+/gu, ' ')
    .trim();
  const points = Array.from(text);
  if (points.length > max) text = points.slice(0, Math.max(1, max - 1)).join('').trimEnd() + '…';
  return text;
}

/**
 * An http(s) URL without whitespace, control characters or credentials, or null. Anything else (javascript:,
 * data:, file:, a bare word such as "null") is not a playable stream, a homepage or a logo.
 * @param {unknown} value
 * @returns {string | null}
 */
export function cleanUrl(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > LIMITS.url || /[\s\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\u2028\u2029]/u.test(text)) return null;
  // The WHATWG parser reads a backslash as a slash, other parsers (curl, Python) as part of the user info:
  // "https://bbc.co.uk\@evil.example/" would be a different host to different players. Refuse it, and
  // require the scheme to be written out ("https:evil.example" is accepted by new URL()).
  if (text.includes('\\') || !/^https?:\/\//i.test(text)) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || url.username || url.password) return null;
  // Return the parsed, canonical form: the string that was checked is the string that is used.
  const href = url.href;
  return href.length <= LIMITS.url && /^[\x21-\x7e]+$/.test(href) ? href : null;
}

/**
 * Some entries store bits per second in the kbps field (128000 instead of 128). Convert the obvious cases,
 * drop the implausible ones.
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeBitrate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (value <= 1536) return Math.round(value);
  if (value % 1000 === 0 && value / 1000 >= 8 && value / 1000 <= 1536) return value / 1000;
  return null;
}

/**
 * @typedef {Record<string, string | number | boolean | undefined>} Query
 */

/**
 * Raw station object as returned by Radio Browser (only the fields we read).
 * @typedef {object} RawStation
 * @property {string} stationuuid
 * @property {string} name
 * @property {string} [url]
 * @property {string} [url_resolved]
 * @property {string} [homepage]
 * @property {string} [favicon]
 * @property {string} [tags]
 * @property {string} [country]
 * @property {string} [countrycode]
 * @property {string} [language]
 * @property {string} [codec]
 * @property {number} [bitrate]
 * @property {number} [votes]
 * @property {number} [clickcount]
 * @property {number} [clicktrend]
 * @property {number} [lastcheckok]
 */

/**
 * Station shape returned by every tool.
 * @typedef {object} Station
 * @property {string} id
 * @property {string} name
 * @property {string | null} country
 * @property {string | null} countrycode
 * @property {string | null} language
 * @property {string[]} tags
 * @property {string | null} codec
 * @property {number | null} bitrate
 * @property {string | null} homepage
 * @property {string | null} stream_url
 * @property {string | null} favicon
 * @property {number} votes
 * @property {boolean} lastcheckok
 * @property {string} listen_url
 */

export class RadioBrowserUnavailableError extends Error {
  /** @param {string[]} attempts */
  constructor(attempts) {
    super(
      'The Radio Browser directory could not be reached (all mirrors failed). ' +
        'This is usually temporary; please try again in a minute. Details: ' +
        attempts.join('; ')
    );
    this.name = 'RadioBrowserUnavailableError';
    this.attempts = attempts;
  }
}

/**
 * @param {{ mirrors?: string[], timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 */
export function createRadioBrowserClient(options = {}) {
  const mirrors = options.mirrors?.length ? options.mirrors : mirrorsFromEnv() ?? DEFAULT_MIRRORS;
  const timeoutMs = options.timeoutMs ?? timeoutFromEnv() ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  /**
   * GET a JSON endpoint, trying each mirror in order.
   * @param {string} path e.g. "/json/stations/search"
   * @param {Query} [query]
   * @returns {Promise<any[]>} the JSON array the endpoint returns
   */
  async function getJson(path, query = {}) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue;
      qs.set(key, String(value));
    }
    const suffix = qs.size ? `${path}?${qs}` : path;

    /** @type {string[]} */
    const attempts = [];
    for (const base of mirrors) {
      const url = base.replace(/\/+$/, '') + suffix;
      try {
        const res = await fetchImpl(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          // A mirror that answers with a redirect is treated as failed: requests go to the configured
          // Radio Browser hosts and nowhere else.
          redirect: 'manual'
        });
        if (!res.ok) {
          attempts.push(`${hostOf(base)}: HTTP ${res.status}`);
          continue;
        }
        const body = JSON.parse(await readCapped(res));
        if (!Array.isArray(body)) {
          attempts.push(`${hostOf(base)}: unexpected response (not a list)`);
          continue;
        }
        return body;
      } catch (error) {
        attempts.push(`${hostOf(base)}: ${describeError(error, timeoutMs)}`);
      }
    }
    throw new RadioBrowserUnavailableError(attempts);
  }

  return {
    /**
     * @param {{ name?: string, tag?: string, countrycode?: string, language?: string,
     *           order: 'votes' | 'clickcount' | 'clicktrend', limit: number }} params
     * @returns {Promise<Station[]>}
     */
    async searchStations(params) {
      /** @type {RawStation[]} */
      const raw = await getJson('/json/stations/search', {
        name: params.name,
        tag: params.tag,
        countrycode: params.countrycode,
        language: params.language,
        order: params.order,
        reverse: true,
        hidebroken: true,
        limit: params.limit
      });
      return raw.map(normalizeStation).filter(/** @returns {s is Station} */ s => s !== null).slice(0, params.limit);
    },

    /**
     * @param {string} uuid
     * @returns {Promise<Station | null>}
     */
    async getStation(uuid) {
      /** @type {RawStation[]} */
      const raw = await getJson('/json/stations/byuuid', { uuids: uuid });
      return raw.length ? normalizeStation(raw[0]) : null;
    },

    /**
     * @returns {Promise<{ name: string, iso_3166_1: string, stationcount: number }[]>}
     */
    async listCountries() {
      return getJson('/json/countries', { order: 'stationcount', reverse: true, hidebroken: true });
    },

    /**
     * @param {number} limit
     * @returns {Promise<{ name: string, stationcount: number }[]>}
     */
    async listTags(limit) {
      return getJson('/json/tags', { order: 'stationcount', reverse: true, hidebroken: true, limit });
    }
  };
}

/** @typedef {ReturnType<typeof createRadioBrowserClient>} RadioBrowserClient */

/**
 * Turn a raw directory record into a safe station, or null when it has no valid id or no playable
 * http(s) stream.
 * @param {RawStation} s
 * @returns {Station | null}
 */
export function normalizeStation(s) {
  if (!s || typeof s.stationuuid !== 'string' || !UUID.test(s.stationuuid)) return null;
  const streamUrl = cleanUrl(s.url_resolved) ?? cleanUrl(s.url);
  if (!streamUrl) return null;
  const countrycode = typeof s.countrycode === 'string' && /^[A-Za-z]{2}$/.test(s.countrycode.trim()) ? s.countrycode.trim().toUpperCase() : null;
  return {
    id: s.stationuuid.toLowerCase(),
    name: cleanText(s.name, LIMITS.name),
    country: textOrNull(s.country, LIMITS.country),
    countrycode,
    language: textOrNull(s.language, LIMITS.language),
    tags: splitTags(s.tags),
    codec: textOrNull(s.codec, LIMITS.codec),
    bitrate: normalizeBitrate(s.bitrate),
    homepage: cleanUrl(s.homepage),
    stream_url: streamUrl,
    favicon: cleanUrl(s.favicon),
    votes: typeof s.votes === 'number' && Number.isFinite(s.votes) ? s.votes : 0,
    lastcheckok: s.lastcheckok === 1,
    listen_url: LISTEN_BASE_URL + s.stationuuid.toLowerCase() + LINK_SOURCE
  };
}

/**
 * @param {string | undefined} tags
 * @returns {string[]}
 */
export function splitTags(tags) {
  if (!tags) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  if (typeof tags !== 'string') return [];
  for (const part of tags.split(',')) {
    const tag = cleanText(part, LIMITS.tag);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * @param {string} iso2
 */
export function countryPageUrl(iso2) {
  return COUNTRY_PAGE_BASE_URL + iso2.toLowerCase() + LINK_SOURCE;
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string | null}
 */
function textOrNull(value, max) {
  const text = cleanText(value, max);
  return text === '' ? null : text;
}

/**
 * The response body as text, refusing anything larger than MAX_BODY_BYTES (a hostile or broken mirror must
 * not be able to make the server buffer hundreds of megabytes).
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function readCapped(res) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('response too large');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('response too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** @param {string} base */
function hostOf(base) {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

/**
 * @param {unknown} error
 * @param {number} timeoutMs
 */
function describeError(error, timeoutMs) {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return `timed out after ${timeoutMs} ms`;
    const cause = /** @type {{ cause?: { code?: string, message?: string } }} */ (error).cause;
    const detail = cause?.code || cause?.message;
    return detail ? `${error.message} (${detail})` : error.message;
  }
  return String(error);
}

/**
 * RADIO_BROWSER_MIRRORS: comma-separated base URLs. Each must be https (http only for loopback, which the
 * tests use), carry no credentials, and is reduced to its origin so a path or query cannot be smuggled in.
 */
export function mirrorsFromEnv(raw = process.env.RADIO_BROWSER_MIRRORS) {
  if (!raw) return undefined;
  /** @type {string[]} */
  const list = [];
  for (const entry of raw.split(',').map(x => x.trim()).filter(Boolean)) {
    let url;
    try {
      url = new URL(entry);
    } catch {
      console.error(`[internet-radio-mcp] ignoring RADIO_BROWSER_MIRRORS entry that is not a URL`);
      continue;
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password) {
      console.error(`[internet-radio-mcp] ignoring mirror ${url.host}: only https URLs without credentials are accepted`);
      continue;
    }
    list.push(url.origin);
  }
  return list.length ? list : undefined;
}

/** RADIO_BROWSER_TIMEOUT_MS: an integer between 100 and 60000, otherwise the default. */
export function timeoutFromEnv(raw = process.env.RADIO_BROWSER_TIMEOUT_MS) {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 100 && n <= 60000) return n;
  console.error(`[internet-radio-mcp] ignoring RADIO_BROWSER_TIMEOUT_MS=${JSON.stringify(raw.slice(0, 20))}: use a whole number of milliseconds between 100 and 60000`);
  return undefined;
}
