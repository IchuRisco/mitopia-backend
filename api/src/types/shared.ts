// Shared types for Mitopia API service
// This replaces the workspace dependency to fix Render deployment

export interface User {
  id: string;
  email?: string;
  phone?: string;
  password: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  hostId: string;
  roomCode: string;
  status: MeetingStatus;
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  aiNotesEnabled: boolean;
  maxParticipants: number;
  createdAt: Date;
  updatedAt: Date;
}

export enum MeetingStatus {
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED'
}

export interface Participant {
  id: string;
  meetingId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  role: ParticipantRole;
  joinedAt?: Date;
  leftAt?: Date;
  isActive: boolean;
}

export enum ParticipantRole {
  HOST = 'HOST',
  MODERATOR = 'MODERATOR',
  PARTICIPANT = 'PARTICIPANT',
  OBSERVER = 'OBSERVER'
}

export interface Transcript {
  id: string;
  meetingId: string;
  participantId?: string;
  speakerName: string;
  content: string;
  timestamp: Date;
  confidence: number;
  language: string;
}

export interface MeetingNotes {
  id: string;
  meetingId: string;
  summary: string;
  keyPoints: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Theme {
  id: string;
  meetingNotesId: string;
  title: string;
  description: string;
  relevantTranscripts: string[];
}

export interface ImportantNote {
  id: string;
  meetingNotesId: string;
  content: string;
  timestamp: Date;
  priority: Priority;
}

export interface Decision {
  id: string;
  meetingNotesId: string;
  title: string;
  description: string;
  decidedBy: string;
  timestamp: Date;
  status: DecisionStatus;
}

export interface ActionItem {
  id: string;
  meetingNotesId: string;
  title: string;
  description: string;
  assignedTo?: string;
  assignedToEmail?: string;
  assignedToPhone?: string;
  dueDate?: Date;
  status: ActionItemStatus;
  priority: Priority;
  createdAt: Date;
  updatedAt: Date;
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum DecisionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  DEFERRED = 'DEFERRED'
}

export enum ActionItemStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface MeetingInvitation {
  id: string;
  meetingId: string;
  invitedBy: string;
  invitedEmail?: string;
  invitedPhone?: string;
  invitedName?: string;
  status: InvitationStatus;
  sentAt: Date;
  respondedAt?: Date;
  token: string;
  expiresAt: Date;
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED'
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// WebRTC Signaling types
export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join-room' | 'leave-room' | 'user-joined' | 'user-left';
  roomId: string;
  userId: string;
  data?: any;
  timestamp: Date;
}

export interface RoomState {
  id: string;
  participants: Map<string, ParticipantInfo>;
  createdAt: Date;
  lastActivity: Date;
}

export interface ParticipantInfo {
  id: string;
  name: string;
  socketId: string;
  joinedAt: Date;
  isHost: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
}

// Utility types
export type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'isEmailVerified' | 'isPhoneVerified'>;
export type UpdateUserInput = Partial<Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>>;
export type CreateMeetingInput = Omit<Meeting, 'id' | 'roomCode' | 'status' | 'createdAt' | 'updatedAt' | 'startedAt' | 'endedAt'>;
export type UpdateMeetingInput = Partial<Pick<Meeting, 'title' | 'description' | 'scheduledAt' | 'aiNotesEnabled' | 'maxParticipants'>>;

// Validation schemas
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

// Utility functions
export const createApiResponse = <T>(
  success: boolean,
  data?: T,
  message?: string,
  error?: string
): ApiResponse<T> => ({
  success,
  data,
  message,
  error
});

export const createPaginatedResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): PaginatedResponse<T> => ({
  success: true,
  data,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1
  }
});

export const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const isValidEmail = (email: string): boolean => EMAIL_REGEX.test(email);
export const isValidPhone = (phone: string): boolean => PHONE_REGEX.test(phone);

export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Add + if not present and doesn't start with +
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  
  return cleaned;
};

export const maskEmail = (email: string): string => {
  const [username, domain] = email.split('@');
  const maskedUsername = username.length > 2 
    ? `${username[0]}${'*'.repeat(username.length - 2)}${username[username.length - 1]}`
    : `${username[0]}*`;
  return `${maskedUsername}@${domain}`;
};

export const maskPhone = (phone: string): string => {
  if (phone.length < 4) return phone;
  const visibleDigits = 3;
  const masked = '*'.repeat(phone.length - visibleDigits);
  return `${masked}${phone.slice(-visibleDigits)}`;
};
