# ---------- Rooman One Core web (build) ----------
# Build context: the repository root (the app depends on packages/shell).
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shell/package.json ./packages/shell/
COPY core/frontend/package.json ./core/frontend/
RUN npm ci --workspace @rooman/core-web

COPY packages/shell ./packages/shell
COPY core/frontend ./core/frontend
RUN npm run build --workspace @rooman/core-web

# ---------- Rooman One Core web (serve) ----------
FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY apps/books/deployment/snippets/security_headers.conf /etc/nginx/snippets/security_headers.conf
COPY core/frontend/nginx.conf /etc/nginx/conf.d/core.conf
COPY --from=builder /app/core/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
