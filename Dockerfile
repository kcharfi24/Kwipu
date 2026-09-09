# Multi-stage Dockerfile for Kwipu (FastAPI Bridge + Three.js Frontend)

# Stage 1: Build the Vite Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Runtime
FROM python:3.12-slim AS final

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    KWIPU_ROOT_DIR=/app \
    KWIPU_KNOWLEDGE_DIR=knowledge_base \
    KWIPU_STORAGE_DIR=storage_graph \
    KWIPU_EMBED_MODEL=nomic-embed-text \
    KWIPU_LLM_MODEL=qwen2.5-coder:7b \
    KWIPU_OLLAMA_BASE_URL=http://host.docker.internal:11434 \
    BRIDGE_HOST=0.0.0.0 \
    BRIDGE_PORT=8765

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt ./
COPY bridge/requirements.txt ./bridge/
RUN pip install --upgrade pip && \
    pip install -r requirements.txt -r bridge/requirements.txt

# Copy backend application code
COPY *.py ./
COPY bridge/ ./bridge/
COPY knowledge_base/ ./knowledge_base/
COPY storage_graph/ ./storage_graph/

# Copy built frontend assets to Nginx html root
COPY --from=frontend-builder /app/frontend/dist /var/www/html

# Configure Nginx reverse proxy (Port 80 serves frontend + proxies /api/ and /graph/ to Bridge)
RUN cat << 'NGINX_CONF' > /etc/nginx/sites-available/default
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/html;
    index index.html;

    server_name _;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8765/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Direct proxy pass for health/snapshot/query/expand
    location ~ ^/(health|graph|query|expand|docs|openapi.json) {
        proxy_pass http://127.0.0.1:8765;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX_CONF

# Create entrypoint script to run both Nginx & FastAPI bridge
RUN cat << 'ENTRYPOINT' > /app/entrypoint.sh
#!/bin/bash
set -e

echo "=== Starting Nginx Web Server ==="
nginx

echo "=== Starting Kwipu Bridge on port 8765 ==="
exec python -m bridge
ENTRYPOINT

RUN chmod +x /app/entrypoint.sh

EXPOSE 80 8765

ENTRYPOINT ["/app/entrypoint.sh"]
