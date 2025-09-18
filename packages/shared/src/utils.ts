import { ApiResponse, ApiError } from './types';

// API Response Helpers
export const createSuccessResponse = <T>(data: T, message?: string): ApiResponse<T> => ({
  success: true,
  data,
  message
});

export const createErrorResponse = (error: ApiError): ApiResponse => ({
  success: false,
  error
});

// Validation Helpers
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidMeetingId = (meetingId: string): boolean => {
  return typeof meetingId === 'string' && meetingId.length > 0;
};

// Date Helpers
export const formatDuration = (startTime: Date, endTime: Date): string => {
  const durationMs = endTime.getTime() - startTime.getTime();
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
};

export const formatTimestamp = (date: Date): string => {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Meeting Helpers
export const generateMeetingId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

export const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Text Processing Helpers
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

export const extractKeywords = (text: string): string[] => {
  // Simple keyword extraction - in production, use more sophisticated NLP
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  const wordCount: { [key: string]: number } = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  return Object.entries(wordCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
};

// WebRTC Helpers
export const getDefaultRTCConfiguration = (): RTCConfiguration => ({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
});

// Error Handling
export class TalkFlowError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'TalkFlowError';
  }
}

export const handleAsyncError = <T>(
  promise: Promise<T>
): Promise<[T | null, Error | null]> => {
  return promise
    .then<[T, null]>((data: T) => [data, null])
    .catch<[null, Error]>((error: Error) => [null, error]);
};

// Constants
export const CONSTANTS = {
  MAX_MEETING_DURATION: 4 * 60 * 60 * 1000, // 4 hours in milliseconds
  MAX_PARTICIPANTS: 50,
  TRANSCRIPT_BATCH_SIZE: 100,
  NOTES_GENERATION_DELAY: 5000, // 5 seconds after meeting ends
  DEFAULT_EXPORT_TIMEOUT: 30000, // 30 seconds
  SUPPORTED_AUDIO_FORMATS: ['mp3', 'wav', 'ogg', 'webm'],
  SUPPORTED_VIDEO_FORMATS: ['mp4', 'webm', 'mov']
} as const;
