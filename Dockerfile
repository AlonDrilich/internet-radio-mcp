# Image for the official MCP Registry (ghcr.io/alondrilich/internet-radio-mcp) and directory checks
# such as Glama: starts the stdio server. Built and published by .github/workflows/publish.yml.
FROM node:22-alpine
LABEL io.modelcontextprotocol.server.name="io.github.AlonDrilich/internet-radio-mcp" \
      org.opencontainers.image.source="https://github.com/AlonDrilich/internet-radio-mcp" \
      org.opencontainers.image.description="MCP server: search internet radio stations and stream URLs from the public Radio Browser directory." \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
USER node
ENTRYPOINT ["node", "src/index.js"]
