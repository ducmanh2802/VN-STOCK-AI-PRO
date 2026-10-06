# VN-STOCK-AI-PRO — SINGLE-SERVER PRODUCTION IMAGE
#
# ONE web service, ONE public URL. Serves the React/Vite bundle AND the Express API
# from the same Node process, so there is no CORS surface and no second host to operate.
#
#   npm ci && npm run build && npm start
#
# The build output is `dist/server.cjs` (esbuild, CJS, --packages=external), so runtime
# needs the production dependency tree only. `vite` is imported DYNAMICALLY and only when
# NODE_ENV !== production, which is what makes pruning devDependencies safe here.

# ---- deps ----------------------------------------------------------------
# Node 22 LTS: vitest@5 declares engines ^22.12.0 || ^24 || >=26, so a Node 20 base
# emits EBADENGINE and the declared engine floor below would be a lie.
FROM node:22-alpine AS deps
WORKDIR /app
# libc6-compat is required by some transitive native builds on Alpine.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
# `npm ci` (not `npm install`) so the deploy is reproducible from the committed lockfile.
RUN npm ci

# ---- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env. Only PUBLIC VITE_* values belong here; a server secret in VITE_*
# would be inlined into the browser bundle and served to every visitor.
ENV NODE_ENV=production
RUN npm run build

# ---- runtime -------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat \
 && addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
# Production dependency tree only. The bundle already externalised every import.
COPY --from=deps /app/package.json ./package.json
COPY --from=build /app/dist ./dist

USER app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    LOG_LEVEL=INFO
# PORT is supplied by the platform and must NOT be hardcoded; the server reads it from
# the environment and defaults only when the platform provides nothing.
EXPOSE 10000

# Uses /api/health, which reports the real dependency states. It answers 200 while the
# process is alive even in a degraded state, so an optional provider outage does not
# cause a restart loop; a genuinely dead process fails the probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
