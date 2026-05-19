# ─────────────────────────────────────────────
# Stage 1: Build (no build step needed for pure HTML/CSS/JS)
# Using multi-stage anyway for best practice demonstration
# ─────────────────────────────────────────────
FROM nginx:1.25-alpine AS base

LABEL maintainer="devops@syspulse.io"
LABEL description="SysPulse — System Monitor Frontend"
LABEL version="1.0.0"

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy application files
COPY app/ /usr/share/nginx/html/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
