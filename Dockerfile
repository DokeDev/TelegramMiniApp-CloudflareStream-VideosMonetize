FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV APP_ENV=production
ENV HOST=0.0.0.0
ENV PORT=18763
ENV SERVE_FRONTEND=true
ENV FRONTEND_DIST_DIR=/app/frontend/dist

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/frontend/package.json ./frontend/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 18763

CMD ["node", "backend/dist/src/index.js"]
