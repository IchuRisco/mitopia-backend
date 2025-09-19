#!/bin/bash

# Mitopia Backend - Render Deployment Helper Script
# This script helps automate the Render deployment process

echo "🚀 Mitopia Backend - Render Deployment Helper"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${PURPLE}$1${NC}"
}

print_info() {
    echo -e "${BLUE}$1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Welcome message
echo -e "${CYAN}"
cat << "EOF"
   __  __ _ _             _       
  |  \/  (_) |           (_)      
  | \  / |_| |_ ___  _ __  _  __ _ 
  | |\/| | | __/ _ \| '_ \| |/ _` |
  | |  | | | || (_) | |_) | | (_| |
  |_|  |_|_|\__\___/| .__/|_|\__,_|
                    | |            
                    |_|            
EOF
echo -e "${NC}"

print_info "This script will guide you through deploying Mitopia backend to Render.com"
print_info "Make sure you have a Render account at https://render.com"
echo ""

# Step 1: Check prerequisites
print_step "Step 1: Checking Prerequisites"

# Check if git is available
if ! command -v git &> /dev/null; then
    print_error "Git is not installed. Please install Git first."
    exit 1
fi

# Check if curl is available
if ! command -v curl &> /dev/null; then
    print_error "curl is not installed. Please install curl first."
    exit 1
fi

print_success "Prerequisites check passed"
echo ""

# Step 2: Repository check
print_step "Step 2: Repository Information"

# Get current repository info
if git remote -v | grep -q "mitopia-backend"; then
    REPO_URL=$(git remote get-url origin)
    print_success "Repository detected: $REPO_URL"
else
    print_warning "This doesn't appear to be the mitopia-backend repository"
    echo "Please make sure you're in the correct directory"
fi

# Check if we're on the main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_warning "You're on branch '$CURRENT_BRANCH', consider switching to 'main'"
fi

echo ""

# Step 3: API Keys setup
print_step "Step 3: API Keys Setup"

print_info "You'll need the following API keys for deployment:"
echo ""
echo "1. OpenAI API Key (for AI features)"
echo "   - Go to: https://openai.com/api"
echo "   - Create account and generate API key"
echo "   - Key format: sk-..."
echo ""
echo "2. Stripe API Keys (for payments)"
echo "   - Go to: https://stripe.com"
echo "   - Get Secret Key and Webhook Secret"
echo "   - Key format: sk_live_... or sk_test_..."
echo ""

read -p "Do you have your API keys ready? (y/n): " api_keys_ready
if [ "$api_keys_ready" != "y" ]; then
    print_warning "Please get your API keys first, then run this script again"
    exit 0
fi

print_success "API keys confirmed"
echo ""

# Step 4: Deployment options
print_step "Step 4: Deployment Options"

echo "Choose your deployment method:"
echo ""
echo "1. Blueprint Deployment (Recommended - uses render.yaml)"
echo "   - Automatic deployment of all services"
echo "   - Infrastructure as code"
echo "   - Easier to manage"
echo ""
echo "2. Manual Deployment (Step-by-step)"
echo "   - Deploy each service individually"
echo "   - More control over the process"
echo "   - Good for learning"
echo ""

read -p "Choose deployment method (1 or 2): " deployment_method

if [ "$deployment_method" = "1" ]; then
    # Blueprint deployment
    print_step "Blueprint Deployment Selected"
    echo ""
    print_info "Follow these steps in your browser:"
    echo ""
    echo "1. Go to: https://dashboard.render.com"
    echo "2. Click 'New +' → 'Blueprint'"
    echo "3. Connect your GitHub account if needed"
    echo "4. Select repository: IchuRisco/mitopia-backend"
    echo "5. Render will detect the render.yaml file"
    echo "6. Click 'Apply' to deploy all services"
    echo ""
    print_warning "After deployment, you'll need to add API keys manually:"
    echo "- Go to each service → Settings → Environment Variables"
    echo "- Add OPENAI_API_KEY to AI services"
    echo "- Add STRIPE_SECRET_KEY to billing service"
    echo ""

elif [ "$deployment_method" = "2" ]; then
    # Manual deployment
    print_step "Manual Deployment Selected"
    echo ""
    print_info "Follow the detailed guide in RENDER_DEPLOYMENT.md"
    echo ""
    print_info "Quick summary:"
    echo "1. Create PostgreSQL database"
    echo "2. Create Redis cache"
    echo "3. Deploy API service"
    echo "4. Deploy Signaling service"
    echo "5. Deploy Billing service"
    echo "6. Deploy STT service"
    echo "7. Deploy Translation service"
    echo "8. Deploy Notes service"
    echo ""
    
else
    print_error "Invalid selection. Please run the script again."
    exit 1
fi

# Step 5: Environment variables helper
print_step "Step 5: Environment Variables Reference"

echo ""
print_info "Environment variables template saved in: render-env-vars.txt"
print_info "Use this file to copy-paste variables into Render dashboard"
echo ""

# Step 6: Testing
print_step "Step 6: Testing Your Deployment"

echo ""
print_info "After deployment, test these health check URLs:"
echo ""
echo "API Service:"
echo "curl https://mitopia-api.onrender.com/health"
echo ""
echo "Signaling Service:"
echo "curl https://mitopia-signaling.onrender.com/health"
echo ""
echo "Billing Service:"
echo "curl https://mitopia-billing.onrender.com/health"
echo ""
echo "STT Service:"
echo "curl https://mitopia-stt.onrender.com/health"
echo ""
echo "Translation Service:"
echo "curl https://mitopia-translation.onrender.com/health"
echo ""
echo "Notes Service:"
echo "curl https://mitopia-notes.onrender.com/health"
echo ""

# Step 7: Frontend integration
print_step "Step 7: Frontend Integration"

echo ""
print_info "Update your Netlify frontend with these environment variables:"
echo ""
echo "VITE_API_URL=https://mitopia-api.onrender.com"
echo "VITE_SIGNALING_URL=https://mitopia-signaling.onrender.com"
echo "VITE_TRANSLATION_URL=https://mitopia-translation.onrender.com"
echo "VITE_BILLING_URL=https://mitopia-billing.onrender.com"
echo ""

# Step 8: Monitoring and maintenance
print_step "Step 8: Monitoring & Maintenance"

echo ""
print_info "Render provides built-in monitoring:"
echo "- Service logs and metrics"
echo "- Automatic health checks"
echo "- Email notifications for issues"
echo "- Auto-deploy from GitHub"
echo ""

# Step 9: Troubleshooting
print_step "Step 9: Troubleshooting Resources"

echo ""
print_info "If you encounter issues:"
echo ""
echo "1. Check service logs in Render dashboard"
echo "2. Verify environment variables are set correctly"
echo "3. Ensure API keys are valid"
echo "4. Check RENDER_DEPLOYMENT.md for detailed troubleshooting"
echo ""
echo "Common issues:"
echo "- Build failures: Check package.json scripts"
echo "- Service won't start: Verify start command"
echo "- Database connection: Use internal database URLs"
echo ""

# Final success message
echo ""
print_success "Deployment guide complete!"
echo ""
print_info "Next steps:"
echo "1. Go to https://dashboard.render.com"
echo "2. Follow the deployment method you selected"
echo "3. Add your API keys to the services"
echo "4. Test all health check endpoints"
echo "5. Update your frontend environment variables"
echo ""

print_step "🎉 Your Mitopia backend will be live on Render!"
echo ""
print_info "Render advantages:"
echo "✅ 750 hours/month free (24/7 operation)"
echo "✅ Automatic SSL certificates"
echo "✅ Easy GitHub integration"
echo "✅ Built-in databases"
echo "✅ Simple scaling"
echo ""

print_info "Support resources:"
echo "📚 Render Docs: https://render.com/docs"
echo "💬 Community: https://community.render.com"
echo "📧 Support: Available for paid plans"
echo ""

print_success "Happy deploying! 🚀"
