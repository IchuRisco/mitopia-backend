#!/bin/bash

# 🚀 Mitopia Backend - Railway Deployment Script
# This script helps you deploy Mitopia backend to Railway.app

set -e

echo "🚀 Mitopia Backend - Railway Deployment Helper"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}⚠️  Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
    echo -e "${GREEN}✅ Railway CLI installed successfully${NC}"
fi

echo -e "${BLUE}📋 Pre-deployment Checklist:${NC}"
echo "1. ✅ Railway account created at railway.app"
echo "2. ✅ GitHub repository: IchuRisco/mitopia-backend"
echo "3. ✅ API keys ready (OpenAI, Stripe)"
echo ""

read -p "Have you completed the checklist above? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Please complete the checklist first${NC}"
    exit 1
fi

echo -e "${BLUE}🔐 Logging into Railway...${NC}"
railway login

echo -e "${BLUE}📁 Creating Railway project...${NC}"
railway project create mitopia-backend

echo -e "${BLUE}🔗 Linking to GitHub repository...${NC}"
railway link

echo -e "${GREEN}✅ Railway project created successfully!${NC}"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "1. Go to your Railway dashboard: https://railway.app/dashboard"
echo "2. Add PostgreSQL database service"
echo "3. Add Redis database service"
echo "4. Deploy each microservice:"
echo "   - API Service (root directory: api)"
echo "   - Signaling Service (root directory: signaling)"
echo "   - Billing Service (root directory: billing)"
echo "   - STT Service (root directory: stt)"
echo "   - Translation Service (root directory: translation)"
echo "   - Notes Service (root directory: notes)"
echo ""
echo -e "${BLUE}📋 Environment Variables:${NC}"
echo "Copy environment variables from: railway-env-template.txt"
echo ""
echo -e "${BLUE}📖 Full Guide:${NC}"
echo "Read the complete deployment guide: RAILWAY_DEPLOYMENT_GUIDE.md"
echo ""
echo -e "${GREEN}🎉 Railway project setup complete!${NC}"
echo "Continue with the deployment guide to finish setup."
