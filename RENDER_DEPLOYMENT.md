# Deploy Mitopia Backend to Render - Complete Guide

🚀 **Comprehensive deployment guide for Render.com - Better free tier than Railway!**

## 🌟 **Why Render is Great for Mitopia**

- **750 hours/month free** (vs Railway's $5 credit)
- **Automatic SSL certificates** for all services
- **Easy GitHub integration** with auto-deploys
- **Built-in databases** (PostgreSQL, Redis)
- **Simple environment variables** management
- **Excellent documentation** and support

## 📋 **Prerequisites**

- [x] Render account (free at [render.com](https://render.com))
- [x] GitHub repository: https://github.com/IchuRisco/mitopia-backend
- [ ] OpenAI API key
- [ ] Stripe API keys

## 🎯 **Deployment Strategy**

We'll deploy each service as a separate Render service:
1. **PostgreSQL Database** (managed database)
2. **Redis Cache** (managed database)
3. **API Service** (web service)
4. **Signaling Service** (web service)
5. **Billing Service** (web service)
6. **STT Service** (web service)
7. **Translation Service** (web service)
8. **Notes Service** (web service)

## 🚀 **Step-by-Step Deployment**

### Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Click **"Get Started for Free"**
3. Sign up with GitHub (recommended) or email
4. Verify your email if needed

### Step 2: Connect GitHub Repository

1. In Render dashboard, click **"New +"**
2. Select **"Web Service"**
3. Click **"Connect GitHub"** if not already connected
4. Find and select **"IchuRisco/mitopia-backend"**
5. Click **"Connect"**

### Step 3: Create Database Services

#### 3.1 Create PostgreSQL Database

1. Click **"New +"** → **"PostgreSQL"**
2. **Name:** `mitopia-postgres`
3. **Database:** `mitopia_production`
4. **User:** `mitopia_user`
5. **Region:** Choose closest to your users
6. **Plan:** Free (1GB storage, 1 month retention)
7. Click **"Create Database"**

**Important:** Save the connection details:
- **Internal Database URL:** (for services)
- **External Database URL:** (for external access)

#### 3.2 Create Redis Cache

1. Click **"New +"** → **"Redis"**
2. **Name:** `mitopia-redis`
3. **Region:** Same as PostgreSQL
4. **Plan:** Free (25MB, 30 connection limit)
5. Click **"Create Redis"**

**Important:** Save the Redis connection URL

### Step 4: Deploy Backend Services

#### 4.1 Deploy API Service

1. Click **"New +"** → **"Web Service"**
2. Select **"IchuRisco/mitopia-backend"** repository
3. **Configuration:**
   - **Name:** `mitopia-api`
   - **Root Directory:** `api`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free (750 hours/month)

4. **Environment Variables:**
```env
NODE_ENV=production
DATABASE_URL=[Your PostgreSQL Internal URL]
REDIS_URL=[Your Redis URL]
JWT_SECRET=mitopia_super_secure_jwt_secret_2024
OPENAI_API_KEY=sk-your-openai-api-key
STRIPE_SECRET_KEY=sk-your-stripe-secret-key
FRONTEND_URL=https://mitopia.netlify.app
CORS_ORIGINS=https://mitopia.netlify.app
PORT=10000
```

5. Click **"Create Web Service"**

#### 4.2 Deploy Signaling Service

1. Click **"New +"** → **"Web Service"**
2. Select **"IchuRisco/mitopia-backend"** repository
3. **Configuration:**
   - **Name:** `mitopia-signaling`
   - **Root Directory:** `signaling`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

4. **Environment Variables:**
```env
NODE_ENV=production
REDIS_URL=[Your Redis URL]
API_SERVICE_URL=https://mitopia-api.onrender.com
PORT=10000
```

5. Click **"Create Web Service"**

#### 4.3 Deploy Billing Service

1. Click **"New +"** → **"Web Service"**
2. Select **"IchuRisco/mitopia-backend"** repository
3. **Configuration:**
   - **Name:** `mitopia-billing`
   - **Root Directory:** `billing`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

4. **Environment Variables:**
```env
NODE_ENV=production
DATABASE_URL=[Your PostgreSQL Internal URL]
REDIS_URL=[Your Redis URL]
STRIPE_SECRET_KEY=sk-your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec-your-webhook-secret
API_SERVICE_URL=https://mitopia-api.onrender.com
PORT=10000
```

5. Click **"Create Web Service"**

#### 4.4 Deploy STT Service

1. Click **"New +"** → **"Web Service"**
2. Select **"IchuRisco/mitopia-backend"** repository
3. **Configuration:**
   - **Name:** `mitopia-stt`
   - **Root Directory:** `stt`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python main.py`

4. **Environment Variables:**
```env
REDIS_URL=[Your Redis URL]
API_SERVICE_URL=https://mitopia-api.onrender.com
OPENAI_API_KEY=sk-your-openai-api-key
PORT=10000
```

5. Click **"Create Web Service"**

#### 4.5 Deploy Translation Service

1. Click **"New +"** → **"Web Service"**
2. Select **"IchuRisco/mitopia-backend"** repository
3. **Configuration:**
   - **Name:** `mitopia-translation`
   - **Root Directory:** `translation`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python main.py`

4. **Environment Variables:**
```env
REDIS_URL=[Your Redis URL]
API_SERVICE_URL=https://mitopia-api.onrender.com
OPENAI_API_KEY=sk-your-openai-api-key
PORT=10000
```

5. Click **"Create Web Service"**

#### 4.6 Deploy Notes Service

1. Click **"New +"** → **"Web Service"**
2. Select **"IchuRisco/mitopia-backend"** repository
3. **Configuration:**
   - **Name:** `mitopia-notes`
   - **Root Directory:** `notes`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python main.py`

4. **Environment Variables:**
```env
REDIS_URL=[Your Redis URL]
API_SERVICE_URL=https://mitopia-api.onrender.com
OPENAI_API_KEY=sk-your-openai-api-key
PORT=10000
```

5. Click **"Create Web Service"**

## 🔑 **Getting Your API Keys**

### OpenAI API Key
1. Go to [openai.com/api](https://openai.com/api)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **"Create new secret key"**
5. Copy the key (starts with `sk-`)
6. Add to all AI services (STT, Translation, Notes)

### Stripe API Keys
1. Go to [stripe.com](https://stripe.com)
2. Create account or log in
3. Go to **Developers** → **API keys**
4. Copy **Secret key** (starts with `sk_live_` or `sk_test_`)
5. Set up webhooks for billing service

## 🔧 **Database Setup**

### Run Migrations

After API service is deployed:

1. Go to **mitopia-api** service in Render
2. Click **"Shell"** tab
3. Run migration command:
```bash
npx prisma migrate deploy
```

Or add to your build command:
```bash
npm install && npx prisma migrate deploy && npm run build
```

## 🌐 **Your Service URLs**

After deployment, you'll have these URLs:

- **API:** `https://mitopia-api.onrender.com`
- **Signaling:** `https://mitopia-signaling.onrender.com`
- **Billing:** `https://mitopia-billing.onrender.com`
- **STT:** `https://mitopia-stt.onrender.com`
- **Translation:** `https://mitopia-translation.onrender.com`
- **Notes:** `https://mitopia-notes.onrender.com`

## ✅ **Testing Your Deployment**

### Health Checks
Test each service:
```bash
curl https://mitopia-api.onrender.com/health
curl https://mitopia-signaling.onrender.com/health
curl https://mitopia-billing.onrender.com/health
curl https://mitopia-stt.onrender.com/health
curl https://mitopia-translation.onrender.com/health
curl https://mitopia-notes.onrender.com/health
```

### API Testing
```bash
# Test user registration
curl -X POST https://mitopia-api.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## 🔧 **Render-Specific Configuration Files**

### Create render.yaml (Optional)

Create this file in your repository root for infrastructure as code:

```yaml
# render.yaml
services:
  - type: web
    name: mitopia-api
    env: node
    rootDir: ./api
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: mitopia-postgres
          property: connectionString
      - key: REDIS_URL
        fromDatabase:
          name: mitopia-redis
          property: connectionString

  - type: web
    name: mitopia-signaling
    env: node
    rootDir: ./signaling
    buildCommand: npm install && npm run build
    startCommand: npm start

  - type: web
    name: mitopia-billing
    env: node
    rootDir: ./billing
    buildCommand: npm install && npm run build
    startCommand: npm start

  - type: web
    name: mitopia-stt
    env: python
    rootDir: ./stt
    buildCommand: pip install -r requirements.txt
    startCommand: python main.py

  - type: web
    name: mitopia-translation
    env: python
    rootDir: ./translation
    buildCommand: pip install -r requirements.txt
    startCommand: python main.py

  - type: web
    name: mitopia-notes
    env: python
    rootDir: ./notes
    buildCommand: pip install -r requirements.txt
    startCommand: python main.py

databases:
  - name: mitopia-postgres
    databaseName: mitopia_production
    user: mitopia_user

  - name: mitopia-redis
```

## 💰 **Render Pricing & Limits**

### Free Tier (Perfect for Development)
- **Web Services:** 750 hours/month per service
- **PostgreSQL:** 1GB storage, 1 month backup retention
- **Redis:** 25MB storage, 30 connections
- **Bandwidth:** 100GB/month
- **Build Minutes:** 500 minutes/month

### Paid Plans (For Production)
- **Starter:** $7/month per service
- **Standard:** $25/month per service
- **Pro:** $85/month per service

## 🔧 **Advanced Configuration**

### Custom Domains
1. Go to service **Settings**
2. Click **"Custom Domains"**
3. Add your domain (e.g., `api.yourdomain.com`)
4. Configure DNS CNAME record
5. Render provides automatic SSL

### Auto-Deploy from GitHub
1. Go to service **Settings**
2. Enable **"Auto-Deploy"**
3. Choose branch (usually `main`)
4. Service redeploys automatically on git push

### Environment Groups
1. Create **Environment Group** for shared variables
2. Add common variables (REDIS_URL, DATABASE_URL)
3. Link to multiple services
4. Update once, applies everywhere

## 🆘 **Troubleshooting**

### Common Issues

**Build Failures:**
- Check build logs in service dashboard
- Verify package.json scripts
- Ensure all dependencies are listed

**Service Won't Start:**
- Check start command is correct
- Verify environment variables
- Check service logs for errors

**Database Connection Issues:**
- Use internal database URLs for services
- Verify database is running
- Check connection string format

**Memory Issues:**
- Free tier has 512MB RAM limit
- Optimize your code for memory usage
- Consider upgrading to paid plan

### Getting Help
- **Render Docs:** [render.com/docs](https://render.com/docs)
- **Render Community:** [community.render.com](https://community.render.com)
- **Support:** Available for paid plans

## 🎯 **Deployment Checklist**

- [ ] Render account created
- [ ] GitHub repository connected
- [ ] PostgreSQL database created
- [ ] Redis cache created
- [ ] API service deployed and healthy
- [ ] Signaling service deployed and healthy
- [ ] Billing service deployed and healthy
- [ ] STT service deployed and healthy
- [ ] Translation service deployed and healthy
- [ ] Notes service deployed and healthy
- [ ] Database migrations run
- [ ] Environment variables configured
- [ ] OpenAI API key added
- [ ] Stripe API keys added
- [ ] All health checks passing
- [ ] Frontend environment variables updated

## 🎉 **Success!**

Your Mitopia backend is now live on Render! 

**Service URLs:**
- API: `https://mitopia-api.onrender.com`
- Signaling: `https://mitopia-signaling.onrender.com`
- Billing: `https://mitopia-billing.onrender.com`

**Next Steps:**
1. Update your Netlify frontend with these URLs
2. Test the complete application flow
3. Set up Stripe webhooks
4. Configure monitoring and alerts
5. Launch your meeting utopia! 🚀

**Render vs Railway Comparison:**
- ✅ **Better Free Tier:** 750 hours vs $5 credit
- ✅ **Easier Setup:** More intuitive interface
- ✅ **Better Documentation:** Comprehensive guides
- ✅ **Automatic SSL:** Built-in HTTPS for all services
- ✅ **Stable Platform:** Less experimental than Railway

Your meeting utopia backend is ready to serve users worldwide! 🌍🎯
