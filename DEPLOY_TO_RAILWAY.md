# Deploy Mitopia Backend to Railway - Step by Step Guide

🚀 **Complete deployment guide for your Railway account: ichurisco@gmail.com**

## 📋 Prerequisites Checklist

- [x] Railway account: ichurisco@gmail.com
- [x] GitHub repository: https://github.com/IchuRisco/mitopia-backend
- [ ] OpenAI API key
- [ ] Stripe API keys

## 🎯 Deployment Steps

### Step 1: Access Railway Dashboard

1. Go to [railway.app](https://railway.app)
2. Sign in with: **ichurisco@gmail.com**
3. You should see your Railway dashboard

### Step 2: Create New Project

1. Click **"New Project"**
2. Choose **"Empty Project"**
3. Name it: **"mitopia-backend"**
4. Click **"Create"**

### Step 3: Add Database Services

#### 3.1 Add PostgreSQL Database
1. In your project, click **"New Service"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will provision the database automatically
4. Note: The connection URL will be available as `${{Postgres.DATABASE_URL}}`

#### 3.2 Add Redis Cache
1. Click **"New Service"** again
2. Select **"Database"** → **"Redis"**
3. Railway will provision Redis automatically
4. Note: The connection URL will be available as `${{Redis.REDIS_URL}}`

### Step 4: Deploy Backend Services

Now we'll deploy each service from your GitHub repository:

#### 4.1 Deploy API Service

1. Click **"New Service"** → **"GitHub Repo"**
2. Connect your GitHub account if not already connected
3. Select **"IchuRisco/mitopia-backend"**
4. Railway will import the repository

**Configure API Service:**
1. **Service Name:** Change to `mitopia-api`
2. **Root Directory:** Set to `/api`
3. **Build Command:** `npm run build`
4. **Start Command:** `npm start`

**Add Environment Variables:**
Go to service **Settings** → **Variables** and add:
```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=mitopia_super_secure_jwt_secret_2024
OPENAI_API_KEY=sk-your-openai-api-key-here
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
FRONTEND_URL=https://mitopia.netlify.app
CORS_ORIGINS=https://mitopia.netlify.app
```

#### 4.2 Deploy Signaling Service

1. Click **"New Service"** → **"GitHub Repo"**
2. Select **"IchuRisco/mitopia-backend"** again

**Configure Signaling Service:**
1. **Service Name:** Change to `mitopia-signaling`
2. **Root Directory:** Set to `/signaling`

**Add Environment Variables:**
```
NODE_ENV=production
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
```

#### 4.3 Deploy Billing Service

1. Click **"New Service"** → **"GitHub Repo"**
2. Select **"IchuRisco/mitopia-backend"** again

**Configure Billing Service:**
1. **Service Name:** Change to `mitopia-billing`
2. **Root Directory:** Set to `/billing`

**Add Environment Variables:**
```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
STRIPE_SECRET_KEY=sk_live_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
```

#### 4.4 Deploy STT Service

1. Click **"New Service"** → **"GitHub Repo"**
2. Select **"IchuRisco/mitopia-backend"** again

**Configure STT Service:**
1. **Service Name:** Change to `mitopia-stt`
2. **Root Directory:** Set to `/stt`

**Add Environment Variables:**
```
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-api-key-here
```

#### 4.5 Deploy Translation Service

1. Click **"New Service"** → **"GitHub Repo"**
2. Select **"IchuRisco/mitopia-backend"** again

**Configure Translation Service:**
1. **Service Name:** Change to `mitopia-translation`
2. **Root Directory:** Set to `/translation`

**Add Environment Variables:**
```
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-api-key-here
```

#### 4.6 Deploy Notes Service

1. Click **"New Service"** → **"GitHub Repo"**
2. Select **"IchuRisco/mitopia-backend"** again

**Configure Notes Service:**
1. **Service Name:** Change to `mitopia-notes`
2. **Root Directory:** Set to `/notes`

**Add Environment Variables:**
```
REDIS_URL=${{Redis.REDIS_URL}}
API_SERVICE_URL=${{mitopia-api.RAILWAY_PRIVATE_DOMAIN}}
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### Step 5: Get Your API Keys

#### 5.1 OpenAI API Key
1. Go to [openai.com/api](https://openai.com/api)
2. Sign up or log in
3. Go to **API Keys** section
4. Click **"Create new secret key"**
5. Copy the key (starts with `sk-`)
6. Add to all AI services in Railway

#### 5.2 Stripe API Keys
1. Go to [stripe.com](https://stripe.com)
2. Create account or log in
3. Go to **Developers** → **API keys**
4. Copy **Secret key** (starts with `sk_live_` or `sk_test_`)
5. Add to billing and API services

### Step 6: Run Database Migrations

After the API service is deployed:

1. Go to **mitopia-api** service in Railway
2. Click **"Deploy"** tab
3. Check the logs - migrations should run automatically
4. If not, go to **Settings** → **Variables**
5. Add: `RUN_MIGRATIONS=true`
6. Redeploy the service
7. Remove the variable after migration completes

### Step 7: Test Your Deployment

#### 7.1 Check Service Health
Test each service health endpoint:

```bash
# API Service
curl https://mitopia-api-production.up.railway.app/health

# Signaling Service  
curl https://mitopia-signaling-production.up.railway.app/health

# Billing Service
curl https://mitopia-billing-production.up.railway.app/health

# STT Service
curl https://mitopia-stt-production.up.railway.app/health

# Translation Service
curl https://mitopia-translation-production.up.railway.app/health

# Notes Service
curl https://mitopia-notes-production.up.railway.app/health
```

#### 7.2 Test API Functionality
```bash
# Test user registration
curl -X POST https://mitopia-api-production.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Step 8: Get Your Service URLs

After deployment, you'll have these URLs:
- **API:** `https://mitopia-api-production.up.railway.app`
- **Signaling:** `https://mitopia-signaling-production.up.railway.app`
- **Billing:** `https://mitopia-billing-production.up.railway.app`
- **STT:** `https://mitopia-stt-production.up.railway.app`
- **Translation:** `https://mitopia-translation-production.up.railway.app`
- **Notes:** `https://mitopia-notes-production.up.railway.app`

### Step 9: Update Frontend Environment Variables

Update your Netlify frontend with these URLs:
```env
VITE_API_URL=https://mitopia-api-production.up.railway.app
VITE_SIGNALING_URL=https://mitopia-signaling-production.up.railway.app
VITE_TRANSLATION_URL=https://mitopia-translation-production.up.railway.app
VITE_BILLING_URL=https://mitopia-billing-production.up.railway.app
```

## 🔧 Troubleshooting

### Common Issues:

**Service Won't Start:**
- Check the **Deploy** logs in Railway dashboard
- Verify environment variables are set correctly
- Ensure the root directory is set properly

**Database Connection Issues:**
- Verify PostgreSQL service is running
- Check that `DATABASE_URL` is correctly referenced
- Ensure migrations have been run

**Inter-Service Communication Issues:**
- Use Railway private domains: `${{service-name.RAILWAY_PRIVATE_DOMAIN}}`
- Check that service names match exactly

### Getting Help:
- Check Railway documentation: [docs.railway.app](https://docs.railway.app)
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- GitHub Issues: [github.com/IchuRisco/mitopia-backend/issues](https://github.com/IchuRisco/mitopia-backend/issues)

## ✅ Deployment Checklist

- [ ] Railway project created: "mitopia-backend"
- [ ] PostgreSQL database added and running
- [ ] Redis cache added and running
- [ ] API service deployed and healthy
- [ ] Signaling service deployed and healthy
- [ ] Billing service deployed and healthy
- [ ] STT service deployed and healthy
- [ ] Translation service deployed and healthy
- [ ] Notes service deployed and healthy
- [ ] Database migrations completed
- [ ] All environment variables configured
- [ ] OpenAI API key added
- [ ] Stripe API keys added
- [ ] All health checks passing
- [ ] Frontend environment variables updated

## 🎉 Success!

Once all services are deployed and healthy, your Mitopia backend will be live on Railway! 

**Next Steps:**
1. Test the complete application flow
2. Set up Stripe webhooks pointing to your billing service
3. Configure custom domains (optional)
4. Set up monitoring and alerts
5. Launch your meeting utopia! 🚀

**Your backend is now ready to serve users worldwide!** 🌍
