FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts/postgres-schema.mjs ./scripts/postgres-schema.mjs
RUN npm ci --include=dev \
  && node scripts/postgres-schema.mjs \
  && npx prisma generate --schema prisma/postgres/schema.prisma \
  && npm cache clean --force

COPY . .
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000
CMD ["npm", "run", "docker-start"]
