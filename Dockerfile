# syntax=docker/dockerfile:1

# Kantahub production image: Next.js standalone output on node:24-alpine.
# The song/sound/media libraries are mounted volumes (see docker-compose.yml),
# never baked into the image.

FROM node:24-alpine AS deps
WORKDIR /app
# Install exactly what package-lock.json pins.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Bind on all interfaces so the TV and phones on the LAN can reach the server.
ENV HOSTNAME=0.0.0.0

# Runtime content locations, all mounted by docker-compose.yml.
ENV SONGS_DIR=/songs
ENV SOUND_DIR=/sound
ENV MEDIA_DIR=/media
ENV MUSIC_DIR=/music
ENV INDEX_DIR=/index

# `public` and `.next/static` are not part of standalone output; copy them in.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# The optional HTTPS front door (see https-proxy.mjs) mints its own
# self-signed certificate, which needs the openssl CLI.
# FluidSynth renders a song to audio on the server for clients that cannot run
# the in-browser Web Audio synth (any plain http:// origin, e.g. a Smart TV).
RUN apk add --no-cache openssl fluidsynth
COPY --from=builder --chown=node:node /app/https-proxy.mjs ./https-proxy.mjs

# The persisted library index is written here (backed by a named volume).
RUN mkdir -p /index && chown node:node /index
# The HTTPS front door stores its certificate here. Docker initialises a named
# volume from this directory (ownership included), so the unprivileged user can
# write the certificate into it.
RUN mkdir -p /tls && chown node:node /tls

USER node
EXPOSE 3000

# Minimal standalone server (honors PORT/HOSTNAME above).
CMD ["node", "server.js"]
