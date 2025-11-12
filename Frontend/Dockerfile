# Frontend Dockerfile - Multi-stage build
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Angular application
RUN npm run build -- --configuration production

# Production stage - use nginx to serve the built files
FROM nginx:alpine

# Copy built files from build stage
# First, let's see what's in dist by listing it
COPY --from=build /app/dist /tmp/dist
RUN ls -la /tmp/dist && \
    if [ -d "/tmp/dist/browser" ]; then \
      cp -r /tmp/dist/browser/* /usr/share/nginx/html/; \
    elif [ -d "/tmp/dist/frontend/browser" ]; then \
      cp -r /tmp/dist/frontend/browser/* /usr/share/nginx/html/; \
    elif [ -d "/tmp/dist/Frontend/browser" ]; then \
      cp -r /tmp/dist/Frontend/browser/* /usr/share/nginx/html/; \
    else \
      cp -r /tmp/dist/* /usr/share/nginx/html/; \
    fi && \
    rm -rf /tmp/dist

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
