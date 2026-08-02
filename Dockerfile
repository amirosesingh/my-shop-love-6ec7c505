# Build stage
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --omit=optional

COPY . .
RUN npm run build

# Runtime stage
FROM node:22-slim AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV NITRO_PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/index.mjs"]
