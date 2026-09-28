# Minimal image for directory checks (e.g. Glama): starts the stdio server.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
USER node
ENTRYPOINT ["node", "src/index.js"]
