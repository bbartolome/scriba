# syntax=docker/dockerfile:1
#
# Scriba's image (survey 16 §3, phase:image-compose). Two stages: a build stage with the full
# workspace, and a runtime stage with only what the app needs at run time. The runtime stage has
# Node, Pandoc 3.13, Typst and ca-certificates, and no git or compiler.

ARG NODE_VERSION=24.21.0
ARG PANDOC_VERSION=3.13
ARG TYPST_VERSION=0.15.1

# ---- build: compile the three workspaces the app needs, then drop the dev dependencies.
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /src
COPY . .
RUN npm ci \
 && npm run build -w @bbartolome/scriba-contracts \
 && npm run build -w @bbartolome/scriba-api \
 && npm run build -w @bbartolome/scriba-web \
 && npm prune --omit=dev \
 && mkdir -p /src/examples

# ---- tools: fetch Pandoc and Typst for the image's architecture, and check their versions.
FROM debian:bookworm-slim AS tools
ARG TARGETARCH
ARG PANDOC_VERSION
ARG TYPST_VERSION
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) PANDOC_ARCH=amd64; TYPST_ARCH=x86_64 ;; \
      arm64) PANDOC_ARCH=arm64; TYPST_ARCH=aarch64 ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/pandoc.tar.gz \
      "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-${PANDOC_ARCH}.tar.gz"; \
    tar -xzf /tmp/pandoc.tar.gz -C /tmp; \
    install -m 0755 "/tmp/pandoc-${PANDOC_VERSION}/bin/pandoc" /usr/local/bin/pandoc; \
    curl -fsSL -o /tmp/typst.tar.xz \
      "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${TYPST_ARCH}-unknown-linux-musl.tar.xz"; \
    tar -xJf /tmp/typst.tar.xz -C /tmp; \
    install -m 0755 "/tmp/typst-${TYPST_ARCH}-unknown-linux-musl/typst" /usr/local/bin/typst; \
    pandoc --version | head -1 | grep -q "pandoc ${PANDOC_VERSION}"; \
    typst --version

# ---- runtime: the app, its production dependencies, Pandoc and Typst. No git, no compiler.
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG PANDOC_VERSION
ENV NODE_ENV=production \
    SCRIBA_PORT=8080 \
    SCRIBA_BOOKS_DIR=/books \
    SCRIBA_PACKS_DIR=/opt/scriba/packs \
    SCRIBA_EXAMPLES_DIR=/opt/scriba/examples \
    SCRIBA_TS_SOCKET=/var/run/tailscale/tailscaled.sock
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=tools /usr/local/bin/pandoc /usr/local/bin/pandoc
COPY --from=tools /usr/local/bin/typst /usr/local/bin/typst
WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/package.json ./package.json
COPY --from=build /src/packages/contracts ./packages/contracts
COPY --from=build /src/apps/api/dist ./apps/api/dist
COPY --from=build /src/apps/api/package.json ./apps/api/package.json
COPY --from=build /src/apps/web/dist ./apps/web/dist
COPY --from=build /src/packages/packs /opt/scriba/packs
COPY --from=build /src/examples /opt/scriba/examples
COPY deploy/entrypoint.sh /usr/local/bin/scriba-entrypoint
RUN chmod 0755 /usr/local/bin/scriba-entrypoint
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.SCRIBA_PORT || '8080') + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/scriba-entrypoint"]
