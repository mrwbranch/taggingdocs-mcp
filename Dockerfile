FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Git is used at build + runtime to clone/pull the taggingdocs content repo.
RUN apk add --no-cache git

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ ./dist/

# Clone taggingdocs content at build time
RUN git clone --depth 1 https://github.com/mrwbranch/taggingdocs.git content-repo

# Data volume for SQLite (OAuth sessions)
RUN mkdir -p /data
VOLUME /data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
