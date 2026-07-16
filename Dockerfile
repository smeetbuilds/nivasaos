FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN bun install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run verify && bun run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN mkdir -p /app/storage/uploads /app/storage/backups && chown -R bun:bun /app
COPY --from=builder --chown=bun:bun /app .
USER bun
EXPOSE 3000
VOLUME ["/app/storage"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:3000/api/health'); if(!r.ok) process.exit(1)"]
CMD ["bun", "--bun", "next", "start", "-H", "0.0.0.0"]
