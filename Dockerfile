# Stage 1: Builder
FROM node:20-alpine AS builder

# Install pnpm globally
RUN npm install -g pnpm@9

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY web/package.json web/pnpm-lock.yaml ./web/

# Install dependencies for both backend and frontend
RUN pnpm install --frozen-lockfile

# Copy application source
COPY . .

# Build backend (NestJS)
RUN pnpm run build

# Build frontend (React + Vite)
RUN cd web && pnpm install && pnpm build

# Stage 2: Production
FROM node:20-alpine AS production

# Install pnpm globally
RUN npm install -g pnpm@9

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built backend from builder
COPY --from=builder /app/dist ./dist

# Copy built frontend from builder
COPY --from=builder /app/web/dist ./web/dist

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Start the application
CMD ["node", "dist/main.js"]
