# ── build stage ─────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── runtime stage ───────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# 컴파일 산출물 + 마이그레이션 SQL (마이그레이션 러너는 cwd 기준으로 migrations/ 를 읽음)
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations

EXPOSE 3000
CMD ["node", "dist/main.js"]
