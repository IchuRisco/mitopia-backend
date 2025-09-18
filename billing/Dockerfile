# MindMeet Billing Service Dockerfile

FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S mindmeet && \
    adduser -S mindmeet -u 1001

# Change ownership of the app directory
RUN chown -R mindmeet:mindmeet /app
USER mindmeet

# Expose port
EXPOSE 8005

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8005/health || exit 1

# Start the application
CMD ["npm", "start"]
