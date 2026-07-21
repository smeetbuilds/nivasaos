FROM oven/bun:1.3.0-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
ARG RENDER_EXTERNAL_HOSTNAME
ARG NIVASA_PUBLIC_URL
ARG NEXT_PUBLIC_APP_URL
ENV RENDER_EXTERNAL_HOSTNAME=${RENDER_EXTERNAL_HOSTNAME} \
    NIVASA_PUBLIC_URL=${NIVASA_PUBLIC_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run verify && bun run build

FROM oven/bun:1.3.0-alpine AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
RUN mkdir -p /app/data /app/storage/uploads /app/storage/backups /app/backups /app/scripts/lib /app/lib/schema /home/bun/.ssh \
    && chmod 0700 /home/bun/.ssh \
    && chown -R bun:bun /app /home/bun/.ssh

COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/package.json /app/jsconfig.json ./
COPY --from=builder --chown=bun:bun /app/scripts/backup.js /app/scripts/restore.js /app/scripts/create-install-token.js /app/scripts/migrate.js /app/scripts/start-container.js ./scripts/
COPY --from=builder --chown=bun:bun /app/scripts/lib ./scripts/lib
COPY --from=builder --chown=bun:bun /app/lib/runtime-paths.js /app/lib/runtime-config.js /app/lib/schema.js ./lib/
COPY --from=builder --chown=bun:bun /app/lib/schema ./lib/schema
RUN bun -e "const p=await Bun.file('package.json').json(); p.scripts={start:'bun run scripts/start-container.js','setup:token':'bun run scripts/create-install-token.js',migrate:'bun run scripts/migrate.js',backup:'bun run scripts/backup.js',restore:'bun run scripts/restore.js'}; await Bun.write('package.json',JSON.stringify(p,null,2)+'\\n')"

USER bun
EXPOSE 3000
VOLUME ["/app/data", "/app/storage/uploads", "/app/backups"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "const port=process.env.PORT||'3000'; const r=await fetch(`http://127.0.0.1:${port}/api/health`); if(!r.ok) process.exit(1)"]
CMD ["bun", "run", "start"]
