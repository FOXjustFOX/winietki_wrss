# (1) Build Stage
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Build frontend and server
RUN npm run build && npm run build:server

# (2) Production Stage
FROM node:20-alpine
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/public/fonts ./public/fonts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

ENV NODE_ENV=production
ENV PORT=80

EXPOSE 80

CMD ["node", "dist-server/server/index.js"]
