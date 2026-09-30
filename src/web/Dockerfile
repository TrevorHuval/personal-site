FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Absolute origin the site is served from; drives Open Graph URLs and sitemap.xml.
ARG SITE_URL=https://trevorhuval.com
ENV SITE_URL=$SITE_URL
# GA4 measurement ID (public). Empty means no analytics tag is emitted.
ARG GA_MEASUREMENT_ID=
ENV GA_MEASUREMENT_ID=$GA_MEASUREMENT_ID
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
