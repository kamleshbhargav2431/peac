/**
 * Peachify API Client — Decrypted Stream Fetcher v4
 *
 * Fetches encrypted stream data from Peachify's provider APIs
 * and decrypts the AES-256-GCM encrypted responses.
 *
 * Features:
 *  - 5 providers: Iron, Spider, Wolf, Multi, Dark
 *  - WebShare rotating proxy support (via undici)
 *  - Auto-healing AES key via /api/check-key
 *  - VPS & Vercel deployable
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const AES_KEY_HEX = "a8f2a1b5e9c470814f6b2c3a5d8e7f9c1a2b3c4d5e3f7a8b8cad1e2d0a4d5c5b";

/** Live key — auto-updated at runtime when /api/check-key detects a change */
let liveAesKey = AES_KEY_HEX;

const PROVIDERS: Provider[] = [
  { label: "Iron",   path: "moviebox", apis: ["https://uwu.eat-peach.sbs"] },
  { label: "Spider", path: "holly",    apis: ["https://usa.eat-peach.sbs"] },
  { label: "Wolf",   path: "air",      apis: ["https://usa.eat-peach.sbs"] },
  { label: "Multi",  path: "multi",    apis: ["https://usa.eat-peach.sbs"] },
  { label: "Dark",   path: "net",      apis: ["https://uwu.eat-peach.sbs"] },
];

const SUBTITLE_SERVERS = [
  "https://uwu.eat-peach.sbs",
  "https://usa.eat-peach.sbs",
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface Provider {
  label: string;
  path: string;
  apis: string[];
}

interface RawSource {
  url?: string;
  src?: string;
  file?: string;
  stream?: string;
  streamUrl?: string;
  playbackUrl?: string;
  type?: string;
  format?: string;
  container?: string;
  dub?: string;
  audio?: string;
  audioName?: string;
  audioLang?: string;
  language?: string;
  lang?: string;
  label?: string;
  name?: string;
  title?: string;
  quality?: number | string;
  resolution?: number | string;
  height?: number | string;
  res?: number | string;
  sizeBytes?: number | string;
  size?: number | string;
  bytes?: number | string;
  headers?: Record<string, string>;
  header?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  httpHeaders?: Record<string, string>;
}

interface RawSubtitle {
  url?: string;
  file?: string;
  src?: string;
  media?: string;
  label?: string;
  name?: string;
  display?: string;
  language?: string;
  lang?: string;
  langCode?: string;
  format?: string;
  encoding?: string;
  isHearingImpaired?: boolean;
  source?: string;
  id?: string | number;
  flagUrl?: string;
}

export interface DecodedSource {
  url: string;
  type: "hls" | "mp4";
  dub: string;
  quality: number | null;
  sizeBytes: number | null;
  headers: Record<string, string> | undefined;
  provider: string;
}

export interface DecodedSubtitle {
  url: string;
  label: string;
  lang: string | undefined;
  display: string;
  provider: string;
}

export interface DecodedResponse {
  type: "movie" | "tv";
  tmdbId: number;
  provider: string;
  sources: DecodedSource[];
  subtitles: DecodedSubtitle[];
  tookMs: number;
}

interface EncryptedApiResponse {
  isEncrypted: boolean;
  data: string;
  providerName?: string;
  type?: string;
  tmdbId?: number;
  tookMs?: number;
}

interface DecryptedPayload {
  type?: string;
  tmdbId?: number;
  providerName?: string;
  tookMs?: number;
  sources: RawSource[];
  subtitles?: RawSubtitle[];
}

// ─── AES-256-GCM Decryption ─────────────────────────────────────────────────

function base64UrlToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = 4 - (b64.length % 4);
  if (pad !== 4) b64 += "=".repeat(pad);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hexToBytes(hex: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function decryptPayload(encryptedData: string, hexKey?: string): Promise<DecryptedPayload | null> {
  try {
    const keyToUse = hexKey || liveAesKey;
    const parts = encryptedData.split(".");
    if (parts.length !== 3) return null;

    const iv = base64UrlToBytes(parts[0]);
    const ciphertext = base64UrlToBytes(parts[1]);
    const authTag = base64UrlToBytes(parts[2]);

    const combined = new Uint8Array(ciphertext.length + authTag.length);
    combined.set(ciphertext, 0);
    combined.set(authTag, ciphertext.length);

    const keyBytes = await hexToBytes(keyToUse);

    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyBytes.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, cryptoKey, combined.buffer as ArrayBuffer
    );

    const text = new TextDecoder().decode(decrypted);
    return JSON.parse(text) as DecryptedPayload;
  } catch (e) {
    console.error("[decrypt] Failed:", e);
    return null;
  }
}

// ─── Source/Subtitle Parsing ─────────────────────────────────────────────────

function extractStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function extractNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string" && val.trim()) {
      const match = val.match(/\d{3,4}/);
      if (match) return Number(match[0]);
      const num = Number(val);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

function normalizeDub(raw: string): string {
  if (!raw || !raw.trim()) return "Original";
  const lower = raw.toLowerCase();
  if (lower === "dubbed") return "Dub";
  if (lower === "subbed") return "Sub";
  return raw.trim();
}

function parseRawSource(raw: RawSource, providerLabel: string): DecodedSource | null {
  const url = extractStr(raw as unknown as Record<string, unknown>, [
    "url", "src", "file", "stream", "streamUrl", "playbackUrl",
  ]);
  if (!url) return null;

  const formatStr = extractStr(raw as unknown as Record<string, unknown>, [
    "type", "format", "container",
  ]).toLowerCase();

  const isHls =
    formatStr.includes("hls") ||
    formatStr.includes("m3u8") ||
    url.toLowerCase().includes(".m3u8");

  const dubRaw = extractStr(raw as unknown as Record<string, unknown>, [
    "dub", "audio", "audioName", "audioLang", "language", "lang", "label", "name", "title",
  ]);

  const quality = extractNum(raw as unknown as Record<string, unknown>, [
    "quality", "resolution", "height", "res",
  ]);
  const sizeBytes = extractNum(raw as unknown as Record<string, unknown>, [
    "sizeBytes", "size", "bytes",
  ]);

  const headers =
    raw.headers ?? raw.header ?? raw.requestHeaders ?? raw.httpHeaders;

  return {
    url,
    type: isHls ? "hls" : "mp4",
    dub: normalizeDub(dubRaw),
    quality,
    sizeBytes,
    headers: headers && typeof headers === "object" ? headers : undefined,
    provider: providerLabel,
  };
}

function parseRawSubtitle(raw: RawSubtitle, providerLabel: string): DecodedSubtitle | null {
  const url = raw.url || raw.file || raw.src || raw.media;
  if (!url) return null;
  const label = raw.display || raw.label || raw.name || raw.language || "Unknown";
  return {
    url,
    label,
    lang: raw.langCode || raw.lang || raw.language,
    display: label,
    provider: providerLabel,
  };
}

// ─── Proxy Fetch ─────────────────────────────────────────────────────────────

interface ProxyConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

function getProxyConfig(): ProxyConfig | null {
  // Support both PROXY_URL and individual PROXY_HOST/PORT/USER/PASS
  const proxyUrl = process.env.PROXY_URL;
  if (proxyUrl) {
    try {
      const url = new URL(proxyUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port, 10) || 80,
        user: decodeURIComponent(url.username),
        pass: decodeURIComponent(url.password),
      };
    } catch {
      return null;
    }
  }

  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT;
  const user = process.env.PROXY_USER;
  const pass = process.env.PROXY_PASS;
  if (!host || !port) return null;
  return { host, port: parseInt(port, 10), user: user || "", pass: pass || "" };
}

