# (1) Build Stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# (2) Production Stage
FROM node:20-alpine
WORKDIR /app

# Static file server for the frontend
RUN npm install -g serve

# Install production dependencies (needed by server.mjs)
COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend
COPY --from=build /app/dist ./dist

# Copy server and required assets
COPY server.mjs ./
COPY public/fonts ./public/fonts

# Port 80 = frontend, port 4000 = mail server (started manually)
EXPOSE 80 4000

# Default: serve the frontend only
CMD ["serve", "dist", "-l", "80"]
