# Railway Deployment Guide - Mitopia Backend

🚀 **Complete guide to deploy Mitopia backend services on Railway**

## 📋 Prerequisites

- Railway account ([railway.app](https://railway.app))
- GitHub repository with backend code
- OpenAI API key
- Stripe API keys (for payments)

## 🎯 Deployment Strategy

We'll deploy each service as a separate Railway service for:
- **Independent scaling** - Scale services based on demand
- **Isolated deployments** - Deploy services independently
- **Better monitoring** - Monitor each service separately
- **Cost optimization** - Pay only for what you use

## 🗄️ Step 1: Database Setup

### 1.1 Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Choose "Empty Project"
4. Name it "mitopia-backend"

### 1.2 Add PostgreSQL Database
1. In your project, click "New Service"
2. Select "Database" → "PostgreSQL"
3. Railway will provision a PostgreSQL instance
4. Note the connection details (automatically available as `${{Postgres.DATABASE_URL}}`)

### 1.3 Add Redis Cache
1. Click "New Service" again
2. Select "Database" → "Redis"
3. Railway will provision a Redis instance
4. Note the connection details (automatically available as `${{Redis.REDIS_URL}}`)

## 🚀 Step 2: Deploy Core Services

### 2.1 Deploy API Service

**Create Service:**
1. Click "New Service" → "GitHub Repo"
2. Connect your GitHub account
3. Select `IchuRisco/mitopia-backend`
4. Railway will detect the repository

**Configure Service:**
1. **Service Name:** `mitopia-api`
2. **Root Directory:** `/api`
3. **Build Command:** `npm run build`
4. **Start Command:** `npm start`

**Environment Variables:**
```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=your_super_secure_jwt_secret_here
OPENAI_API_KEY=sk-your-openai-api-key
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
FRONTEND_URL=https://your-frontend.netlify.app
CORS_ORIGINS=https://your-frontend.netlify.app
```

**Custom Domain (Optional):**
- Go to service Settings → Networking
- Add custom domain: `api.yourdomain.com`

### 2.2 Deploy Signaling Service

**Create Service:**
1. Click "New Service" → "GitHub Repo"
2. Select `IchuRisco/mitopia-backend`

**Configure Service:**
1. **Service Name:** `mitopia-signaling`
2. **Root Directory:** `/signaling`
3. **Build Command:** `npm run build`
4. **Start Command:** `npm start`

**Environment Variables:**
```env
NODE_ENV=production
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
```

**Custom Domain (Optional):**
- Add custom domain: `signaling.yourdomain.com`

### 2.3 Deploy Billing Service

**Create Service:**
1. Click "New Service" → "GitHub Repo"
2. Select `IchuRisco/mitopia-backend`

**Configure Service:**
1. **Service Name:** `mitopia-billing`
2. **Root Directory:** `/billing`
3. **Build Command:** `npm run build`
4. **Start Command:** `npm start`

**Environment Variables:**
```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
```

**Custom Domain (Optional):**
- Add custom domain: `billing.yourdomain.com`

## 🤖 Step 3: Deploy AI Services

### 3.1 Deploy STT Service

**Create Service:**
1. Click "New Service" → "GitHub Repo"
2. Select `IchuRisco/mitopia-backend`

**Configure Service:**
1. **Service Name:** `mitopia-stt`
2. **Root Directory:** `/stt`
3. **Build Command:** (Auto-detected from Dockerfile)
4. **Start Command:** `python main.py`

**Environment Variables:**
```env
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-api-key
```

### 3.2 Deploy Translation Service

**Create Service:**
1. Click "New Service" → "GitHub Repo"
2. Select `IchuRisco/mitopia-backend`

**Configure Service:**
1. **Service Name:** `mitopia-translation`
2. **Root Directory:** `/translation`

**Environment Variables:**
```env
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-api-key
```

### 3.3 Deploy Notes Service

**Create Service:**
1. Click "New Service" → "GitHub Repo"
2. Select `IchuRisco/mitopia-backend`

**Configure Service:**
1. **Service Name:** `mitopia-notes`
2. **Root Directory:** `/notes`

**Environment Variables:**
```env
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-api-key
```

## 🔧 Step 4: Database Migration

### 4.1 Run Migrations
After the API service is deployed:

1. Go to API service in Railway dashboard
2. Click "Deploy" tab
3. Check the deployment logs
4. Migrations should run automatically

If migrations don't run automatically:
1. Go to API service
2. Click "Settings" → "Variables"
3. Add temporary variable: `RUN_MIGRATIONS=true`
4. Redeploy the service
5. Remove the variable after migration completes

### 4.2 Verify Database
```bash
# Check if tables were created
# You can use Railway's built-in database browser
# Or connect with a PostgreSQL client using the DATABASE_URL
```

## 🔐 Step 5: Configure External Services

### 5.1 Stripe Webhooks
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. URL: `https://your-billing-service.up.railway.app/webhooks/stripe`
4. Events to send:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the webhook secret to `STRIPE_WEBHOOK_SECRET`

### 5.2 OpenAI API
1. Go to [OpenAI API](https://openai.com/api)
2. Create account and generate API key
3. Add to all AI services: `OPENAI_API_KEY`

## 📊 Step 6: Monitoring & Health Checks

### 6.1 Health Check Endpoints
All services expose health check endpoints:
- API: `https://your-api.up.railway.app/health`
- Signaling: `https://your-signaling.up.railway.app/health`
- Billing: `https://your-billing.up.railway.app/health`
- STT: `https://your-stt.up.railway.app/health`
- Translation: `https://your-translation.up.railway.app/health`
- Notes: `https://your-notes.up.railway.app/health`

### 6.2 Railway Monitoring
Railway provides built-in monitoring:
- CPU and memory usage
- Request metrics
- Error rates
- Deployment history

### 6.3 Custom Monitoring (Optional)
Set up external monitoring:
- **Uptime monitoring:** UptimeRobot, Pingdom
- **Error tracking:** Sentry
- **Performance monitoring:** New Relic, DataDog

## 🌐 Step 7: Custom Domains (Optional)

### 7.1 Configure DNS
For each service, add DNS records:
```
CNAME  api          your-api-service.up.railway.app
CNAME  signaling    your-signaling-service.up.railway.app
CNAME  billing      your-billing-service.up.railway.app
CNAME  stt          your-stt-service.up.railway.app
CNAME  translation  your-translation-service.up.railway.app
CNAME  notes        your-notes-service.up.railway.app
```

### 7.2 Add Domains in Railway
For each service:
1. Go to service Settings → Networking
2. Click "Custom Domain"
3. Enter your domain (e.g., `api.yourdomain.com`)
4. Railway will provision SSL certificates automatically

## 🧪 Step 8: Testing Deployment

### 8.1 Health Checks
Test all service health endpoints:
```bash
curl https://your-api.up.railway.app/health
curl https://your-signaling.up.railway.app/health
curl https://your-billing.up.railway.app/health
curl https://your-stt.up.railway.app/health
curl https://your-translation.up.railway.app/health
curl https://your-notes.up.railway.app/health
```

### 8.2 API Testing
Test core API functionality:
```bash
# Test user registration
curl -X POST https://your-api.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test authentication
curl -X POST https://your-api.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 8.3 Integration Testing
Test service communication:
- Create a meeting via API
- Test WebRTC signaling
- Test AI transcription
- Test payment processing

## 💰 Step 9: Cost Optimization

### 9.1 Railway Pricing
- **Starter Plan:** $5/month credit
- **Pro Plan:** $20/month + usage
- **Team Plan:** $20/month per seat + usage

### 9.2 Service Scaling
Configure auto-scaling for each service:
1. Go to service Settings → Deploy
2. Configure:
   - **Min Replicas:** 1
   - **Max Replicas:** 3-5 (based on expected load)
   - **CPU Target:** 70%
   - **Memory Target:** 80%

### 9.3 Cost Monitoring
- Monitor usage in Railway dashboard
- Set up billing alerts
- Optimize resource allocation based on metrics

## 🔧 Step 10: Maintenance

### 10.1 Automatic Deployments
Railway automatically deploys on git push:
- Push to `main` branch triggers production deployment
- Push to `develop` branch can trigger staging deployment

### 10.2 Database Backups
Railway provides automatic backups:
- Daily backups for PostgreSQL
- Point-in-time recovery available
- Manual backup triggers available

### 10.3 Log Management
Access logs for each service:
1. Go to service in Railway dashboard
2. Click "Deploy" tab
3. View real-time logs
4. Download logs for analysis

## 🆘 Troubleshooting

### Common Issues

**Service Won't Start:**
- Check environment variables are set correctly
- Verify build logs for errors
- Ensure Dockerfile is in correct location

**Database Connection Issues:**
- Verify `DATABASE_URL` is correctly set
- Check PostgreSQL service is running
- Ensure migrations have been run

**Inter-Service Communication Issues:**
- Use Railway private domains for internal communication
- Verify service names match environment variables
- Check network connectivity between services

**Performance Issues:**
- Monitor CPU and memory usage
- Scale services horizontally if needed
- Optimize database queries
- Enable Redis caching

### Getting Help

**Railway Support:**
- [Railway Documentation](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Railway GitHub](https://github.com/railwayapp/railway)

**Mitopia Support:**
- [GitHub Issues](https://github.com/IchuRisco/mitopia-backend/issues)
- [Documentation](./README.md)

## ✅ Deployment Checklist

- [ ] Railway project created
- [ ] PostgreSQL database deployed
- [ ] Redis cache deployed
- [ ] API service deployed and healthy
- [ ] Signaling service deployed and healthy
- [ ] Billing service deployed and healthy
- [ ] STT service deployed and healthy
- [ ] Translation service deployed and healthy
- [ ] Notes service deployed and healthy
- [ ] Database migrations completed
- [ ] Environment variables configured
- [ ] External services configured (Stripe, OpenAI)
- [ ] Health checks passing
- [ ] Custom domains configured (optional)
- [ ] Monitoring set up
- [ ] Testing completed

## 🎉 Success!

Your Mitopia backend is now live on Railway! 

**Next Steps:**
1. Update your frontend environment variables with the new API URLs
2. Test the complete application flow
3. Set up monitoring and alerts
4. Plan for scaling based on user growth

**Service URLs:**
- API: `https://your-api.up.railway.app`
- Signaling: `https://your-signaling.up.railway.app`
- Billing: `https://your-billing.up.railway.app`

Your meeting utopia backend is ready to serve users worldwide! 🌍🚀
