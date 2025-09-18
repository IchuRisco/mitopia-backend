// User and Authentication Types
export interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  avatar?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Meeting Types
export interface Meeting {
  id: string;
  title: string;
  description?: string;
  hostId: string;
  participants: Participant[];
  status: MeetingStatus;
  notesEnabled: boolean;
  roomCode: string;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Participant {
  id: string;
  userId: string;
  meetingId: string;
  role: ParticipantRole;
  joinedAt?: Date;
  leftAt?: Date;
  user: User;
}

export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  ENDED = 'ended',
  CANCELLED = 'cancelled'
}

export enum ParticipantRole {
  HOST = 'host',
  PARTICIPANT = 'participant'
}

// Transcription and Notes Types
export interface Transcript {
  id: string;
  meetingId: string;
  speakerId: string;
  content: string;
  timestamp: Date;
  confidence: number;
  createdAt: Date;
}

export interface MeetingNotes {
  id: string;
  meetingId: string;
  themes: Theme[];
  importantNotes: ImportantNote[];
  decisions: Decision[];
  actionItems: ActionItem[];
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Theme {
  id: string;
  title: string;
  description: string;
  transcriptIds: string[];
  confidence: number;
}

export interface ImportantNote {
  id: string;
  content: string;
  transcriptIds: string[];
  importance: number;
}

export interface Decision {
  id: string;
  title: string;
  description: string;
  decidedBy: string;
  transcriptIds: string[];
  timestamp: Date;
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignedTo?: string;
  dueDate?: Date;
  status: ActionItemStatus;
  transcriptIds: string[];
}

export enum ActionItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

// WebRTC and Signaling Types
export interface SignalingMessage {
  type: SignalingMessageType;
  meetingId: string;
  fromUserId: string;
  toUserId?: string;
  data: any;
}

export enum SignalingMessageType {
  JOIN_MEETING = 'join_meeting',
  LEAVE_MEETING = 'leave_meeting',
  OFFER = 'offer',
  ANSWER = 'answer',
  ICE_CANDIDATE = 'ice_candidate',
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_LEFT = 'participant_left',
  NOTES_ENABLED = 'notes_enabled',
  NOTES_DISABLED = 'notes_disabled'
}

export interface RTCConfiguration {
  iceServers: RTCIceServer[];
}

// Export Types
export interface ExportRequest {
  meetingId: string;
  format: ExportFormat;
  destination: ExportDestination;
  options?: ExportOptions;
}

export enum ExportFormat {
  PDF = 'pdf',
  MARKDOWN = 'markdown',
  JSON = 'json'
}

export enum ExportDestination {
  EMAIL = 'email',
  GOOGLE_DOCS = 'google_docs',
  NOTION = 'notion',
  SLACK = 'slack',
  DOWNLOAD = 'download'
}

export interface ExportOptions {
  includeTranscript?: boolean;
  includeTimestamps?: boolean;
  emailRecipients?: string[];
  slackChannel?: string;
  notionPageId?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

// Event Types for Real-time Updates
export interface MeetingEvent {
  type: MeetingEventType;
  meetingId: string;
  data: any;
  timestamp: Date;
}

export enum MeetingEventType {
  MEETING_STARTED = 'meeting_started',
  MEETING_ENDED = 'meeting_ended',
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_LEFT = 'participant_left',
  NOTES_ENABLED = 'notes_enabled',
  NOTES_DISABLED = 'notes_disabled',
  TRANSCRIPT_RECEIVED = 'transcript_received',
  NOTES_GENERATED = 'notes_generated'
}
