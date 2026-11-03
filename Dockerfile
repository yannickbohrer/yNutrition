# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM node:22-bookworm-slim AS build
# toolchain only needed if no prebuilt better-sqlite3 binary is available
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
# npm 11 (npm 10 has an arborist bug with this dependency tree)
RUN npm install -g npm@11 --no-fund --no-audit
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-fund --no-audit
COPY . .
# build the app and convert the official Swiss food DB (XLSX → JSON) at build time
RUN npm run build \
	&& node scripts/import-swissfcd.js --convert \
	&& npm prune --omit=dev --no-fund --no-audit

# ---------- runtime stage ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
	PORT=3000 \
	DATABASE_PATH=/data/nutrition.db \
	TZ=Europe/Zurich
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/data/swissfcd.json /app/data/portion-presets.json /app/data/search-aliases.json ./data/
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start.js"]
