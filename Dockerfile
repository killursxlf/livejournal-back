# syntax=docker/dockerfile:1

FROM oven/bun:1.3.5

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bunx prisma generate --no-engine

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
