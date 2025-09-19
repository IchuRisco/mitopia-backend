# 🚀 Railway Deployment Guide for Mitopia Backend

This guide will help you deploy all Mitopia backend services to Railway.app with ease.

## 🎯 Why Railway is Better for Mitopia

✅ **Better Monorepo Support** - Handles multiple services in one repository  
✅ **Automatic Database Provisioning** - PostgreSQL and Redis with one click  
✅ **Environment Variable Management** - Easy configuration across services  
✅ **Nixpacks Builder** - Automatic detection and optimization  
✅ **Service Linking** - Internal networking between services  
✅ **Free Tier** - $5 credit monthly, perfect for development  

## 📋 Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: `IchuRisco/mitopia-backend` (already created)
3. **API Keys**: OpenAI, Stripe (we'll add these during deployment)

## 🚀 Step-by-Step Deployment

### Step 1: Create Railway Project

1. Go to [railway.app/dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose **"IchuRisco/mitopia-backend"**
5. Railway will create the project automatically

### Step 2: Add Database Services

#### Add PostgreSQL Database
1. In your Railway project, click **"+ New Service"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will provision the database automatically
4. Note the connection details (automatically available as environment variables)

#### Add Redis Cache
1. Click **"+ New Service"** again
2. Select **"Database"** → **"Redis"**
3. Railway will provision Redis automatically

### Step 3: Deploy Individual Services

Railway will automatically detect the services in your repository. For each service:

#### API Service
1. Click **"+ New Service"** → **"GitHub Repo"**
2. Select **"IchuRisco/mitopia-backend"**
3. Set **Root Directory**: `api`
4. Railway will use the `api/railway.json` configuration
5. Service will be available at: `https://mitopia-api-production.up.railway.app`

#### Signaling Service
1. Click **"+ New Service"** → **"GitHub Repo"**
2. Select **"IchuRisco/mitopia-backend"**
3. Set **Root Directory**: `signaling`
4. Service will be available at: `https://mitopia-signaling-production.up.railway.app`

#### Billing Service
1. Click **"+ New Service"** → **"GitHub Repo"**
2. Select **"IchuRisco/mitopia-backend"**
3. Set **Root Directory**: `billing`
4. Service will be available at: `https://mitopia-billing-production.up.railway.app`

#### Python Services (STT, Translation, Notes)
1. For each Python service, click **"+ New Service"** → **"GitHub Repo"**
2. Set Root Directory: `stt`, `translation`, or `notes`
3. Railway will automatically detect Python and use the requirements.txt

### Step 4: Configure Environment Variables

For each service, add these environment variables in Railway dashboard:

#### API Service Environment Variables
```env
NODE_ENV=production
PORT=8001
JWT_SECRET=mitopia_super_secure_jwt_secret_2024_production
DATABASE_URL=${DATABASE_URL}  # Automatically provided by Railway PostgreSQL
REDIS_URL=${REDIS_URL}        # Automatically provided by Railway Redis
RABBITMQ_URL=${RABBITMQ_URL}  # We'll add RabbitMQ next
LOG_LEVEL=info

# API Keys (add your actual keys)
OPENAI_API_KEY=your_openai_api_key_here
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret_here

# Service URLs (update after deployment)
SIGNALING_SERVICE_URL=https://mitopia-signaling-production.up.railway.app
BILLING_SERVICE_URL=https://mitopia-billing-production.up.railway.app
STT_SERVICE_URL=https://mitopia-stt-production.up.railway.app
TRANSLATION_SERVICE_URL=https://mitopia-translation-production.up.railway.app
NOTES_SERVICE_URL=https://mitopia-notes-production.up.railway.app

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# SMS Configuration (optional)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
```

#### Signaling Service Environment Variables
```env
NODE_ENV=production
PORT=8002
REDIS_URL=${REDIS_URL}
API_SERVICE_URL=https://mitopia-api-production.up.railway.app
LOG_LEVEL=info

# TURN Server Configuration
TURN_SERVER_URL=turn:your-turn-server.com:3478
TURN_USERNAME=your_turn_username
TURN_CREDENTIAL=your_turn_password
```

#### Billing Service Environment Variables
```env
NODE_ENV=production
PORT=8005
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
LOG_LEVEL=info

# Stripe Configuration
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret_here
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here

# PayPal Configuration (optional)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox  # or 'live' for production
```

#### Python Services Environment Variables
```env
# STT Service
PORT=8003
REDIS_URL=${REDIS_URL}
RABBITMQ_URL=${RABBITMQ_URL}
MODEL_SIZE=base  # or 'small', 'medium', 'large'
LOG_LEVEL=info

# Translation Service
PORT=8004
OPENAI_API_KEY=your_openai_api_key_here
REDIS_URL=${REDIS_URL}
LOG_LEVEL=info

# Notes Service
PORT=8006
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
LOG_LEVEL=info
```

### Step 5: Add RabbitMQ (Optional)

1. Click **"+ New Service"** → **"Database"**
2. Select **"RabbitMQ"** (if available) or use **CloudAMQP** addon
3. Add the connection URL to your environment variables

### Step 6: Run Database Migrations

After the API service is deployed:

1. Go to API service in Railway dashboard
2. Open the **"Deploy Logs"** tab
3. The migrations should run automatically via the postinstall script
4. If not, you can run them manually in the Railway console:
   ```bash
   npx prisma migrate deploy
   ```

### Step 7: Test Your Deployment

#### Health Checks
Visit these URLs to verify services are running:
- API: `https://mitopia-api-production.up.railway.app/health`
- Signaling: `https://mitopia-signaling-production.up.railway.app/health`
- Billing: `https://mitopia-billing-production.up.railway.app/health`

#### API Endpoints
Test the API:
```bash
# Test user registration
curl -X POST https://mitopia-api-production.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

## 🔧 Troubleshooting

### Common Issues

#### Build Failures
- Check the build logs in Railway dashboard
- Ensure all dependencies are in package.json
- Verify Node.js version compatibility

#### Database Connection Issues
- Verify DATABASE_URL is set correctly
- Check if migrations ran successfully
- Ensure PostgreSQL service is running

#### Service Communication Issues
- Verify internal service URLs are correct
- Check environment variables are set
- Ensure services are in the same Railway project

### Useful Commands

#### View Logs
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# View logs for a specific service
railway logs --service api
```

#### Database Operations
```bash
# Connect to database
railway connect postgres

# Run migrations
railway run npx prisma migrate deploy

# Reset database (careful!)
railway run npx prisma migrate reset
```

## 💰 Cost Optimization

### Free Tier Usage
- **$5 monthly credit** covers development and small production
- **PostgreSQL**: 1GB storage included
- **Redis**: 25MB included
- **Bandwidth**: 100GB included

### Scaling Tips
- Start with free tier for development
- Monitor usage in Railway dashboard
- Scale individual services based on demand
- Use Railway's auto-scaling features

## 🎉 Success!

Once all services are deployed and healthy, your Mitopia backend is ready! You should have:

✅ **6 Microservices** running on Railway  
✅ **PostgreSQL Database** with proper schema  
✅ **Redis Cache** for session management  
✅ **Environment Variables** configured  
✅ **Health Checks** passing  
✅ **API Endpoints** responding  

## 🔗 Next Steps

1. **Update Frontend**: Add Railway service URLs to your Netlify environment variables
2. **Set up Monitoring**: Configure alerts and monitoring
3. **Custom Domains**: Add custom domains for production
4. **SSL Certificates**: Railway provides automatic HTTPS
5. **CI/CD**: Set up automatic deployments on git push

Your Mitopia backend is now live and ready to serve users! 🚀
