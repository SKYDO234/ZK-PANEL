FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx esbuild agent/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/agent/index.mjs
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist/agent ./dist/agent
# The agent provisions UID 1000 workloads and needs ownership management.
# It runs on a dedicated node. Never co-locate this socket with the public panel.
EXPOSE 8080
CMD ["node","dist/agent/index.mjs"]
