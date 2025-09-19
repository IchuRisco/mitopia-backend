import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { prisma } from '../index';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { createApiResponse } from '../types/shared';

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().optional(),
  phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).optional(),
  name: Joi.string().min(2).max(50).required(),
  password: Joi.string().min(8).required()
}).or('email', 'phone');

const loginSchema = Joi.object({
  email: Joi.string().email().optional(),
  phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).optional(),
  password: Joi.string().required()
}).or('email', 'phone');

const verifySchema = Joi.object({
  email: Joi.string().email().optional(),
  phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).optional(),
  verificationCode: Joi.string().length(6).required()
}).or('email', 'phone');

// Helper function to generate JWT tokens
const generateTokens = (userId: string) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new TalkFlowError('JWT secret not configured', 'SERVER_ERROR', 500);
  }

  const accessToken = jwt.sign({ userId }, jwtSecret, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId }, jwtSecret, { expiresIn: '7d' });

  return { accessToken, refreshToken };
};

// Helper function to generate verification code
const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register
router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      throw new TalkFlowError(error.details[0].message, 'VALIDATION_ERROR', 400);
    }

    const { email, phone, name, password } = value;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          phone ? { phone } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      }
    });

    if (existingUser) {
      throw new TalkFlowError('User already exists with this email or phone', 'USER_EXISTS', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        phone,
        name,
        password: hashedPassword,
        isVerified: false
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Generate verification code (in production, send via email/SMS)
    const verificationCode = generateVerificationCode();
    // TODO: Store verification code in Redis with expiration
    // TODO: Send verification code via email/SMS service

    console.log(`Verification code for ${email || phone}: ${verificationCode}`);
    
    res.status(201).json(createApiResponse(true, {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified
      }
    }, 'User registered successfully. Please verify your email or phone.'));
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      throw new TalkFlowError(error.details[0].message, 'VALIDATION_ERROR', 400);
    }

    const { email, phone, password } = value;

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          phone ? { phone } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      }
    });

    if (!user) {
      throw new TalkFlowError('Invalid credentials', 'INVALID_CREDENTIALS', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new TalkFlowError('Invalid credentials', 'INVALID_CREDENTIALS', 401);
    }

    // Generate tokens
    const tokens = generateTokens(user.id);

    res.json(createSuccessResponse(tokens, 'Login successful'));
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new TalkFlowError('Refresh token required', 'VALIDATION_ERROR', 400);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new TalkFlowError('JWT secret not configured', 'SERVER_ERROR', 500);
    }

    const decoded = jwt.verify(refreshToken, jwtSecret) as { userId: string };
    
    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      throw new TalkFlowError('User not found', 'UNAUTHORIZED', 401);
    }

    // Generate new tokens
    const tokens = generateTokens(user.id);

    res.json(createSuccessResponse(tokens, 'Tokens refreshed successfully'));
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        avatar: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      throw new TalkFlowError('User not found', 'NOT_FOUND', 404);
    }

    res.json(createSuccessResponse(user));
  } catch (error) {
    next(error);
  }
});

// Send verification code
router.post('/send-verification', authRateLimiter, async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      email: Joi.string().email().optional(),
      phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).optional()
    }).or('email', 'phone').validate(req.body);

    if (error) {
      throw new TalkFlowError(error.details[0].message, 'VALIDATION_ERROR', 400);
    }

    const { email, phone } = value;

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          phone ? { phone } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      }
    });

    if (!user) {
      throw new TalkFlowError('User not found', 'NOT_FOUND', 404);
    }

    if (user.isVerified) {
      throw new TalkFlowError('User is already verified', 'ALREADY_VERIFIED', 400);
    }

    // Generate and store verification code
    const verificationCode = generateVerificationCode();
    // TODO: Store in Redis with expiration
    // TODO: Send via email/SMS service

    console.log(`Verification code for ${email || phone}: ${verificationCode}`);

    res.json(createSuccessResponse(null, 'Verification code sent successfully'));
  } catch (error) {
    next(error);
  }
});

// Verify email/phone
router.post('/verify', authRateLimiter, async (req, res, next) => {
  try {
    const { error, value } = verifySchema.validate(req.body);
    if (error) {
      throw new TalkFlowError(error.details[0].message, 'VALIDATION_ERROR', 400);
    }

    const { email, phone, verificationCode } = value;

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          phone ? { phone } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      }
    });

    if (!user) {
      throw new TalkFlowError('User not found', 'NOT_FOUND', 404);
    }

    if (user.isVerified) {
      throw new TalkFlowError('User is already verified', 'ALREADY_VERIFIED', 400);
    }

    // TODO: Verify code from Redis
    // For demo purposes, accept any 6-digit code
    if (!/^\d{6}$/.test(verificationCode)) {
      throw new TalkFlowError('Invalid verification code', 'INVALID_CODE', 400);
    }

    // Update user as verified
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        avatar: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json(createSuccessResponse(updatedUser, 'Verification successful'));
  } catch (error) {
    next(error);
  }
});

export default router;
