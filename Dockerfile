FROM node:22-alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev && npx prisma generate && npm cache clean --force

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/connector.sqlite
RUN mkdir -p /data

EXPOSE 3000
CMD ["npm", "run", "docker-start"]
