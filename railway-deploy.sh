#!/bin/bash

# Mitopia Backend - Railway Deployment Script
# This script helps automate the Railway deployment process

echo "🚀 Mitopia Backend - Railway Deployment Helper"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
fi

echo -e "${BLUE}This script will help you deploy Mitopia backend to Railway.${NC}"
echo -e "${BLUE}Make sure you're logged into Railway with: ichurisco@gmail.com${NC}"
echo ""

# Step 1: Login to Railway
echo -e "${PURPLE}Step 1: Railway Login${NC}"
echo "Please log in to Railway when prompted..."
railway login

# Check if login was successful
if ! railway whoami &> /dev/null; then
    echo -e "${RED}❌ Railway login failed. Please try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Successfully logged into Railway${NC}"
echo ""

# Step 2: Create or select project
echo -e "${PURPLE}Step 2: Project Setup${NC}"
echo "Creating or selecting Railway project..."

# Try to link to existing project or create new one
railway project new mitopia-backend 2>/dev/null || railway link

echo -e "${GREEN}✅ Project setup complete${NC}"
echo ""

# Step 3: Deploy services
echo -e "${PURPLE}Step 3: Service Deployment${NC}"
echo "We'll deploy each service individually..."

# Function to deploy a service
deploy_service() {
    local service_name=$1
    local service_dir=$2
    
    echo -e "${BLUE}Deploying $service_name...${NC}"
    
    cd "$service_dir" || exit 1
    
    # Create service if it doesn't exist
    railway service create "$service_name" 2>/dev/null || true
    
    # Link to the service
    railway service link "$service_name"
    
    # Deploy the service
    railway up --detach
    
    cd - > /dev/null
    
    echo -e "${GREEN}✅ $service_name deployed${NC}"
}

# Deploy each service
echo "Deploying API service..."
deploy_service "mitopia-api" "./api"

echo "Deploying Signaling service..."
deploy_service "mitopia-signaling" "./signaling"

echo "Deploying Billing service..."
deploy_service "mitopia-billing" "./billing"

echo "Deploying STT service..."
deploy_service "mitopia-stt" "./stt"

echo "Deploying Translation service..."
deploy_service "mitopia-translation" "./translation"

echo "Deploying Notes service..."
deploy_service "mitopia-notes" "./notes"

echo ""
echo -e "${GREEN}🎉 All services deployed successfully!${NC}"
echo ""

# Step 4: Add databases
echo -e "${PURPLE}Step 4: Database Setup${NC}"
echo "Adding PostgreSQL and Redis..."

# Add PostgreSQL
railway add postgresql

# Add Redis
railway add redis

echo -e "${GREEN}✅ Databases added${NC}"
echo ""

# Step 5: Environment variables setup
echo -e "${PURPLE}Step 5: Environment Variables${NC}"
echo -e "${YELLOW}You need to configure environment variables for each service.${NC}"
echo ""
echo "Required environment variables:"
echo ""
echo -e "${BLUE}For API Service:${NC}"
echo "NODE_ENV=production"
echo "DATABASE_URL=\${{Postgres.DATABASE_URL}}"
echo "REDIS_URL=\${{Redis.REDIS_URL}}"
echo "JWT_SECRET=mitopia_super_secure_jwt_secret_2024"
echo "OPENAI_API_KEY=sk-your-openai-api-key"
echo "STRIPE_SECRET_KEY=sk-your-stripe-secret-key"
echo "FRONTEND_URL=https://mitopia.netlify.app"
echo ""
echo -e "${BLUE}For other services, check DEPLOY_TO_RAILWAY.md${NC}"
echo ""

# Step 6: Get service URLs
echo -e "${PURPLE}Step 6: Service URLs${NC}"
echo "Getting your service URLs..."

# Get project info
railway status

echo ""
echo -e "${GREEN}🎯 Deployment Complete!${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Configure environment variables for each service in Railway dashboard"
echo "2. Add your OpenAI and Stripe API keys"
echo "3. Run database migrations"
echo "4. Test all service health endpoints"
echo "5. Update your frontend with the new API URLs"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "railway logs --service mitopia-api     # View API logs"
echo "railway shell --service mitopia-api   # Access API shell"
echo "railway status                        # Check all services"
echo ""
echo -e "${GREEN}Your Mitopia backend is now live on Railway! 🚀${NC}"
