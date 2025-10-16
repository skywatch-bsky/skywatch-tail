FROM oven/bun:1.1-slim

WORKDIR /app

COPY package.json bun.lockb* ./

RUN bun install --frozen-lockfile

COPY . .

RUN mkdir -p /app/data/blobs

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
