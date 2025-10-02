# backend/Dockerfile
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# expose backend port
EXPOSE 5050

# health + run
CMD ["node", "server.js"]
