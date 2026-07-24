# Frontend Dockerfile - Multi-stage build
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy rest of app source
COPY . .

# Build the Angular application
RUN npm run build -- --configuration production

# Production stage - use nginx to serve the built files
FROM nginx:alpine

# 1. PERBAIKAN UTAMA: Install openssl agar script docker-entrypoint bisa berjalan
RUN apk add --no-cache openssl

# Copy built files from build stage
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
    # Create a fallback styles.css if the build produced a hashed stylesheet
    for f in /usr/share/nginx/html/styles-*.css; do \
      if [ -f "$f" ]; then \
        cp "$f" /usr/share/nginx/html/styles.css; \
        break; \
      fi; \
    done && \
    rm -rf /tmp/dist

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create a startup script to generate self-signed certificate if needed
RUN mkdir -p /etc/nginx/ssl
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'if [ ! -f /etc/nginx/ssl/server.crt ] || [ ! -f /etc/nginx/ssl/server.key ]; then' >> /docker-entrypoint.sh && \
    echo '  echo "Generating self-signed certificate..."' >> /docker-entrypoint.sh && \
    echo '  openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/server.key -out /etc/nginx/ssl/server.crt -subj "/C=ID/ST=State/L=City/O=Organization/CN=*"' >> /docker-entrypoint.sh && \
    echo 'fi' >> /docker-entrypoint.sh && \
    echo 'exec "$@"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

# Expose ports 80 and 443
EXPOSE 80 443

# Set entrypoint to generate cert before starting nginx
ENTRYPOINT ["/docker-entrypoint.sh"]

# 2. PERBAIKAN KECIL: Hapus duplicate CMD di bagian bawah
CMD ["nginx", "-g", "daemon off;"]