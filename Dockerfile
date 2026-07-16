FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN bun install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun --bun next build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN mkdir -p /app/storage/uploads && chown -R bun:bun /app
COPY --from=builder --chown=bun:bun /app .
USER bun
EXPOSE 3000
VOLUME ["/app/storage"]
CMD ["bun", "--bun", "next", "start", "-H", "0.0.0.0"]
