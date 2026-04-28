# Root Dockerfile - builds the web app when deploying from project root.
# BUILD_CONTEXT: "apps/web" when base dir is repo root (default). Use "." when base dir is apps/web.
# Pass --build-arg BUILD_CONTEXT=. when your platform uses apps/web as the build context.
ARG BUILD_CONTEXT=apps/web
FROM node:20-alpine AS base

FROM base AS deps
ARG BUILD_CONTEXT
WORKDIR /app
COPY ${BUILD_CONTEXT}/package.json ${BUILD_CONTEXT}/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM base AS builder
ARG BUILD_CONTEXT
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY ${BUILD_CONTEXT} .

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ARG NEXT_PUBLIC_MEMONEXT_SUPPORT_URL
ENV NEXT_PUBLIC_MEMONEXT_SUPPORT_URL=$NEXT_PUBLIC_MEMONEXT_SUPPORT_URL

ARG NEXT_PUBLIC_GUEST_TRIAL_USER_ID
ENV NEXT_PUBLIC_GUEST_TRIAL_USER_ID=$NEXT_PUBLIC_GUEST_TRIAL_USER_ID

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
