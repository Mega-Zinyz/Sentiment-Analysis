# Backend Dockerfile
FROM node:20-alpine

# Set shell to use explicit sh for clarity
SHELL ["/bin/sh", "-c"]

# Install system dependencies for:
# - Python and build tools (for sentiment analysis)
# - Chromium and dependencies (for Playwright)
# Note: on Alpine 3.17+, chromium binary is at /usr/bin/chromium (no -browser suffix)
RUN apk add --no-cache \
    python3 py3-pip python3-dev build-base gcc musl-dev libffi-dev \
    chromium \
    nss freetype freetype-dev harfbuzz ca-certificates ttf-dejavu \
    wqy-zenhei

# Tell Playwright to skip downloading its own browser and use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy Python requirements and install
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Download spacy language model
RUN python3 -m spacy download xx_ent_wiki_sm --break-system-packages 2>/dev/null || \
    python3 -m spacy download xx_ent_wiki_sm 2>/dev/null || \
    echo "Spacy model will be downloaded at runtime"

# Copy application code
COPY . .

# Create directories for uploads and logs
RUN mkdir -p /app/uploads /app/logs /app/temp

# Use system Chromium — Alpine 3.17+ installs to /usr/bin/chromium (no -browser suffix)
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Expose port
EXPOSE 5000

# Start the application
CMD ["node", "index.js"]