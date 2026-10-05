# GOOGLE AI STUDIO QUICKSTART

Shortest reliable path from a clean checkout to a running app.

---

## 1. INSTALL

```bash
npm ci
```

## 2. CONFIGURE ENV

AI Studio injects secrets automatically — set these in the **Secrets** panel:

| Variable | Required |
|---|---|
| `GEMINI_API_KEY` | yes (AI copilot) |
| `PORT` | yes in AI Studio (set for you) |

For local work, copy the template and fill in what you need:

```bash
cp .env.example .env
```

PostgreSQL (`SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`) is optional —
without it the app still boots and the real-data market endpoints still work.

## 3. START DEPENDENCIES

No local database or Docker is required. The app connects to whatever PostgreSQL you
configure over the network.

## 4. RUN

```bash
npm run dev          # development (Vite HMR)
```

or for the production build:

```bash
npm run build
npm start
```

## 5. VERIFY HEALTH

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/platform/healthz
```

Expect HTTP `200`. `/api/health` also reports each dependency honestly:

```json
{
  "status": "ok",
  "dependencies": {
    "database": "DATABASE_CONFIGURATION_REQUIRED",
    "auth": "AUTH_CONFIGURATION_REQUIRED",
    "gemini": "GEMINI_CONFIGURED"
  }
}
```

`CONFIGURATION_REQUIRED` means *not configured* — never *faked data*.

## 6. OPEN UI

```bash
echo "open http://localhost:3000/"
```

The header index ticker (VN-Index, VN30, HNX, UPCoM) shows live market data. If it
shows dashes, check the browser console for a CSP violation.
