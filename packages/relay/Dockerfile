# The ctxfile relay / self-hosted Team & Enterprise hub. One image, every SKU.
# Build from the REPO ROOT (the relay depends on the workspace core package):
#   docker build -f packages/relay/Dockerfile -t ctxfile-relay .
# Run with the data dir on a volume (SQLite, keyring master key, org identity):
#   docker run -p 5959:5959 -v ctxfile-relay-data:/data \
#     -e CTXFILE_RELAY_HOST=0.0.0.0 -e CTXFILE_RELAY_ORG=org-yourco ctxfile-relay
# Put TLS in front (Fly.io edge, Caddy, nginx); the relay itself speaks HTTP.

FROM node:22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Only the core + relay manifests are copied: npm globs the workspaces against
# what is actually present and installs just these two, keeping the image free
# of the site/dashboard/pro dependency trees. (Verified: `npm ci --workspaces
# --include-workspace-root` reconciles cleanly with this partial set.)
COPY packages/core/package.json packages/core/package.json
COPY packages/relay/package.json packages/relay/package.json
RUN npm ci --workspaces --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/relay packages/relay
RUN npm run build --workspace ctxfile && npm run build --workspace @ctxfile/relay \
  && npm prune --omit=dev --workspaces --include-workspace-root

FROM node:22-slim
ENV NODE_ENV=production \
    CTXFILE_RELAY_DATA=/data \
    CTXFILE_RELAY_HOST=0.0.0.0 \
    CTXFILE_RELAY_PORT=5959
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/relay ./packages/relay
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 5959
CMD ["node", "packages/relay/dist/cli.js", "start"]