async function proxiedFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxy = getProxyConfig();

  if (proxy) {
    try {
      const undici = await import("undici");
      const proxyUrl = proxy.user
        ? `http://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`
        : `http://${proxy.host}:${proxy.port}`;
      const dispatcher = new undici.ProxyAgent(proxyUrl);
      const res = await undici.fetch(url, { ...init, dispatcher } as any);
      // undici Response is compatible at runtime, just needs type assertion
      return res as unknown as Response;
    } catch (e) {
      console.warn("[proxy] Proxy fetch failed, falling back to direct:", e);
    }
  }

  // Fallback: direct fetch (no proxy)
  return fetch(url, init);
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://peachify.top/",
  Origin: "https://peachify.top",
};

// ─── Encrypted API Fetch ─────────────────────────────────────────────────────

async function fetchEncrypted(
  apiBase: string,
  providerPath: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<EncryptedApiResponse | null> {
  let url = `${apiBase}/${providerPath}/${mediaType}/${tmdbId}`;
  if (mediaType === "tv" && season && episode) {
    url += `/${season}/${episode}`;
  }

  try {
    const res = await proxiedFetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn(`[fetch] ${url} → ${res.status}`);
      return null;
    }

    return (await res.json()) as EncryptedApiResponse;
  } catch (e) {
    console.warn(`[fetch] ${url} failed:`, e);
    return null;
  }
}

