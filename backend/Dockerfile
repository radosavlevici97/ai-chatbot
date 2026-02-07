FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

# Install all dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY backend/ ./backend/

# Build shared package first, then backend
RUN pnpm --filter @chatbot/shared build
RUN pnpm --filter @chatbot/backend build

# Use pnpm deploy to create a production-only install
RUN pnpm --filter @chatbot/backend deploy --prod /app/production

# ── Production ─────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Copy production-only dependencies from pnpm deploy
COPY --from=builder /app/production/node_modules ./node_modules
COPY --from=builder /app/production/package.json ./

# Copy built artifacts
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/drizzle ./drizzle

# Create data directory (Railway Volume mounts over this)
RUN mkdir -p /data/uploads /data/chroma

# Non-root user for security
RUN addgroup --system chatbot && adduser --system --ingroup chatbot chatbot
RUN chown -R chatbot:chatbot /app /data
USER chatbot

EXPOSE 8000

# Health check — Railway also uses healthcheckPath but this is a Docker-native fallback
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/api/v1/health || exit 1

CMD ["node", "dist/index.js"]
