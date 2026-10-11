FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV APP_ENV=production
# The render worker needs FFmpeg, ImageMagick and a font; the web process ignores them.
RUN apk add --no-cache ffmpeg imagemagick font-dejavu
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
EXPOSE 5000
USER node
# Web: node dist/index.cjs · Worker: node dist/worker.cjs (run as a second container/service with a MEDIA_DIR volume)
CMD ["node", "dist/index.cjs"]
