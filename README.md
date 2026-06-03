# 🍑 Peachify Decode API

> Reverse-engineered, self-hosted API that fetches and decrypts streaming sources from [Peachify](https://peachify.top/) — complete with auto-healing AES key extraction.

---

## 📋 Table of Contents

- [What It Does](#-what-it-does)
- [How It Works](#-how-it-works)
- [API Endpoints](#-api-endpoints)
- [Response Schema](#-response-schema)
- [Quick Start](#-quick-start)
- [Deployment](#-deployment)
  - [VPS (Node.js)](#vps-nodejs)
  - [Vercel](#vercel)
  - [Coolify / Nixpacks](#coolify--nixpacks)
  - [Docker](#docker)
- [Configuration](#-configuration)
- [Providers](#-providers)
- [AES Key Auto-Healing](#-aes-key-auto-healing)
- [Project Structure](#-project-structure)
- [Troubleshooting](#-troubleshooting)
- [Legal Disclaimer](#-legal-disclaimer)

---

## 🎯 What It Does

Peachify encrypts their API responses with **AES-256-GCM** before sending them to the client. This project intercepts those encrypted responses, decrypts them server-side using the extracted encryption key, and returns the **decrypted JSON** — including direct stream URLs (HLS/MP4) and subtitle links.

**Key features:**

- 🔓 **AES-256-GCM decryption** — Fully implemented using the Web Crypto API
- 🔄 **5 streaming providers** — Iron, Spider, Wolf, Multi, Dark
- 🌐 **Rotating proxy support** — Bypasses Cloudflare via WebShare with `undici` ProxyAgent
- 🏥 **Auto-healing AES key** — Detects key changes and extracts the new key from Peachify's JS bundles automatically
- 📺 **Movies & TV Shows** — Supports both via TMDB ID
- 📝 **Subtitles** — Fetches and deduplicates subtitles from multiple servers
- 🎨 **Built-in test UI** — Landing page with interactive API tester and key health check

---

## ⚙️ How It Works

```
┌─────────┐       ┌──────────────────┐       ┌─────────────────┐
│  Client  │──────▶│  This API Server │──────▶│  Peachify APIs   │
│ (You)    │◀──────│  (Next.js)       │◀──────│  (encrypted)     │
└─────────┘       │                  │       └─────────────────┘
                  │  1. Fetch via    │
                  │     proxy        │
                  │  2. Decrypt      │
                  │     AES-256-GCM  │
                  │  3. Return JSON  │
                  └──────────────────┘
```

1. **Fetch** encrypted data from Peachify's provider APIs via rotating proxy (to bypass Cloudflare)
2. **Decrypt** the response using AES-256-GCM with the extracted key
3. **Parse** and normalize the stream sources and subtitles
4. **Return** clean, deduplicated JSON to the client

The encrypted payload format is: `base64url(iv).base64url(ciphertext).base64url(authTag)`

---

## 🛣 API Endpoints

### Get Movie Sources

```
GET /api/movie/{tmdbId}?server={provider}
```

| Parameter | Type   | Required | Description                                     |
|-----------|--------|----------|-------------------------------------------------|
| tmdbId    | number | ✅       | TMDB movie ID (e.g., `1084242`)                 |
| server    | string | ❌       | Preferred provider: `iron`, `spider`, `wolf`, `multi`, `dark` |

**Example:**
```bash
curl http://localhost:3000/api/movie/1084242?server=iron
```

---

### Get TV Show Sources

```
GET /api/tv/{tmdbId}/{season}/{episode}?server={provider}
```

| Parameter | Type   | Required | Description                                     |
|-----------|--------|----------|-------------------------------------------------|
| tmdbId    | number | ✅       | TMDB TV show ID                                 |
| season    | number | ✅       | Season number                                   |
| episode   | number | ✅       | Episode number                                  |
| server    | string | ❌       | Preferred provider: `iron`, `spider`, `wolf`, `multi`, `dark` |

**Example:**
```bash
curl http://localhost:3000/api/tv/1399/1/1?server=wolf
```

---

### Check AES Key Health

```
GET /api/check-key
```

Validates whether the current AES key can still decrypt live responses. If the key has changed, it automatically scrapes Peachify's JS bundles, extracts the new key, and updates it at runtime.

**Example:**
```bash
curl http://localhost:3000/api/check-key
```

**Response (key valid):**
```json
{
  "status": "ok",
  "currentKey": "a8f2a1b5e9c47081...",
  "decryptionTested": true,
  "checkedAt": "2025-01-15T12:00:00.000Z",
  "tookMs": 2340
}
```

**Response (key changed, auto-healed):**
```json
{
  "status": "changed",
  "currentKey": "a8f2a1b5e9c47081...",
  "newKey": "b9e3c2d6f0a58192...",
  "newKeySource": "https://peachify.top/_next/static/chunks/app-abc123.js",
  "decryptionTested": true,
  "checkedAt": "2025-01-15T12:00:00.000Z",
  "tookMs": 5670
}
```

---

## 📦 Response Schema

All movie/TV endpoints return this structure:

```typescript
interface DecodedResponse {
  type: "movie" | "tv";
  tmdbId: number;
  provider: string;          // Primary provider name
  sources: DecodedSource[];  // Deduplicated stream URLs
  subtitles: DecodedSubtitle[]; // Deduplicated subtitle URLs
  tookMs: number;            // Total fetch + decrypt time
}

interface DecodedSource {
  url: string;               // Direct stream URL (HLS m3u8 or MP4)
  type: "hls" | "mp4";      // Stream format
  dub: string;               // Audio type: "Original", "Dub", "Sub", etc.
  quality: number | null;    // Resolution (e.g., 1080, 720, 480)
  sizeBytes: number | null;  // File size in bytes (if available)
  headers: Record<string, string> | undefined; // Required request headers
  provider: string;          // Which provider returned this source
}

interface DecodedSubtitle {
  url: string;               // Subtitle file URL (VTT/SRT)
  label: string;             // Display name (e.g., "English")
  lang: string | undefined;  // Language code (e.g., "en")
  display: string;           // Same as label
  provider: string;          // "opensubtitles" or provider name
}
```

**Sample movie response (~28 sources, ~204 subtitles):**
```json
{
  "type": "movie",
  "tmdbId": 1084242,
  "provider": "Iron",
  "sources": [
    {
      "url": "https://example.com/stream/movie.m3u8",
      "type": "hls",
      "dub": "Original",
      "quality": 1080,
      "sizeBytes": null,
      "headers": { "Referer": "https://example.com" },
      "provider": "Iron"
    }
  ],
  "subtitles": [
    {
      "url": "https://example.com/subs/en.vtt",
      "label": "English",
      "lang": "en",
      "display": "English",
      "provider": "opensubtitles"
    }
  ],
  "tookMs": 3200
}
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ or **Bun**
- **WebShare proxy account** (or any HTTP proxy that can bypass Cloudflare)

### 1. Clone & Install

```bash
git clone <your-repo-url> peachify-api
cd peachify-api
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your proxy credentials:

```env
PROXY_HOST=p.webshare.io
PROXY_PORT=80
PROXY_USER=your-username-rotate
PROXY_PASS=your-password
```

> **Important:** The `-rotate` suffix in the username enables per-request IP rotation on WebShare, which is essential for bypassing Cloudflare's rate limiting.

### 3. Run in Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the interactive test UI.

### 4. Test the API

```bash
# Movie
curl http://localhost:3000/api/movie/1084242

# TV Show
curl http://localhost:3000/api/tv/1399/1/1

# Check AES key health
curl http://localhost:3000/api/check-key
```

---

## 🚢 Deployment

### VPS (Node.js)

```bash
# Install dependencies
npm install

# Build for production (creates standalone output)
npm run build

# Start the server
npm start
```

The server runs on **port 3000** by default. Set the `PORT` environment variable to change it:

```bash
PORT=8080 npm start
```

**With PM2 (recommended for production):**

```bash
npm install -g pm2
pm2 start .next/standalone/server.js --name peachify-api
pm2 save
pm2 startup
```

---

### Vercel

1. Push this repo to GitHub
2. Import the repo in [Vercel Dashboard](https://vercel.com/new)
3. Add environment variables:
   - `PROXY_HOST`
   - `PROXY_PORT`
   - `PROXY_USER`
   - `PROXY_PASS`
4. Deploy

> **Note:** Vercel's serverless functions have a 10-second timeout on the Hobby plan. The `/api/check-key` endpoint may exceed this since it scans multiple JS bundles. Consider upgrading to Pro for 60-second timeouts, or set up a separate cron job on a VPS to periodically call `/api/check-key`.

---

### Coolify / Nixpacks

This project is fully compatible with **Coolify** deployments using **Nixpacks** as the build pack.

1. Push this repo to GitHub
2. In Coolify, create a new service → Choose your repo → Select **Nixpacks** as build pack
3. Add environment variables in Coolify's environment tab:
   ```
   PROXY_HOST=p.webshare.io
   PROXY_PORT=80
   PROXY_USER=your-username-rotate
   PROXY_PASS=your-password
   ```
4. Deploy

> **Build note:** This project uses relative imports (not `@/` path aliases) to ensure full compatibility with Nixpacks. The `next.config.mjs` includes `ignoreBuildErrors` for TypeScript and ESLint to prevent build failures in Docker environments.

---

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

```bash
docker build -t peachify-api .
docker run -d \
  -p 3000:3000 \
  -e PROXY_HOST=p.webshare.io \
  -e PROXY_PORT=80 \
  -e PROXY_USER=your-user-rotate \
  -e PROXY_PASS=your-pass \
  peachify-api
```

---

## ⚙️ Configuration

### Environment Variables

| Variable      | Required | Default | Description                                        |
|---------------|----------|---------|----------------------------------------------------|
| `PROXY_HOST`  | ❌*      | —       | HTTP proxy hostname (e.g., `p.webshare.io`)        |
| `PROXY_PORT`  | ❌*      | —       | HTTP proxy port (e.g., `80`)                       |
| `PROXY_USER`  | ❌       | —       | Proxy username (use `-rotate` suffix for rotation)  |
| `PROXY_PASS`  | ❌       | —       | Proxy password                                      |
| `PROXY_URL`   | ❌       | —       | Full proxy URL: `http://user:pass@host:port` (alternative to individual vars) |
| `PORT`        | ❌       | `3000`  | Server port (standalone mode only)                  |

*\*While proxy variables are technically optional, **the API will not work without a proxy** because Peachify's servers are behind Cloudflare protection. Without a proxy, all requests will return 403 Forbidden.*

### AES Key (Hardcoded)

The current AES-256-GCM key is hardcoded in `lib/peachify.ts`:

```typescript
const AES_KEY_HEX = "a8f2a1b5e9c470814f6b2c3a5d8e7f9c1a2b3c4d5e3f7a8b8cad1e2d0a4d5c5b";
```

If Peachify rotates their key, the `/api/check-key` endpoint will automatically detect the change, extract the new key from their JS bundles, and update the runtime key — **no redeployment needed**.

If you need to manually update the key, edit the `AES_KEY_HEX` constant in `lib/peachify.ts` and rebuild.

---

## 🎬 Providers

Peachify uses multiple provider backends. This API queries all of them and aggregates the results:

| Provider | Path        | API Server              | Description                     |
|----------|-------------|-------------------------|---------------------------------|
| Iron     | `moviebox`  | `uwu.eat-peach.sbs`    | MovieBox — largest source pool  |
| Spider   | `holly`     | `usa.eat-peach.sbs`    | Hollywood content               |
| Wolf     | `air`       | `usa.eat-peach.sbs`    | Air/wolf provider               |
| Multi    | `multi`     | `usa.eat-peach.sbs`    | Multi-source aggregator         |
| Dark     | `net`       | `uwu.eat-peach.sbs`    | Net/dark provider               |

When you pass `?server=iron`, the Iron provider is tried first. All providers are always queried — the `server` parameter just changes the priority order for faster results.

---

## 🏥 AES Key Auto-Healing

Peachify periodically rotates their AES-256-GCM encryption key. When this happens, all API responses fail to decrypt. This project includes an **auto-healing mechanism**:

### How It Works

1. **`GET /api/check-key`** fetches a live encrypted response from a known-working provider
2. Tries to decrypt it with the current key
3. If decryption fails:
   - Fetches Peachify's embed page HTML
   - Extracts all `/_next/static/chunks/*.js` bundle URLs
   - Scans each JS bundle for 64-character hex strings (the key format)
   - Prioritizes keys found near `decrypt()` function calls
   - Verifies the extracted key by decrypting the live response
4. If the new key works, it updates the **runtime key** in memory — no restart needed

### Setting Up Periodic Checks

**Cron (VPS):**
```bash
# Check key every 30 minutes
*/30 * * * * curl -s http://localhost:3000/api/check-key > /dev/null 2>&1
```

**Uptime Robot / Health Check Service:**
Set up a health check that pings `/api/check-key` every 30 minutes. This ensures the key is always up-to-date.

**Vercel Cron (vercel.json):**
```json
{
  "crons": [{
    "path": "/api/check-key",
    "schedule": "*/30 * * * *"
  }]
}
```

---

## 📁 Project Structure

```
peachify-api/
├── .env.example                              # Proxy configuration template
├── .gitignore
├── README.md                                 # This file
├── next.config.mjs                           # Next.js config (standalone output)
├── next-env.d.ts                             # Next.js TypeScript env
├── package.json                              # Dependencies
├── tsconfig.json                             # TypeScript config
├── lib/
│   └── peachify.ts                           # 🔑 Core logic: decryption, proxy, providers, key healing
└── app/
    ├── layout.tsx                            # Root layout
    ├── page.tsx                              # Landing page with test UI
    └── api/
        ├── movie/
        │   └── [tmdbId]/
        │       └── route.ts                  # GET /api/movie/{tmdbId}
        ├── tv/
        │   └── [tmdbId]/
        │       └── [season]/
        │           └── [episode]/
        │               └── route.ts          # GET /api/tv/{tmdbId}/{season}/{episode}
        └── check-key/
            └── route.ts                      # GET /api/check-key
```

---

## 🔧 Troubleshooting

### Build fails with "Module not found: Can't resolve '@/lib/peachify'"

This happens with Nixpacks/Docker build systems that don't resolve `@/` path aliases. The fix is to use relative imports — all route files should import like:
```typescript
import { fetchDecodedMedia } from "../../../lib/peachify";  // ✅ Works everywhere
```
instead of:
```typescript
import { fetchDecodedMedia } from "@/lib/peachify";  // ❌ Nixpacks can't resolve
```

### Empty sources array / 0 sources

- **Check your proxy:** Ensure `PROXY_HOST` and `PROXY_PORT` are set correctly. Without a working proxy, Cloudflare blocks all requests.
- **Check key health:** Call `GET /api/check-key` to see if the AES key has changed.
- **Try a different provider:** Pass `?server=iron` or `?server=dark` — some providers may be down.

### Decryption failures

- Call `/api/check-key` — if `status` is `changed`, the key was rotated.
- If auto-extraction fails, you'll need to manually find the new key by inspecting Peachify's JS bundles in your browser's DevTools.
- Look for 64-character hex strings in `/_next/static/chunks/*.js` files, especially near `decrypt()` or `dD()` function calls.

### Cloudflare 403 errors

- Your proxy IP may be blocked. Try rotating to a new IP by making a new request (if using `-rotate` suffix).
- Ensure the `Referer: https://peachify.top/` and `Origin: https://peachify.top` headers are being sent (they're hardcoded in the source).

### Slow responses

- First requests may be slow due to provider sequential querying. Typical response time is 2-5 seconds.
- If consistently slow, your proxy may have high latency. Try a proxy server closer to the Peachify API servers.

### Nixpacks / Coolify build timeout

- The key extraction process can take 10-20 seconds. Nixpacks default build timeout should be sufficient for `next build`.
- If the build itself times out, increase the build timeout in Coolify settings.

---

## ⚖️ Legal Disclaimer

This project is for **educational and research purposes only**. Reverse-engineering and decrypting streaming service data may violate terms of service and applicable laws in your jurisdiction. The authors do not endorse or encourage piracy. Use at your own risk.

---

## 📜 License

MIT
