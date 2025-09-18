import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import axios from 'axios';
import { SignalingMessage, SignalingMessageType } from '@talkflow/shared';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 8080;

// Initialize Redis for storing room state
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: 'connected',
        socketio: 'running'
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

// Types for room management
interface RoomParticipant {
  socketId: string;
  userId?: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
}

interface Room {
  meetingId: string;
  participants: { [socketId: string]: RoomParticipant };
  createdAt: string;
}

// Helper functions
const getRoomKey = (meetingId: string) => `room:${meetingId}`;
const getUserRoomsKey = (userId: string) => `user_rooms:${userId}`;

const getRoom = async (meetingId: string): Promise<Room | null> => {
  try {
    const roomData = await redis.get(getRoomKey(meetingId));
    return roomData ? JSON.parse(roomData) : null;
  } catch (error) {
    console.error('Error getting room:', error);
    return null;
  }
};

const saveRoom = async (meetingId: string, room: Room): Promise<void> => {
  try {
    await redis.setex(getRoomKey(meetingId), 3600, JSON.stringify(room)); // 1 hour TTL
  } catch (error) {
    console.error('Error saving room:', error);
  }
};

const removeParticipantFromRoom = async (meetingId: string, socketId: string): Promise<void> => {
  try {
    const room = await getRoom(meetingId);
    if (room && room.participants[socketId]) {
      delete room.participants[socketId];
      
      // If no participants left, remove the room
      if (Object.keys(room.participants).length === 0) {
        await redis.del(getRoomKey(meetingId));
      } else {
        await saveRoom(meetingId, room);
      }
    }
  } catch (error) {
    console.error('Error removing participant from room:', error);
  }
};

