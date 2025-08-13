# Frontend Dockerfile (Next.js production build)
FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

# IMPORTANT: bake same-origin API at build time
ENV NEXT_PUBLIC_API_URL=""

COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# minimal runtime payload
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
# keep lockfile only if you prefer; not needed to run next start

EXPOSE 3000
CMD ["npx","next","start","-p","3000"]
