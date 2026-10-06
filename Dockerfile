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
# npm is pinned to the major that package-lock.json was resolved with. node:22-alpine
# ships npm 10.x, and under npm 10 `npm ci` fails on this lockfile:
#
#   npm error Missing: @emnapi/core@1.11.3 from lock file
#   npm error Missing: @emnapi/runtime@1.11.3 from lock file
#   npm error Missing: @opentelemetry/api@1.9.1 from lock file
#
# Cause: @tailwindcss/oxide-wasm32-wasi (the WASM *fallback*, never used on linux-x64
# or win32-x64) declares @emnapi/core and @emnapi/runtime as real dependencies. npm 10
# hoists them to the tree root and therefore demands top-level lockfile entries; npm 11
# keeps them nested under the wasm package and is satisfied by the committed lock. The
# same lock installs cleanly on Windows and on linux-x64 under npm 11.
#
# Pinning npm here is what keeps ONE committed lockfile valid on every build platform,
# which is the whole point of `npm ci`. Do not "fix" this by regenerating the lockfile on
# one platform: a lock generated on Linux omits the Windows optional binaries and breaks
# the dev machine, and vice versa.
RUN npm install -g npm@11
COPY package.json package-lock.json ./
# `npm ci` (not `npm install`) so the deploy is reproducible from the committed lockfile.
RUN npm ci

# ---- prod-deps ------------------------------------------------------------
# The same lockfile installed WITHOUT devDependencies. This is a separate stage rather
# than `npm ci --omit=dev` on the line above because the build stage genuinely needs the
# toolchain (vite, esbuild, typescript, tailwind). The runtime stage must not inherit it,
# or the "production dependency tree only" claim is decorative and an accidental
# `require('vite')` in a production path would still resolve instead of failing loudly.
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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

# Production dependency tree only. The bundle already externalised every import, so the
# devDependency pruning is safe — and it is now enforced rather than merely documented.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
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
