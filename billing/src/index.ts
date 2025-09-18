/**
 * MindMeet Billing Service
 * Handles subscriptions, payments, and billing management
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import Redis from 'redis';
import Bull from 'bull';
import winston from 'winston';
import dotenv from 'dotenv';
import { z } from 'zod';
import { addDays, addMonths, addYears, isAfter, isBefore } from 'date-fns';

// Load environment variables
dotenv.config();

// Initialize services
const app = express();
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
const redis = Redis.createClient({ url: process.env.REDIS_URL });
const billingQueue = new Bull('billing queue', process.env.REDIS_URL!);

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Validation schemas
const CreateSubscriptionSchema = z.object({
  userId: z.string().cuid(),
  planId: z.string().cuid(),
  paymentMethodId: z.string(),
  billingAddress: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    country: z.string()
  })
});

const UpdatePaymentMethodSchema = z.object({
  paymentMethodId: z.string(),
  isDefault: z.boolean().optional()
});

const CancelSubscriptionSchema = z.object({
  reason: z.string().optional(),
  feedback: z.string().optional(),
  cancelAtPeriodEnd: z.boolean().default(true)
});

// Types
interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'MONTHLY' | 'YEARLY';
  maxParticipants: number;
  maxMeetingDuration: number;
  maxMonthlyMinutes: number;
  maxTranslations: number;
  hasAITranscription: boolean;
  hasLanguageTranslation: boolean;
  hasAdvancedAnalytics: boolean;
  hasCustomBranding: boolean;
  hasPrioritySupport: boolean;
}

// Subscription plans
const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 9.99,
    currency: 'USD',
    interval: 'MONTHLY',
    maxParticipants: 10,
    maxMeetingDuration: 60,
    maxMonthlyMinutes: 500,
    maxTranslations: 100,
    hasAITranscription: true,
    hasLanguageTranslation: false,
    hasAdvancedAnalytics: false,
    hasCustomBranding: false,
    hasPrioritySupport: false
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 29.99,
    currency: 'USD',
    interval: 'MONTHLY',
    maxParticipants: 50,
    maxMeetingDuration: 180,
    maxMonthlyMinutes: 2000,
    maxTranslations: 1000,
    hasAITranscription: true,
    hasLanguageTranslation: true,
    hasAdvancedAnalytics: true,
    hasCustomBranding: false,
    hasPrioritySupport: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99.99,
    currency: 'USD',
    interval: 'MONTHLY',
    maxParticipants: 100,
    maxMeetingDuration: 480,
    maxMonthlyMinutes: 10000,
    maxTranslations: 10000,
    hasAITranscription: true,
    hasLanguageTranslation: true,
    hasAdvancedAnalytics: true,
    hasCustomBranding: true,
    hasPrioritySupport: true
  }
];

// Utility functions
const calculateTrialEndDate = (): Date => {
  return addDays(new Date(), 30);
};

const calculateNextBillingDate = (interval: 'MONTHLY' | 'YEARLY'): Date => {
  const now = new Date();
  return interval === 'MONTHLY' ? addMonths(now, 1) : addYears(now, 1);
};

const isTrialActive = (trialEndsAt: Date | null): boolean => {
  if (!trialEndsAt) return false;
  return isAfter(trialEndsAt, new Date());
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'billing', timestamp: new Date().toISOString() });
});

// Get subscription plans
app.get('/plans', async (req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' }
    });
    
    res.json({ plans });
  } catch (error) {
    logger.error('Failed to fetch subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

// Start free trial
app.post('/trial/start', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Check if user already has a trial or subscription
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });
    
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (existingUser.trialStartedAt) {
      return res.status(400).json({ error: 'Trial already used' });
    }
    
    if (existingUser.subscription) {
      return res.status(400).json({ error: 'User already has an active subscription' });
    }
    
    // Start trial
    const trialEndsAt = calculateTrialEndDate();
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        trialStartedAt: new Date(),
        trialEndsAt,
        isTrialActive: true
      }
    });
    
    // Schedule trial expiration reminder
    await billingQueue.add('trial-expiration-reminder', 
      { userId }, 
      { delay: 25 * 24 * 60 * 60 * 1000 } // 25 days
    );
    
    logger.info(`Trial started for user ${userId}`);
    res.json({ 
      message: 'Trial started successfully', 
      trialEndsAt,
      daysRemaining: 30
    });
    
  } catch (error) {
    logger.error('Failed to start trial:', error);
    res.status(500).json({ error: 'Failed to start trial' });
  }
});

// Create subscription
app.post('/subscriptions', async (req, res) => {
  try {
    const validatedData = CreateSubscriptionSchema.parse(req.body);
    const { userId, planId, paymentMethodId, billingAddress } = validatedData;
    
    // Get user and plan
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    
    if (!user || !plan) {
      return res.status(404).json({ error: 'User or plan not found' });
    }
    
    // Create Stripe customer if doesn't exist
    let stripeCustomerId = user.subscription?.stripeCustomerId;
    
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: user.name,
        phone: user.phone || undefined,
        address: billingAddress
      });
      stripeCustomerId = customer.id;
    }
    
    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: stripeCustomerId
    });
    
    // Set as default payment method
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });
    
    // Create Stripe subscription
    const stripeSubscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        price_data: {
          currency: plan.currency.toLowerCase(),
          product_data: {
            name: plan.name,
            description: `MindMeet ${plan.name} Plan`
          },
          unit_amount: Math.round(plan.price * 100), // Convert to cents
          recurring: {
            interval: plan.interval.toLowerCase() as 'month' | 'year'
          }
        }
      }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent']
    });
    
    // Create subscription in database
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId,
        status: 'ACTIVE',
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId
      }
    });
    
    // Update user trial status
    await prisma.user.update({
      where: { id: userId },
      data: {
        isTrialActive: false,
        subscriptionId: subscription.id
      }
    });
    
    // Store payment method
    await prisma.paymentMethod.create({
      data: {
        userId,
        type: 'CARD',
        isDefault: true,
        stripePaymentMethodId: paymentMethodId
      }
    });
    
    logger.info(`Subscription created for user ${userId}, plan ${planId}`);
    
    res.json({
      subscription,
      clientSecret: (stripeSubscription.latest_invoice as any)?.payment_intent?.client_secret
    });
    
  } catch (error) {
    logger.error('Failed to create subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// Get user subscription
app.get('/users/:userId/subscription', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: {
          include: {
            plan: true
          }
        },
        paymentMethods: true,
        usageAnalytics: {
          where: {
            date: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
          }
        }
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate usage statistics
    const currentUsage = user.usageAnalytics.reduce((acc, usage) => ({
      meetingMinutes: acc.meetingMinutes + usage.meetingMinutes,
      participantCount: acc.participantCount + usage.participantCount,
      translationCount: acc.translationCount + usage.translationCount
    }), { meetingMinutes: 0, participantCount: 0, translationCount: 0 });
    
    res.json({
      subscription: user.subscription,
      paymentMethods: user.paymentMethods,
      trial: {
        isActive: user.isTrialActive,
        startedAt: user.trialStartedAt,
        endsAt: user.trialEndsAt,
        daysRemaining: user.trialEndsAt ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0
      },
      usage: currentUsage
    });
    
  } catch (error) {
    logger.error('Failed to fetch user subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Update payment method
app.put('/users/:userId/payment-methods/:paymentMethodId', async (req, res) => {
  try {
    const { userId, paymentMethodId } = req.params;
    const validatedData = UpdatePaymentMethodSchema.parse(req.body);
    
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, userId }
    });
    
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    
    // Update default payment method
    if (validatedData.isDefault) {
      // Remove default from other payment methods
      await prisma.paymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false }
      });
      
      // Set new default
      await prisma.paymentMethod.update({
        where: { id: paymentMethodId },
        data: { isDefault: true }
      });
      
      // Update Stripe customer default payment method
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      
      if (user?.subscription?.stripeCustomerId && paymentMethod.stripePaymentMethodId) {
        await stripe.customers.update(user.subscription.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethod.stripePaymentMethodId
          }
        });
      }
    }
    
    res.json({ message: 'Payment method updated successfully' });
    
  } catch (error) {
    logger.error('Failed to update payment method:', error);
    res.status(500).json({ error: 'Failed to update payment method' });
  }
});

// Cancel subscription
app.post('/users/:userId/subscription/cancel', async (req, res) => {
  try {
    const { userId } = req.params;
    const validatedData = CancelSubscriptionSchema.parse(req.body);
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });
    
    if (!user?.subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }
    
    // Cancel Stripe subscription
    if (user.subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(user.subscription.stripeSubscriptionId, {
        cancel_at_period_end: validatedData.cancelAtPeriodEnd
      });
    }
    
    // Update subscription in database
    await prisma.subscription.update({
      where: { id: user.subscription.id },
      data: {
        cancelAtPeriodEnd: validatedData.cancelAtPeriodEnd,
        canceledAt: validatedData.cancelAtPeriodEnd ? null : new Date(),
        status: validatedData.cancelAtPeriodEnd ? 'ACTIVE' : 'CANCELED'
      }
    });
    
    logger.info(`Subscription canceled for user ${userId}`);
    
    res.json({ 
      message: validatedData.cancelAtPeriodEnd 
        ? 'Subscription will be canceled at the end of the current period' 
        : 'Subscription canceled immediately'
    });
    
  } catch (error) {
    logger.error('Failed to cancel subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Stripe webhook handler
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    return res.status(400).send('Webhook signature verification failed');
  }
  
  try {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
        
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    logger.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Webhook handlers
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription as string }
  });
  
  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'ACTIVE' }
    });
    
    logger.info(`Payment succeeded for subscription ${subscription.id}`);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription as string }
  });
  
  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE' }
    });
    
    // Schedule retry notification
    await billingQueue.add('payment-failed-notification', {
      subscriptionId: subscription.id,
      userId: subscription.userId
    });
    
    logger.info(`Payment failed for subscription ${subscription.id}`);
  }
}

async function handleSubscriptionUpdated(stripeSubscription: Stripe.Subscription) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSubscription.id }
  });
  
  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: stripeSubscription.status.toUpperCase() as any,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
      }
    });
    
    logger.info(`Subscription updated: ${subscription.id}`);
  }
}

async function handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSubscription.id }
  });
  
  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date()
      }
    });
    
    logger.info(`Subscription deleted: ${subscription.id}`);
  }
}

// Background job processing
billingQueue.process('trial-expiration-reminder', async (job) => {
  const { userId } = job.data;
  
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  if (user && user.isTrialActive) {
    // Send trial expiration reminder email
    logger.info(`Sending trial expiration reminder to user ${userId}`);
    // TODO: Implement email sending
  }
});

billingQueue.process('payment-failed-notification', async (job) => {
  const { subscriptionId, userId } = job.data;
  
  // Send payment failed notification
  logger.info(`Sending payment failed notification for subscription ${subscriptionId}`);
  // TODO: Implement email/SMS notification
});

// Initialize services
async function initializeServices() {
  try {
    await redis.connect();
    logger.info('Connected to Redis');
    
    await prisma.$connect();
    logger.info('Connected to database');
    
    // Create default subscription plans if they don't exist
    for (const planData of SUBSCRIPTION_PLANS) {
      await prisma.subscriptionPlan.upsert({
        where: { name: planData.name },
        update: planData,
        create: planData
      });
    }
    
    logger.info('Subscription plans initialized');
    
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start server
const PORT = process.env.PORT || 8005;

app.listen(PORT, async () => {
  await initializeServices();
  logger.info(`MindMeet Billing Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  await redis.disconnect();
  process.exit(0);
});

export default app;
