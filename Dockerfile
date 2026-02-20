# syntax=docker/dockerfile:1

# Build stage — compile the Vue frontend
FROM node:lts-alpine AS builder
WORKDIR /app

ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}

ARG VITE_HIDE_CREDITS
ARG VITE_DEFAULT_PRESET
ARG VITE_DEFAULT_DATA_TO_ENCODE
ARG VITE_QR_CODE_PRESETS
ARG VITE_FRAME_PRESET
ARG VITE_FRAME_PRESETS
ARG VITE_DISABLE_LOCAL_STORAGE

ENV VITE_HIDE_CREDITS=${VITE_HIDE_CREDITS}
ENV VITE_DEFAULT_PRESET=${VITE_DEFAULT_PRESET}
ENV VITE_DEFAULT_DATA_TO_ENCODE=${VITE_DEFAULT_DATA_TO_ENCODE}
ENV VITE_QR_CODE_PRESETS=${VITE_QR_CODE_PRESETS}
ENV VITE_FRAME_PRESET=${VITE_FRAME_PRESET}
ENV VITE_FRAME_PRESETS=${VITE_FRAME_PRESETS}
ENV VITE_DISABLE_LOCAL_STORAGE=${VITE_DISABLE_LOCAL_STORAGE}

RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm run build

# Production stage — run the Express server (serves API + built frontend)
FROM node:lts-alpine AS production
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

COPY server ./server

EXPOSE 3001
ENV NODE_ENV=production

# Persist database and uploaded files across container restarts/removals
VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
