# backend/Dockerfile
FROM node:20-alpine
WORKDIR /srv/app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV HOST=0.0.0.0
ENV PORT=5000
EXPOSE 5000
CMD ["node","server.js"]
