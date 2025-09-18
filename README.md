# Mitopia Backend Services

🚀 **Backend microservices for Mitopia - Your Meeting Utopia**

This repository contains all backend services for the Mitopia application, optimized for deployment on Railway.

## 🏗️ Architecture

Mitopia backend consists of 6 microservices:

### 🔧 Core Services
- **API Service** (`/api`) - Main REST API with authentication, meetings, and user management
- **Signaling Service** (`/signaling`) - WebRTC signaling server for video calls
- **Billing Service** (`/billing`) - Subscription and payment processing with Stripe

### 🤖 AI Services  
- **STT Service** (`/stt`) - Speech-to-text transcription using faster-whisper
- **Translation Service** (`/translation`) - Real-time language translation
- **Notes Service** (`/notes`) - AI-powered meeting notes and summaries

### 📦 Shared
- **Shared Package** (`/packages/shared`) - Common TypeScript types and utilities

## 🚀 Quick Deploy to Railway

### Prerequisites
- Railway account ([railway.app](https://railway.app))
- OpenAI API key
- Stripe API keys

### 1. Database Setup
Deploy these first in your Railway project:
```
1. PostgreSQL database
2. Redis cache
```

### 2. Deploy Services
Each service can be deployed separately to Railway:

#### API Service
```bash
# Root directory: /api
# Environment variables:
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=your_jwt_secret_here
OPENAI_API_KEY=sk-your-openai-key
STRIPE_SECRET_KEY=sk_your_stripe_key
FRONTEND_URL=https://your-frontend.netlify.app
```

#### Signaling Service
```bash
# Root directory: /signaling
# Environment variables:
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{API.RAILWAY_PRIVATE_DOMAIN}}
```

#### Billing Service
```bash
# Root directory: /billing
# Environment variables:
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
STRIPE_SECRET_KEY=sk_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

#### STT Service
```bash
# Root directory: /stt
# Environment variables:
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{API.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-key
```

#### Translation Service
```bash
# Root directory: /translation
# Environment variables:
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{API.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-key
```

#### Notes Service
```bash
# Root directory: /notes
# Environment variables:
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{API.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-key
```

## 🔧 Local Development

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL
- Redis

### Setup
```bash
# Clone repository
git clone https://github.com/IchuRisco/mitopia-backend.git
cd mitopia-backend

# Install dependencies for Node.js services
cd api && npm install && cd ..
cd signaling && npm install && cd ..
cd billing && npm install && cd ..

# Install dependencies for Python services
cd stt && pip install -r requirements.txt && cd ..
cd translation && pip install -r requirements.txt && cd ..
cd notes && pip install -r requirements.txt && cd ..

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Run Services
```bash
# API Service
cd api && npm run dev

# Signaling Service  
cd signaling && npm run dev

# Billing Service
cd billing && npm run dev

# Python Services
cd stt && python main.py
cd translation && python main.py
cd notes && python main.py
```

## 📊 Service Details

### API Service (Node.js + TypeScript)
- **Port:** 8001
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Features:** Authentication, meetings, users, invitations
- **Health Check:** `/health`

### Signaling Service (Node.js + TypeScript)
- **Port:** 8002
- **Framework:** Socket.IO
- **Features:** WebRTC signaling, room management
- **Health Check:** `/health`

### Billing Service (Node.js + TypeScript)
- **Port:** 8005
- **Framework:** Express.js
- **Features:** Stripe integration, subscriptions, webhooks
- **Health Check:** `/health`

### STT Service (Python)
- **Port:** 8003
- **Framework:** FastAPI
- **Features:** Speech-to-text with faster-whisper
- **Health Check:** `/health`

### Translation Service (Python)
- **Port:** 8004
- **Framework:** FastAPI
- **Features:** Real-time translation with OpenAI
- **Health Check:** `/health`

### Notes Service (Python)
- **Port:** 8006
- **Framework:** FastAPI
- **Features:** AI meeting summaries with OpenAI
- **Health Check:** `/health`

## 🔐 Environment Variables

### Required for All Services
```env
NODE_ENV=production
LOG_LEVEL=info
```

### Database Services (API, Billing)
```env
DATABASE_URL=postgresql://user:pass@host:port/db
```

### Cache Services (All)
```env
REDIS_URL=redis://host:port
```

### AI Services (STT, Translation, Notes, API)
```env
OPENAI_API_KEY=sk-your-openai-api-key
```

### Payment Services (Billing, API)
```env
STRIPE_SECRET_KEY=sk_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### Authentication (API)
```env
JWT_SECRET=your-super-secure-jwt-secret
```

## 🐳 Docker Support

Each service includes production-ready Dockerfiles:

```bash
# Build individual service
docker build -f api/Dockerfile.production -t mitopia-api ./api

# Or use docker-compose for local development
docker-compose up -d
```

## 📈 Monitoring

### Health Checks
All services expose health check endpoints:
- `GET /health` - Service health status
- Returns 200 OK when healthy

### Logging
- Structured JSON logging
- Configurable log levels
- Request/response logging
- Error tracking

### Metrics
- Performance metrics
- Usage analytics
- Error rates
- Response times

## 🔒 Security

### Authentication
- JWT tokens with refresh mechanism
- Rate limiting on all endpoints
- Input validation and sanitization

### Data Protection
- Encrypted environment variables
- Secure database connections
- HTTPS enforcement
- CORS configuration

## 🚀 Deployment

### Railway Deployment
1. Create Railway project
2. Add PostgreSQL and Redis services
3. Deploy each microservice separately
4. Configure environment variables
5. Set up custom domains (optional)

### Environment Setup
- **Development:** Local with Docker Compose
- **Staging:** Railway with test data
- **Production:** Railway with live data

## 📚 API Documentation

### OpenAPI Specification
- API service includes complete OpenAPI 3.0 specification
- Available at `/api/docs` when running
- Includes all endpoints, schemas, and examples

### Service Communication
- Internal service communication via Railway private networking
- External API access via public domains
- WebSocket connections for real-time features

## 🧪 Testing

### Unit Tests
```bash
# Node.js services
npm run test

# Python services
python -m pytest
```

### Integration Tests
```bash
# Run integration test suite
npm run test:integration
```

### Load Testing
```bash
# API load testing
npm run test:load
```

## 🔧 Maintenance

### Database Migrations
```bash
# Run migrations
cd api && npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### Backups
- Automatic database backups via Railway
- Redis persistence enabled
- Application logs retained

### Updates
- Automatic deployments on git push
- Rolling updates with zero downtime
- Health check validation

## 📞 Support

### Documentation
- [API Documentation](./api/README.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

### Issues
- [GitHub Issues](https://github.com/IchuRisco/mitopia-backend/issues)
- [Frontend Repository](https://github.com/IchuRisco/mitopia)

### Community
- [Discussions](https://github.com/IchuRisco/mitopia-backend/discussions)
- [Contributing Guide](./CONTRIBUTING.md)

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

**Mitopia Backend** - Powering the future of intelligent meetings 🚀
