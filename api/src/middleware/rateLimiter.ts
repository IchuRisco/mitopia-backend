import { Request, Response, NextFunction } from 'express';
import { redis } from '../index';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}

const defaultOptions: RateLimitOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  keyGenerator: (req) => req.ip || 'unknown',
  skipSuccessfulRequests: false
};

export const createRateLimiter = (options: Partial<RateLimitOptions> = {}) => {
  const config = { ...defaultOptions, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = `rate_limit:${config.keyGenerator!(req)}`;
      const window = Math.floor(Date.now() / config.windowMs);
      const redisKey = `${key}:${window}`;

      // Get current count
      const current = await redis.get(redisKey);
      const count = current ? parseInt(current) : 0;

      if (count >= config.maxRequests) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later'
          }
        });
      }

      // Increment counter
      const pipeline = redis.multi();
      pipeline.incr(redisKey);
      pipeline.expire(redisKey, Math.ceil(config.windowMs / 1000));
      await pipeline.exec();

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': (config.maxRequests - count - 1).toString(),
        'X-RateLimit-Reset': new Date(
          (window + 1) * config.windowMs
        ).toISOString()
      });

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // If Redis is down, allow the request to proceed
      next();
    }
  };
};

// Default rate limiter
export const rateLimiter = createRateLimiter();

// Stricter rate limiter for auth endpoints
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  keyGenerator: (req) => {
    // Use email/phone if provided, otherwise IP
    const body = req.body;
    return body?.email || body?.phone || req.ip || 'unknown';
  }
});

// More lenient rate limiter for meeting operations
export const meetingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 requests per minute
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    const user = (req as any).user;
    return user?.id || req.ip || 'unknown';
  }
});
