FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/douliuji.db
EXPOSE 3000
CMD ["node","server/index.mjs"]