// Verify meeting exists via API
const verifyMeeting = async (meetingId: string): Promise<boolean> => {
  try {
    const apiUrl = process.env.API_SERVICE_URL || 'http://localhost:8000';
    const response = await axios.get(`${apiUrl}/api/v1/meetings/${meetingId}`, {
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    console.error('Error verifying meeting:', error);
    return false;
  }
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join meeting room
  socket.on('join_meeting', async (data: {
    meetingId: string;
    userId?: string;
    name: string;
    isHost?: boolean;
  }) => {
    try {
      const { meetingId, userId, name, isHost = false } = data;

      // Verify meeting exists
      const meetingExists = await verifyMeeting(meetingId);
      if (!meetingExists) {
        socket.emit('error', {
          code: 'MEETING_NOT_FOUND',
          message: 'Meeting not found'
        });
        return;
      }

      // Join the socket room
      await socket.join(meetingId);

      // Get or create room data
      let room = await getRoom(meetingId);
      if (!room) {
        room = {
          meetingId,
          participants: {},
          createdAt: new Date().toISOString()
        };
      }

      // Add participant to room
      const participant: RoomParticipant = {
        socketId: socket.id,
        userId,
        name,
        isHost,
        joinedAt: new Date().toISOString()
      };

      room.participants[socket.id] = participant;
      await saveRoom(meetingId, room);

      // Store user's current room
      if (userId) {
        await redis.setex(getUserRoomsKey(userId), 3600, meetingId);
      }

      // Notify others in the room
      socket.to(meetingId).emit('participant_joined', {
        participant: {
          socketId: socket.id,
          userId,
          name,
          isHost
        },
        totalParticipants: Object.keys(room.participants).length
      });

      // Send current participants to the new user
      const otherParticipants = Object.values(room.participants)
        .filter(p => p.socketId !== socket.id)
        .map(p => ({
          socketId: p.socketId,
          userId: p.userId,
          name: p.name,
          isHost: p.isHost
        }));

      socket.emit('joined_meeting', {
        meetingId,
        participants: otherParticipants,
        totalParticipants: Object.keys(room.participants).length
      });

      console.log(`User ${name} (${socket.id}) joined meeting ${meetingId}`);

    } catch (error) {
      console.error('Error joining meeting:', error);
      socket.emit('error', {
        code: 'JOIN_ERROR',
        message: 'Failed to join meeting'
      });
    }
  });

  // WebRTC signaling - offer
  socket.on('offer', (data: {
    meetingId: string;
    targetSocketId: string;
    offer: RTCSessionDescriptionInit;
  }) => {
    const { meetingId, targetSocketId, offer } = data;
    
    socket.to(targetSocketId).emit('offer', {
      fromSocketId: socket.id,
      offer
    });

    console.log(`Offer sent from ${socket.id} to ${targetSocketId} in meeting ${meetingId}`);
  });

  // WebRTC signaling - answer
  socket.on('answer', (data: {
    meetingId: string;
    targetSocketId: string;
    answer: RTCSessionDescriptionInit;
  }) => {
    const { meetingId, targetSocketId, answer } = data;
    
    socket.to(targetSocketId).emit('answer', {
      fromSocketId: socket.id,
      answer
    });

    console.log(`Answer sent from ${socket.id} to ${targetSocketId} in meeting ${meetingId}`);
  });

  // WebRTC signaling - ICE candidate
  socket.on('ice_candidate', (data: {
    meetingId: string;
    targetSocketId: string;
    candidate: RTCIceCandidateInit;
  }) => {
    const { meetingId, targetSocketId, candidate } = data;
    
    socket.to(targetSocketId).emit('ice_candidate', {
      fromSocketId: socket.id,
      candidate
    });
  });

  // Notes enabled/disabled
  socket.on('notes_enabled', (data: { meetingId: string }) => {
    socket.to(data.meetingId).emit('notes_enabled', {
      fromSocketId: socket.id
    });
  });

  socket.on('notes_disabled', (data: { meetingId: string }) => {
    socket.to(data.meetingId).emit('notes_disabled', {
      fromSocketId: socket.id
    });
  });

  // Chat messages
  socket.on('chat_message', (data: {
    meetingId: string;
    message: string;
    timestamp: string;
  }) => {
    socket.to(data.meetingId).emit('chat_message', {
      fromSocketId: socket.id,
      message: data.message,
      timestamp: data.timestamp
    });
  });

  // Leave meeting
  socket.on('leave_meeting', async (data: { meetingId: string }) => {
    try {
      const { meetingId } = data;
      
      await socket.leave(meetingId);
      await removeParticipantFromRoom(meetingId, socket.id);

      // Notify others
      socket.to(meetingId).emit('participant_left', {
        socketId: socket.id
      });

      console.log(`User ${socket.id} left meeting ${meetingId}`);

    } catch (error) {
      console.error('Error leaving meeting:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log(`Client disconnected: ${socket.id}`);

      // Find all rooms this socket was in and clean up
      const rooms = Array.from(socket.rooms);
      for (const room of rooms) {
        if (room !== socket.id) { // Skip the socket's own room
          await removeParticipantFromRoom(room, socket.id);
          socket.to(room).emit('participant_left', {
            socketId: socket.id
          });
        }
      }

    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// API endpoints for room management
app.get('/rooms/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const room = await getRoom(meetingId);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' }
      });
    }

    const participants = Object.values(room.participants).map(p => ({
      socketId: p.socketId,
      userId: p.userId,
      name: p.name,
      isHost: p.isHost,
      joinedAt: p.joinedAt
    }));

    res.json({
      success: true,
      data: {
        meetingId: room.meetingId,
        participants,
        totalParticipants: participants.length,
        createdAt: room.createdAt
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
});

// Get TURN server configuration
app.get('/turn-config', (req, res) => {
  const turnConfig = {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
      }
    ]
  };

  // Add TURN server if configured
  if (process.env.TURN_SERVER_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    turnConfig.iceServers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD
    });
  }

  res.json({
    success: true,
    data: turnConfig
  });
});

// Initialize services and start server
async function startServer() {
  try {
    // Connect to Redis
    await redis.connect();
    console.log('✅ Connected to Redis');

    server.listen(PORT, () => {
      console.log(`🚀 TalkFlow Signaling server running on port ${PORT}`);
      console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Failed to start signaling server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down signaling server...');
  await redis.quit();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down signaling server...');
  await redis.quit();
  server.close();
  process.exit(0);
});

startServer();
