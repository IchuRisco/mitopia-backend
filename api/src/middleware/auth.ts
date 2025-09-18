import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { TalkFlowError } from '@talkflow/shared';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    phone?: string;
    name: string;
    isVerified: boolean;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new TalkFlowError('Access token required', 'UNAUTHORIZED', 401);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new TalkFlowError('JWT secret not configured', 'SERVER_ERROR', 500);
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    
    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isVerified: true
      }
    });

    if (!user) {
      throw new TalkFlowError('User not found', 'UNAUTHORIZED', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid access token'
        }
      });
    }

    next(error);
  }
};

export const requireVerification = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.isVerified) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'VERIFICATION_REQUIRED',
        message: 'Email or phone verification required'
      }
    });
  }
  
  next();
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        const decoded = jwt.verify(token, jwtSecret) as { userId: string };
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            phone: true,
            name: true,
            isVerified: true
          }
        });

        if (user) {
          req.user = user;
        }
      }
    }
  } catch (error) {
    // Ignore authentication errors for optional auth
  }

  next();
};
