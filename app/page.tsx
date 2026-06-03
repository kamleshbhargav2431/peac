"use client";

import { useState } from "react";

interface Source {
  url: string;
  type: "hls" | "mp4";
  dub: string;
  quality: number | null;
  sizeBytes: number | null;
  headers?: Record<string, string>;
  provider: string;
}

interface Subtitle {
  url: string;
  label: string;
  lang?: string;
  display: string;
  provider: string;
}

interface ApiResponse {
  type: "movie" | "tv";
  tmdbId: number;
  provider: string;
  sources: Source[];
  subtitles: Subtitle[];
  tookMs: number;
}

interface KeyCheckResponse {
  status: "ok" | "changed" | "error";
  currentKey: string;
  newKey?: string;
  newKeySource?: string;
  decryptionTested: boolean;
  jsBundleUrl?: string;
  checkedAt: string;
  tookMs: number;
}

const PROVIDERS = [
  { key: "iron", label: "Iron (MovieBox)" },
  { key: "spider", label: "Spider (Holly)" },
  { key: "wolf", label: "Wolf (Air)" },
  { key: "multi", label: "Multi" },
  { key: "dark", label: "Dark (Net)" },
];

export default function Home() {
  const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");
  const [tmdbId, setTmdbId] = useState("1084242");
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [server, setServer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyCheck, setKeyCheck] = useState<KeyCheckResponse | null>(null);
  const [keyCheckLoading, setKeyCheckLoading] = useState(false);

  const handleKeyCheck = async () => {
    setKeyCheckLoading(true);
    try {
      const res = await fetch("/api/check-key");
      const data = await res.json();
      setKeyCheck(data);
    } catch {
      setKeyCheck({ status: "error", currentKey: "?", decryptionTested: false, checkedAt: new Date().toISOString(), tookMs: 0 });
    } finally {
      setKeyCheckLoading(false);
    }
  };

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let url = `/api/${mediaType}/${tmdbId}`;
      if (mediaType === "tv") url += `/${season}/${episode}`;
      if (server) url += `?server=${encodeURIComponent(server)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#eee" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #333", background: "#111", padding: "20px 0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #f97316, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 18 }}>P</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Peachify Decode API</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Decrypted stream source fetcher with auto-healing AES key</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {/* Endpoints */}
        <section style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>API Endpoints</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <div><span style={{ background: "#16301a", color: "#4ade80", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontFamily: "monospace", marginRight: 8 }}>GET</span><code>/api/movie/{"{tmdbId}"}?server=iron</code></div>
            <div><span style={{ background: "#16301a", color: "#4ade80", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontFamily: "monospace", marginRight: 8 }}>GET</span><code>/api/tv/{"{tmdbId}"}/{"{season}"}/{"{episode}"}?server=wolf</code></div>
            <div><span style={{ background: "#302a16", color: "#facc15", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontFamily: "monospace", marginRight: 8 }}>GET</span><code>/api/check-key</code><span style={{ color: "#666", marginLeft: 8, fontSize: 12 }}>— verify AES key, auto-extract if changed</span></div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#666", lineHeight: 1.8 }}>
            <p style={{ margin: 0 }}><strong style={{ color: "#999" }}>server</strong> (optional): iron, spider, wolf, multi, dark</p>
            <p style={{ margin: 0 }}>Responses are <strong style={{ color: "#999" }}>already decrypted</strong> — AES-256-GCM happens server-side.</p>
            <p style={{ margin: 0 }}>Requires <code style={{ color: "#999" }}>PROXY_HOST/PORT/USER/PASS</code> env vars for WebShare rotating proxy.</p>
          </div>
        </section>

        {/* Test Form */}
        <section style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Test API</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4 }}>Media Type</label>
              <select value={mediaType} onChange={(e) => setMediaType(e.target.value as "movie" | "tv")} style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14 }}>
                <option value="movie">Movie</option>
                <option value="tv">TV Show</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4 }}>TMDB ID</label>
              <input type="text" value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} placeholder="e.g. 1084242" style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14 }} />
            </div>
            {mediaType === "tv" && (
              <>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4 }}>Season</label>
                  <input type="text" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="1" style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4 }}>Episode</label>
                  <input type="text" value={episode} onChange={(e) => setEpisode(e.target.value)} placeholder="1" style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14 }} />
                </div>
              </>
            )}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4 }}>Server (optional)</label>
              <select value={server} onChange={(e) => setServer(e.target.value)} style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14 }}>
                <option value="">Auto (all)</option>
                {PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleFetch} disabled={loading || !tmdbId} style={{ background: "linear-gradient(to right, #f97316, #ec4899)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading || !tmdbId ? 0.5 : 1 }}>
            {loading ? "Fetching..." : "Fetch Decoded Sources"}
          </button>
        </section>

        {/* Key Check */}
        <section style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>AES Key Health Check</h2>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#666" }}>
            Verifies the AES-256-GCM key is still valid. If changed, auto-extracts the new key from Peachify&apos;s JS bundle and updates the server at runtime.
          </p>
          <button onClick={handleKeyCheck} disabled={keyCheckLoading} style={{ background: "linear-gradient(to right, #ca8a04, #ea580c)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: keyCheckLoading ? "wait" : "pointer", opacity: keyCheckLoading ? 0.5 : 1 }}>
            {keyCheckLoading ? "Checking..." : "Check AES Key"}
          </button>

          {keyCheck && (
            <div style={{ marginTop: 16, padding: 16, borderRadius: 8, border: `1px solid ${keyCheck.status === "ok" ? "#166534" : keyCheck.newKey ? "#854d0e" : "#991b1b"}`, background: keyCheck.status === "ok" ? "rgba(22,101,52,0.15)" : keyCheck.newKey ? "rgba(133,77,14,0.15)" : "rgba(153,27,27,0.15)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18, color: keyCheck.status === "ok" ? "#4ade80" : "#facc15" }}>{keyCheck.status === "ok" ? "✓" : "⚠"}</span>
                <span style={{ fontWeight: 600, fontSize: 14, color: keyCheck.status === "ok" ? "#86efac" : "#fde047" }}>
                  {keyCheck.status === "ok" ? "AES Key is valid — decryption working" : keyCheck.newKey ? "Key changed — auto-extracted new key" : "Key changed — could not extract new key"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><span style={{ color: "#666" }}>Current Key:</span> <code style={{ color: "#ccc" }}>{keyCheck.currentKey.slice(0, 24)}...</code></div>
                {keyCheck.newKey && <div><span style={{ color: "#666" }}>New Key:</span> <code style={{ color: "#fde047" }}>{keyCheck.newKey.slice(0, 24)}...</code></div>}
                <div><span style={{ color: "#666" }}>Decryption Tested:</span> <span style={{ color: keyCheck.decryptionTested ? "#4ade80" : "#f87171" }}>{keyCheck.decryptionTested ? "Yes" : "No"}</span></div>
                <div><span style={{ color: "#666" }}>Time:</span> <span style={{ color: "#ccc" }}>{keyCheck.tookMs}ms</span></div>
                {keyCheck.newKeySource && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#666" }}>Source:</span> <code style={{ color: "#888", wordBreak: "break-all" }}>{keyCheck.newKeySource}</code></div>}
              </div>
            </div>
          )}
        </section>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(153,27,27,0.2)", border: "1px solid #991b1b", borderRadius: 8, padding: 16, marginBottom: 24, color: "#fca5a5", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <section style={{ marginBottom: 24 }}>
            {/* Summary */}
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>Results</h2>
                <span style={{ fontSize: 12, color: "#666" }}>{result.tookMs}ms · {result.provider}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{result.sources.length}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>Sources</div>
                </div>
                <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{result.subtitles.length}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>Subtitles</div>
                </div>
                <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, textTransform: "uppercase" }}>{result.type}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>Type</div>
                </div>
                <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{result.tmdbId}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>TMDB ID</div>
                </div>
              </div>
            </div>

            {/* Sources Table */}
            {result.sources.length > 0 && (
              <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24, marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Stream Sources</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #222", color: "#888", textAlign: "left" }}>
                        <th style={{ padding: "8px 8px" }}>#</th>
                        <th style={{ padding: "8px 8px" }}>Type</th>
                        <th style={{ padding: "8px 8px" }}>Quality</th>
                        <th style={{ padding: "8px 8px" }}>Dub</th>
                        <th style={{ padding: "8px 8px" }}>Size</th>
                        <th style={{ padding: "8px 8px" }}>Provider</th>
                        <th style={{ padding: "8px 8px" }}>URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.sources.map((s, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}>
                          <td style={{ padding: "6px 8px", color: "#666" }}>{i + 1}</td>
                          <td style={{ padding: "6px 8px" }}><span style={{ background: s.type === "hls" ? "#1e3a5f" : "#3b1f5e", color: s.type === "hls" ? "#93c5fd" : "#c4b5fd", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{s.type.toUpperCase()}</span></td>
                          <td style={{ padding: "6px 8px" }}>{s.quality ? `${s.quality}p` : "—"}</td>
                          <td style={{ padding: "6px 8px" }}>{s.dub}</td>
                          <td style={{ padding: "6px 8px" }}>{formatBytes(s.sizeBytes)}</td>
                          <td style={{ padding: "6px 8px", fontSize: 12 }}>{s.provider}</td>
                          <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "#666" }}>{s.url}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Subtitles */}
            {result.subtitles.length > 0 && (
              <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24, marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Subtitles ({result.subtitles.length})</h3>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {result.subtitles.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #1a1a1a", fontSize: 13 }}>
                      <span style={{ color: "#ccc" }}>{s.display}</span>
                      <span style={{ color: "#444" }}>·</span>
                      <span style={{ fontSize: 12, color: "#888" }}>{s.lang || "?"}</span>
                      <span style={{ color: "#444" }}>·</span>
                      <span style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 350 }}>{s.url}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <details style={{ background: "#111", border: "1px solid #222", borderRadius: 12 }}>
              <summary style={{ padding: 16, cursor: "pointer", fontSize: 14, color: "#888" }}>Raw JSON Response</summary>
              <pre style={{ padding: "0 16px 16px", fontSize: 12, color: "#888", overflowX: "auto", margin: 0 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </section>
        )}

        {/* Deploy */}
        <section style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Deploy</h2>
          <div style={{ fontSize: 14, color: "#888", lineHeight: 1.8 }}>
            <p style={{ margin: "0 0 8px" }}><strong style={{ color: "#ccc" }}>VPS:</strong> Set env vars and run <code style={{ background: "#1a1a1a", padding: "2px 6px", borderRadius: 4, color: "#f97316", fontSize: 13 }}>npm install && npm run build && npm start</code></p>
            <p style={{ margin: "0 0 8px" }}><strong style={{ color: "#ccc" }}>Vercel:</strong> Import repo → set env vars → deploy. Proxy works via <code style={{ background: "#1a1a1a", padding: "2px 6px", borderRadius: 4, color: "#f97316", fontSize: 13 }}>undici</code> ProxyAgent.</p>
            <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 12, fontSize: 13, fontFamily: "monospace", lineHeight: 1.6 }}>
              <div style={{ color: "#ccc" }}>PROXY_HOST=p.webshare.io</div>
              <div style={{ color: "#ccc" }}>PROXY_PORT=80</div>
              <div style={{ color: "#ccc" }}>PROXY_USER=qijlkvsz-rotate</div>
              <div style={{ color: "#ccc" }}>PROXY_PASS=viryx2zv5njj</div>
            </div>
          </div>
        </section>

        {/* Available Servers */}
        <section style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Available Servers</h2>
          <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #222", textAlign: "left", color: "#888" }}>
                <th style={{ padding: "8px" }}>Key</th>
                <th style={{ padding: "8px" }}>Label</th>
                <th style={{ padding: "8px" }}>Path</th>
                <th style={{ padding: "8px" }}>Domain</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["iron", "Iron", "moviebox", "uwu.eat-peach.sbs"],
                ["spider", "Spider", "holly", "usa.eat-peach.sbs"],
                ["wolf", "Wolf", "air", "usa.eat-peach.sbs"],
                ["multi", "Multi", "multi", "usa.eat-peach.sbs"],
                ["dark", "Dark", "net", "uwu.eat-peach.sbs"],
              ].map(([key, label, path, domain]) => (
                <tr key={key} style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <td style={{ padding: "8px" }}><code style={{ color: "#f97316" }}>{key}</code></td>
                  <td style={{ padding: "8px" }}>{label}</td>
                  <td style={{ padding: "8px" }}><code style={{ color: "#888" }}>{path}</code></td>
                  <td style={{ padding: "8px" }}><code style={{ color: "#888" }}>{domain}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid #222", padding: "16px 0", textAlign: "center", fontSize: 12, color: "#444" }}>
        Peachify Decode API v4 — For educational purposes only
      </footer>
    </div>
  );
}