// ─── Main API Function ───────────────────────────────────────────────────────

export async function fetchDecodedMedia(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season?: number,
  episode?: number,
  preferredProvider?: string
): Promise<DecodedResponse> {
  const startTime = Date.now();
  const allSources: DecodedSource[] = [];
  const allSubtitles: DecodedSubtitle[] = [];
  let primaryProvider = "";

  // Build provider order (preferred first)
  let providers = [...PROVIDERS];
  if (preferredProvider) {
    const idx = providers.findIndex(
      (p) => p.label.toLowerCase() === preferredProvider.toLowerCase()
        || p.path.toLowerCase() === preferredProvider.toLowerCase()
    );
    if (idx > 0) {
      const [pref] = providers.splice(idx, 1);
      providers.unshift(pref);
    }
  }

  // Try each provider
  for (const provider of providers) {
    const apis = provider.apis.length > 0 ? provider.apis : SUBTITLE_SERVERS;

    for (const apiBase of apis) {
      const encrypted = await fetchEncrypted(apiBase, provider.path, mediaType, tmdbId, season, episode);
      if (!encrypted) continue;

      let payload: DecryptedPayload | null = null;
      if (encrypted.isEncrypted && encrypted.data) {
        payload = await decryptPayload(encrypted.data);
      } else {
        payload = encrypted as unknown as DecryptedPayload;
      }
      if (!payload) continue;

      const providerLabel = payload.providerName ?? provider.label;

      const sources = (payload.sources ?? [])
        .map((s) => parseRawSource(s, providerLabel))
        .filter((s): s is DecodedSource => s !== null);

      const subtitles = (payload.subtitles ?? [])
        .map((s) => parseRawSubtitle(s, providerLabel))
        .filter((s): s is DecodedSubtitle => s !== null);

      allSources.push(...sources);
      allSubtitles.push(...subtitles);

      if (sources.length > 0 && !primaryProvider) {
        primaryProvider = providerLabel;
      }
    }
  }

  // Fetch external subtitles
  const extSubs = await fetchExternalSubtitles(mediaType, tmdbId, season, episode);
  allSubtitles.push(...extSubs);

  // Deduplicate
  const seenUrls = new Set<string>();
  const uniqueSources = allSources.filter((s) => {
    if (seenUrls.has(s.url)) return false;
    seenUrls.add(s.url);
    return true;
  });

  const seenSubUrls = new Set<string>();
  const uniqueSubs = allSubtitles.filter((s) => {
    if (seenSubUrls.has(s.url)) return false;
    seenSubUrls.add(s.url);
    return true;
  });

  return {
    type: mediaType,
    tmdbId,
    provider: primaryProvider || "none",
    sources: uniqueSources,
    subtitles: uniqueSubs,
    tookMs: Date.now() - startTime,
  };
}

