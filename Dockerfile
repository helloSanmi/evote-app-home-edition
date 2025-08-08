# Stage 1: Build
FROM node:18-alpine3.19 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production image
FROM node:18-alpine3.19 AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm install --only=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# This is the key change: ensure the environment variable is available at runtime
ENV NEXT_PUBLIC_API_URL="http://votingapp-backend-service:5000"

EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0"]