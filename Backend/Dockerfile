# Backend Dockerfile
FROM node:20-alpine

# Install Python and build dependencies for native modules
RUN apk add --no-cache python3 py3-pip python3-dev build-base gcc musl-dev libffi-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy Python requirements and install
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Download spacy language model
RUN python3 -m spacy download xx_ent_wiki_sm --break-system-packages || echo "Spacy model download failed, will try at runtime"

# Copy application code
COPY . .

# Create directories for uploads and logs
RUN mkdir -p /app/uploads /app/logs

# Expose port
EXPOSE 5000

# Start the application
CMD ["node", "index.js"]
