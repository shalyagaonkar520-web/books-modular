# ---------- Rooman Books web (build) ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/tsconfig*.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

# ---------- Rooman Books web (serve) ----------
FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY deployment/nginx-ratelimit.conf /etc/nginx/conf.d/00-ratelimit.conf
COPY deployment/nginx.conf /etc/nginx/conf.d/roomanbooks.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
