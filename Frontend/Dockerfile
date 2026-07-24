# Frontend Dockerfile - Multi-stage build
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration production

# ==========================================
# Production stage - Nginx
# ==========================================
FROM nginx:alpine

# WAJIB DI SINI: Install openssl & bash langsung setelah FROM
RUN apk add --no-cache openssl bash

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
    for f in /usr/share/nginx/html/styles-*.css; do \
      if [ -f "$f" ]; then \
        cp "$f" /usr/share/nginx/html/styles.css; \
        break; \
      fi; \
    done && \
    rm -rf /tmp/dist

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create startup script for self-signed cert
RUN mkdir -p /etc/nginx/ssl
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'if [ ! -f /etc/nginx/ssl/server.crt ] || [ ! -f /etc/nginx/ssl/server.key ]; then' >> /docker-entrypoint.sh && \
    echo '  echo "Generating self-signed certificate..."' >> /docker-entrypoint.sh && \
    echo '  openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/server.key -out /etc/nginx/ssl/server.crt -subj "/C=ID/ST=State/L=City/O=Organization/CN=*"' >> /docker-entrypoint.sh && \
    echo 'fi' >> /docker-entrypoint.sh && \
    echo 'exec "$@"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]