# (1) Build Stage
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Build the production bundle (Vite will output to /app/dist)
RUN npm run build

# (2) Production Stage
FROM nginx:alpine

# Remove default static files
RUN rm -rf /usr/share/nginx/html/*

# Copy the built files from the first stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80 only
EXPOSE 80

# Use the default Nginx start command
CMD ["nginx", "-g", "daemon off;"]
