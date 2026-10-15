FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup --system --gid 1001 sportsdesk && adduser --system --uid 1001 --ingroup sportsdesk sportsdesk
COPY --from=build --chown=sportsdesk:sportsdesk /app/.next/standalone ./
COPY --from=build --chown=sportsdesk:sportsdesk /app/.next/static ./.next/static
USER sportsdesk
EXPOSE 3000
CMD ["node", "server.js"]
