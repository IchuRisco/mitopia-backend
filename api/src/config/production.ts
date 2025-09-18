/**
 * Mitopia API Production Configuration
 */

export const productionConfig = {
  // Server Configuration
  port: process.env.PORT || 8001,
  host: '0.0.0.0',
  
  // Database Configuration
  database: {
    url: process.env.DATABASE_URL!,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
    },
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL!,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
  },

  // RabbitMQ Configuration
  rabbitmq: {
    url: process.env.RABBITMQ_URL!,
    heartbeat: 60,
    prefetch: 10,
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: 'mitopia.com',
    audience: 'mitopia-users',
  },

  // CORS Configuration
  cors: {
    origin: [
      'https://mitopia.com',
      'https://www.mitopia.com',
      'https://app.mitopia.com',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests, please try again later.',
    },
  },

  // Security
  security: {
    bcryptRounds: 12,
    sessionSecret: process.env.SESSION_SECRET!,
    cookieSecret: process.env.COOKIE_SECRET!,
    trustedProxies: ['127.0.0.1', '::1'],
  },

  // External Services
  services: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000'),
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY!,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      apiVersion: '2023-10-16' as const,
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
  },

  // File Storage
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'aws',
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET || 'mitopia-storage',
    },
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    allowedTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf'],
  },

  // Meeting Configuration
  meeting: {
    maxParticipants: parseInt(process.env.MAX_PARTICIPANTS || '100'),
    maxDuration: parseInt(process.env.MAX_MEETING_DURATION || '28800'), // 8 hours
    defaultDuration: parseInt(process.env.DEFAULT_MEETING_DURATION || '3600'), // 1 hour
    recordingEnabled: process.env.ENABLE_RECORDING === 'true',
    transcriptionEnabled: process.env.ENABLE_TRANSCRIPTION === 'true',
    translationEnabled: process.env.ENABLE_TRANSLATION === 'true',
  },

  // Subscription Plans
  plans: {
    trial: {
      duration: parseInt(process.env.TRIAL_DURATION_DAYS || '30'),
    },
    starter: {
      price: parseFloat(process.env.STARTER_PLAN_PRICE || '9.99'),
      maxParticipants: 10,
      maxMinutes: 500,
      maxTranslations: 100,
    },
    professional: {
      price: parseFloat(process.env.PROFESSIONAL_PLAN_PRICE || '29.99'),
      maxParticipants: 50,
      maxMinutes: 2000,
      maxTranslations: 1000,
    },
    enterprise: {
      price: parseFloat(process.env.ENTERPRISE_PLAN_PRICE || '99.99'),
      maxParticipants: 100,
      maxMinutes: 10000,
      maxTranslations: 10000,
    },
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    transports: [
      {
        type: 'console',
        level: 'info',
      },
      {
        type: 'file',
        filename: 'logs/error.log',
        level: 'error',
      },
      {
        type: 'file',
        filename: 'logs/combined.log',
        level: 'info',
      },
    ],
  },

  // Monitoring
  monitoring: {
    sentry: {
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 0.1,
    },
    metrics: {
      enabled: true,
      port: 9090,
      endpoint: '/metrics',
    },
  },

  // Health Checks
  health: {
    endpoint: '/health',
    checks: {
      database: true,
      redis: true,
      rabbitmq: true,
      external: true,
    },
  },

  // Feature Flags
  features: {
    analytics: process.env.ENABLE_ANALYTICS === 'true',
    customBranding: process.env.ENABLE_CUSTOM_BRANDING === 'true',
    advancedSecurity: process.env.ENABLE_ADVANCED_SECURITY === 'true',
    betaFeatures: process.env.ENABLE_BETA_FEATURES === 'true',
  },
};
