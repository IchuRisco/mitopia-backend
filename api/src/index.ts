import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import amqp from 'amqplib';

// Import routes
import authRoutes from './routes/auth';
import meetingRoutes from './routes/meetings';
import notesRoutes from './routes/notes';
import exportRoutes from './routes/exports';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Initialize database
export const prisma = new PrismaClient();

// Initialize Redis
export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Initialize RabbitMQ connection
let rabbitmqConnection: amqp.Connection;
let rabbitmqChannel: amqp.Channel;

async function initializeServices() {
  try {
    // Connect to Redis
    await redis.connect();
    console.log('✅ Connected to Redis');

    // Connect to RabbitMQ
    if (process.env.RABBITMQ_URL) {
      rabbitmqConnection = await amqp.connect(process.env.RABBITMQ_URL);
      rabbitmqChannel = await rabbitmqConnection.createChannel();
      
      // Declare queues
      await rabbitmqChannel.assertQueue('transcription_jobs', { durable: true });
      await rabbitmqChannel.assertQueue('notes_processing', { durable: true });
      await rabbitmqChannel.assertQueue('export_jobs', { durable: true });
      
      console.log('✅ Connected to RabbitMQ');
    }

    // Test database connection
    await prisma.$connect();
    console.log('✅ Connected to database');

  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(rateLimiter);

// Health check
app.get('/health', async (req, res) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis
    await redis.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        rabbitmq: rabbitmqChannel ? 'connected' : 'disconnected'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/meetings', meetingRoutes);
app.use('/api/v1/notes', notesRoutes);
app.use('/api/v1/exports', exportRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Error handling middleware
app.use(errorHandler);

// Export RabbitMQ channel for use in other modules
export { rabbitmqChannel };

// Start server
async function startServer() {
  await initializeServices();
  
  app.listen(PORT, () => {
    console.log(`🚀 TalkFlow API server running on port ${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api/v1/docs`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down gracefully...');
  
  await prisma.$disconnect();
  await redis.quit();
  
  if (rabbitmqConnection) {
    await rabbitmqConnection.close();
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down gracefully...');
  
  await prisma.$disconnect();
  await redis.quit();
  
  if (rabbitmqConnection) {
    await rabbitmqConnection.close();
  }
  
  process.exit(0);
});

startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
