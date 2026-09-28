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

const MAX_TAGS = 8;

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
   * @returns {Promise<any>}
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
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!res.ok) {
          attempts.push(`${hostOf(base)}: HTTP ${res.status}`);
          continue;
        }
        return await res.json();
      } catch (error) {
        attempts.push(`${hostOf(base)}: ${describeError(error, timeoutMs)}`);
      }
    }
    throw new RadioBrowserUnavailableError(attempts);
  }

  return {
    /**
     * @param {{ name?: string, tag?: string, countrycode?: string, language?: string,
     *           order: 'votes' | 'clickcount' | 'clicktrend' | 'bitrate', limit: number }} params
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
      return raw.map(normalizeStation);
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
 * @param {RawStation} s
 * @returns {Station}
 */
export function normalizeStation(s) {
  return {
    id: s.stationuuid,
    name: (s.name ?? '').trim(),
    country: emptyToNull(s.country),
    countrycode: emptyToNull(s.countrycode),
    language: emptyToNull(s.language),
    tags: splitTags(s.tags),
    codec: emptyToNull(s.codec),
    bitrate: typeof s.bitrate === 'number' && s.bitrate > 0 ? s.bitrate : null,
    homepage: emptyToNull(s.homepage),
    stream_url: emptyToNull(s.url_resolved) ?? emptyToNull(s.url),
    favicon: emptyToNull(s.favicon),
    votes: typeof s.votes === 'number' ? s.votes : 0,
    lastcheckok: s.lastcheckok === 1,
    listen_url: LISTEN_BASE_URL + s.stationuuid
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
  for (const part of tags.split(',')) {
    const tag = part.trim();
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
  return COUNTRY_PAGE_BASE_URL + iso2.toLowerCase();
}

/**
 * @param {string | undefined | null} value
 * @returns {string | null}
 */
function emptyToNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
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

function mirrorsFromEnv() {
  const raw = process.env.RADIO_BROWSER_MIRRORS;
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function timeoutFromEnv() {
  const n = Number(process.env.RADIO_BROWSER_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