async function fetchExternalSubtitles(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<DecodedSubtitle[]> {
  const subs: DecodedSubtitle[] = [];

  for (const server of SUBTITLE_SERVERS) {
    let url = `${server}/subs/${mediaType}/${tmdbId}`;
    if (mediaType === "tv" && season && episode) {
      url += `/${season}/${episode}`;
    }

    try {
      const res = await proxiedFetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;

      const data = (await res.json()) as RawSubtitle[];
      if (Array.isArray(data)) {
        for (const s of data) {
          const parsed = parseRawSubtitle(s, "opensubtitles");
          if (parsed) subs.push(parsed);
        }
      }
    } catch {
      // Silent fail
    }
  }

  return subs;
}

// ─── AES Key Health Check & Auto-Extract ────────────────────────────────────

export interface KeyCheckResult {
  status: "ok" | "changed" | "error";
  currentKey: string;
  newKey?: string;
  newKeySource?: string;
  decryptionTested: boolean;
  jsBundleUrl?: string;
  checkedAt: string;
  tookMs: number;
}

async function tryDecryptWithKey(encryptedData: string, hexKey: string): Promise<boolean> {
  try {
    const result = await decryptPayload(encryptedData, hexKey);
    return result !== null && Array.isArray(result.sources);
  } catch {
    return false;
  }
}

/**
 * Scrape Peachify's JS bundles for a 64-char hex AES key.
 * Looks for keys near decrypt() function calls for highest confidence.
 */
async function extractKeyFromSite(): Promise<{ key: string; source: string } | null> {
  try {
    // Fetch embed page to discover JS bundle URLs
    const pageRes = await proxiedFetch("https://peachify.top/embed/movie/1084242", {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!pageRes.ok) return null;

    const html = await pageRes.text();

    // Find all _next/static/chunks/*.js URLs
    const jsUrlRegex = /\/_next\/static\/chunks\/[^\s"')<>]+\.js/g;
    const jsUrls = html.match(jsUrlRegex);
    if (!jsUrls || jsUrls.length === 0) return null;

    const uniqueJsUrls = [...new Set(jsUrls)].map(
      (path) => `https://peachify.top${path}`
    );

    console.log(`[key-extract] Found ${uniqueJsUrls.length} JS bundles to scan`);

    const hexKeyRegex = /\b([0-9a-f]{64})\b/gi;

    for (const jsUrl of uniqueJsUrls) {
      try {
        const jsRes = await proxiedFetch(jsUrl, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(10_000),
        });
        if (!jsRes.ok) continue;

        const jsText = await jsRes.text();

        // Collect candidate 64-char hex strings
        const matches = jsText.matchAll(hexKeyRegex);
        const candidates: string[] = [];

        for (const match of matches) {
          const candidate = match[1];
          if (candidate !== "0".repeat(64) && candidate.length === 64) {
            candidates.push(candidate);
          }
        }

        if (candidates.length > 0) {
          // Prioritize keys found near decrypt() calls
          for (const candidate of candidates) {
            const nearbyPattern = new RegExp(
              `(?:decrypt|dD|decipher|decode)\\s*\\(.*?["']${candidate}["']`,
              "i"
            );
            if (nearbyPattern.test(jsText)) {
              return { key: candidate, source: jsUrl };
            }
          }
          // Fallback: first candidate
          return { key: candidates[0], source: jsUrl };
        }
      } catch {
        // Continue to next bundle
      }
    }

    return null;
  } catch (e) {
    console.error("[key-extract] Error:", e);
    return null;
  }
}

/**
 * Check if the current AES key is still valid.
 * If the key changed, auto-extract new key from Peachify's JS bundles
 * and update the live key at runtime.
 */
export async function checkAesKey(): Promise<KeyCheckResult> {
  const startTime = Date.now();

  // Step 1: Get a live encrypted response
  let encryptedData: string | null = null;

  for (const provider of PROVIDERS) {
    for (const apiBase of provider.apis) {
      try {
        const encrypted = await fetchEncrypted(apiBase, provider.path, "movie", 1084242);
        if (encrypted?.isEncrypted && encrypted.data) {
          encryptedData = encrypted.data;
          break;
        }
      } catch { /* next */ }
    }
    if (encryptedData) break;
  }

  if (!encryptedData) {
    return {
      status: "error",
      currentKey: liveAesKey,
      decryptionTested: false,
      checkedAt: new Date().toISOString(),
      tookMs: Date.now() - startTime,
    };
  }

  // Step 2: Test current key
  if (await tryDecryptWithKey(encryptedData, liveAesKey)) {
    return {
      status: "ok",
      currentKey: liveAesKey,
      decryptionTested: true,
      checkedAt: new Date().toISOString(),
      tookMs: Date.now() - startTime,
    };
  }

  // Step 3: Key failed — extract new key from site
  console.warn("[check-key] Current AES key FAILED! Extracting new key...");

  const extracted = await extractKeyFromSite();

  if (!extracted) {
    return {
      status: "changed",
      currentKey: liveAesKey,
      decryptionTested: true,
      checkedAt: new Date().toISOString(),
      tookMs: Date.now() - startTime,
    };
  }

  // Step 4: Verify new key
  if (await tryDecryptWithKey(encryptedData, extracted.key)) {
    const oldKey = liveAesKey;
    liveAesKey = extracted.key;
    console.log(`[check-key] Auto-updated: ${oldKey.slice(0, 16)}... → ${extracted.key.slice(0, 16)}...`);

    return {
      status: "changed",
      currentKey: oldKey,
      newKey: extracted.key,
      newKeySource: extracted.source,
      decryptionTested: true,
      jsBundleUrl: extracted.source,
      checkedAt: new Date().toISOString(),
      tookMs: Date.now() - startTime,
    };
  }

  return {
    status: "changed",
    currentKey: liveAesKey,
    newKey: extracted.key,
    newKeySource: `${extracted.source} (unverified — decryption still failed)`,
    decryptionTested: true,
    checkedAt: new Date().toISOString(),
    tookMs: Date.now() - startTime,
  };
}

/** Get the current live AES key */
export function getLiveAesKey(): string {
  return liveAesKey;
}

/** Get the list of providers (for docs/UI) */
export function getProviders(): Provider[] {
  return [...PROVIDERS];
}
