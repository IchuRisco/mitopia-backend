// Shared types for Mitopia Signaling service
// This replaces the workspace dependency to fix Render deployment

export interface SignalingMessage {
  type: SignalingMessageType;
  roomId: string;
  userId: string;
  data?: any;
  timestamp: Date;
}

export enum SignalingMessageType {
  OFFER = 'offer',
  ANSWER = 'answer',
  ICE_CANDIDATE = 'ice-candidate',
  JOIN_ROOM = 'join-room',
  LEAVE_ROOM = 'leave-room',
  USER_JOINED = 'user-joined',
  USER_LEFT = 'user-left',
  ROOM_FULL = 'room-full',
  ROOM_NOT_FOUND = 'room-not-found',
  ERROR = 'error'
}

export interface RoomState {
  id: string;
  participants: Map<string, ParticipantInfo>;
  createdAt: Date;
  lastActivity: Date;
  maxParticipants: number;
  isActive: boolean;
}

export interface ParticipantInfo {
  id: string;
  name: string;
  socketId: string;
  joinedAt: Date;
  isHost: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
}

export interface JoinRoomData {
  roomId: string;
  userId: string;
  userName: string;
  isHost?: boolean;
}

export interface LeaveRoomData {
  roomId: string;
  userId: string;
}

export interface WebRTCOffer {
  sdp: string;
  type: 'offer';
}

export interface WebRTCAnswer {
  sdp: string;
  type: 'answer';
}

export interface ICECandidate {
  candidate: string;
  sdpMLineIndex: number;
  sdpMid: string;
}

export interface MediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: Date;
  type: 'text' | 'system';
}

// Utility functions
export const createSignalingMessage = (
  type: SignalingMessageType,
  roomId: string,
  userId: string,
  data?: any
): SignalingMessage => ({
  type,
  roomId,
  userId,
  data,
  timestamp: new Date()
});

export const createParticipantInfo = (
  id: string,
  name: string,
  socketId: string,
  isHost: boolean = false
): ParticipantInfo => ({
  id,
  name,
  socketId,
  joinedAt: new Date(),
  isHost,
  isMuted: false,
  isVideoEnabled: true,
  isScreenSharing: false
});

export const createRoomState = (
  id: string,
  maxParticipants: number = 50
): RoomState => ({
  id,
  participants: new Map(),
  createdAt: new Date(),
  lastActivity: new Date(),
  maxParticipants,
  isActive: true
});

// Validation functions
export const isValidRoomId = (roomId: string): boolean => {
  return typeof roomId === 'string' && roomId.length >= 4 && roomId.length <= 20;
};

export const isValidUserId = (userId: string): boolean => {
  return typeof userId === 'string' && userId.length > 0;
};

export const isValidSocketId = (socketId: string): boolean => {
  return typeof socketId === 'string' && socketId.length > 0;
};

// Error types
export class SignalingError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SignalingError';
  }
}

// Constants
export const MAX_ROOM_PARTICIPANTS = 50;
export const ROOM_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const PARTICIPANT_TIMEOUT = 30 * 1000; // 30 seconds
export const HEARTBEAT_INTERVAL = 25 * 1000; // 25 seconds
