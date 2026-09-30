FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app
# libheif's converter and its HEVC decoder: sharp's bundled libheif reads AVIF
# but not the HEVC inside iPhone HEIC photos.
RUN apk add --no-cache libheif-tools libde265
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# Uploads and saved content live on a mounted volume, owned by the unprivileged user.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/cms/health || exit 1
CMD ["node", "src/server.mjs"]
