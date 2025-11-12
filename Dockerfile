# AAAchat server Dockerfile
# Build a production Node.js image

FROM mcr.microsoft.com/devcontainers/javascript-node:20 AS base
WORKDIR /app/server
ENV NODE_ENV=production

# Install server dependencies first to leverage Docker layer caching
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy server source and client static files
COPY server ./
COPY client ../client

# Ensure uploads dir exists (also mapped as a volume via compose)
RUN mkdir -p /app/server/uploads

EXPOSE 3000
CMD ["node", "index.js"]