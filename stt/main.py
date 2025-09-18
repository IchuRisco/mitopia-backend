import os
import asyncio
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any
import tempfile
import io

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import aiofiles
import pika
import redis.asyncio as redis
from faster_whisper import WhisperModel
import numpy as np
from pydub import AudioSegment
import webrtcvad

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TalkFlow Speech-to-Text Service",
    description="Real-time speech transcription service using Faster Whisper",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
whisper_model: Optional[WhisperModel] = None
redis_client: Optional[redis.Redis] = None
rabbitmq_connection: Optional[pika.BlockingConnection] = None
rabbitmq_channel: Optional[pika.channel.Channel] = None

# Configuration
MODEL_SIZE = os.getenv("MODEL_SIZE", "base")
DEVICE = os.getenv("DEVICE", "cpu")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://localhost:5672")

class TranscriptionJob:
    def __init__(self, meeting_id: str, audio_data: bytes, speaker_id: str, timestamp: str):
        self.meeting_id = meeting_id
        self.audio_data = audio_data
        self.speaker_id = speaker_id
        self.timestamp = timestamp

async def initialize_services():
    """Initialize all required services"""
    global whisper_model, redis_client, rabbitmq_connection, rabbitmq_channel
    
    try:
        # Initialize Whisper model
        logger.info(f"Loading Whisper model: {MODEL_SIZE}")
        whisper_model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type="int8")
        logger.info("✅ Whisper model loaded successfully")
        
        # Initialize Redis
        redis_client = redis.from_url(REDIS_URL)
        await redis_client.ping()
        logger.info("✅ Connected to Redis")
        
        # Initialize RabbitMQ
        if RABBITMQ_URL:
            connection_params = pika.URLParameters(RABBITMQ_URL)
            rabbitmq_connection = pika.BlockingConnection(connection_params)
            rabbitmq_channel = rabbitmq_connection.channel()
            
            # Declare queues
            rabbitmq_channel.queue_declare(queue='transcription_jobs', durable=True)
            rabbitmq_channel.queue_declare(queue='transcription_results', durable=True)
            
            logger.info("✅ Connected to RabbitMQ")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        raise

def preprocess_audio(audio_data: bytes) -> tuple[np.ndarray, int]:
    """Preprocess audio data for transcription"""
    try:
        # Load audio using pydub
        audio = AudioSegment.from_file(io.BytesIO(audio_data))
        
        # Convert to mono and resample to 16kHz
        audio = audio.set_channels(1).set_frame_rate(16000)
        
        # Convert to numpy array
        audio_np = np.array(audio.get_array_of_samples(), dtype=np.float32)
        audio_np = audio_np / np.iinfo(np.int16).max  # Normalize to [-1, 1]
        
        return audio_np, 16000
        
    except Exception as e:
        logger.error(f"Error preprocessing audio: {e}")
        raise HTTPException(status_code=400, detail="Invalid audio format")

def detect_voice_activity(audio_np: np.ndarray, sample_rate: int) -> bool:
    """Detect if audio contains speech using WebRTC VAD"""
    try:
        vad = webrtcvad.Vad(2)  # Aggressiveness level 2
        
        # Convert to 16-bit PCM
        audio_int16 = (audio_np * 32767).astype(np.int16)
        audio_bytes = audio_int16.tobytes()
        
        # VAD requires specific frame sizes (10, 20, or 30ms)
        frame_duration = 30  # ms
        frame_size = int(sample_rate * frame_duration / 1000)
        
        # Check frames for voice activity
        voice_frames = 0
        total_frames = 0
        
        for i in range(0, len(audio_int16) - frame_size, frame_size):
            frame = audio_int16[i:i + frame_size]
            if len(frame) == frame_size:
                is_speech = vad.is_speech(frame.tobytes(), sample_rate)
                if is_speech:
                    voice_frames += 1
                total_frames += 1
        
        # Return True if more than 30% of frames contain speech
        return total_frames > 0 and (voice_frames / total_frames) > 0.3
        
    except Exception as e:
        logger.warning(f"VAD detection failed: {e}")
        return True  # Assume speech if VAD fails

async def transcribe_audio(audio_np: np.ndarray, language: str = "en") -> Dict[str, Any]:
    """Transcribe audio using Faster Whisper"""
    try:
        if whisper_model is None:
            raise HTTPException(status_code=500, detail="Whisper model not initialized")
        
        # Transcribe audio
        segments, info = whisper_model.transcribe(
            audio_np,
            language=language,
            beam_size=5,
            best_of=5,
            temperature=0.0,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        # Process segments
        transcription_segments = []
        full_text = ""
        
        for segment in segments:
            segment_data = {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "confidence": segment.avg_logprob,
                "no_speech_prob": segment.no_speech_prob
            }
            transcription_segments.append(segment_data)
            full_text += segment.text.strip() + " "
        
        return {
            "text": full_text.strip(),
            "segments": transcription_segments,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration
        }
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

async def store_transcript(meeting_id: str, speaker_id: str, transcript_data: Dict[str, Any], timestamp: str):
    """Store transcript in Redis for processing"""
    try:
        transcript_record = {
            "meeting_id": meeting_id,
            "speaker_id": speaker_id,
            "content": transcript_data["text"],
            "confidence": transcript_data.get("segments", [{}])[0].get("confidence", 0.0) if transcript_data.get("segments") else 0.0,
            "timestamp": timestamp,
            "language": transcript_data.get("language", "en"),
            "segments": transcript_data.get("segments", []),
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Store in Redis with meeting-specific key
        key = f"transcript:{meeting_id}:{datetime.utcnow().timestamp()}"
        await redis_client.setex(key, 3600, json.dumps(transcript_record))  # 1 hour TTL
        
        # Add to meeting transcript list
        list_key = f"transcripts:{meeting_id}"
        await redis_client.lpush(list_key, key)
        await redis_client.expire(list_key, 3600)
        
        # Send to notes processing queue if available
        if rabbitmq_channel:
            rabbitmq_channel.basic_publish(
                exchange='',
                routing_key='transcription_results',
                body=json.dumps(transcript_record),
                properties=pika.BasicProperties(delivery_mode=2)  # Persistent
            )
        
        logger.info(f"Stored transcript for meeting {meeting_id}")
        
    except Exception as e:
        logger.error(f"Error storing transcript: {e}")

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    await initialize_services()

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    if redis_client:
        await redis_client.close()
    if rabbitmq_connection:
        rabbitmq_connection.close()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check Redis
        await redis_client.ping()
        
        # Check Whisper model
        model_status = "loaded" if whisper_model else "not_loaded"
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "services": {
                "whisper_model": model_status,
                "redis": "connected",
                "rabbitmq": "connected" if rabbitmq_channel else "disconnected"
            },
            "model_info": {
                "size": MODEL_SIZE,
                "device": DEVICE
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }

@app.post("/transcribe")
async def transcribe_endpoint(
    background_tasks: BackgroundTasks,
    meeting_id: str,
    speaker_id: str,
    timestamp: str,
    language: str = "en",
    audio_file: UploadFile = File(...)
):
    """Transcribe uploaded audio file"""
    try:
        # Validate input
        if not meeting_id or not speaker_id:
            raise HTTPException(status_code=400, detail="meeting_id and speaker_id are required")
        
        # Read audio data
        audio_data = await audio_file.read()
        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")
        
        # Preprocess audio
        audio_np, sample_rate = preprocess_audio(audio_data)
        
        # Check for voice activity
        has_speech = detect_voice_activity(audio_np, sample_rate)
        if not has_speech:
            return {
                "success": True,
                "message": "No speech detected in audio",
                "transcript": {
                    "text": "",
                    "confidence": 0.0,
                    "has_speech": False
                }
            }
        
        # Transcribe audio
        transcript_data = await transcribe_audio(audio_np, language)
        
        # Store transcript in background
        background_tasks.add_task(
            store_transcript,
            meeting_id,
            speaker_id,
            transcript_data,
            timestamp
        )
        
        return {
            "success": True,
            "transcript": {
                "text": transcript_data["text"],
                "confidence": transcript_data.get("segments", [{}])[0].get("confidence", 0.0) if transcript_data.get("segments") else 0.0,
                "language": transcript_data["language"],
                "duration": transcript_data["duration"],
                "has_speech": True,
                "segments": transcript_data["segments"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe-realtime")
async def transcribe_realtime(
    background_tasks: BackgroundTasks,
    meeting_id: str,
    speaker_id: str,
    chunk_id: str,
    language: str = "en",
    audio_file: UploadFile = File(...)
):
    """Transcribe real-time audio chunks"""
    try:
        # Read audio data
        audio_data = await audio_file.read()
        
        # Store chunk temporarily
        chunk_key = f"audio_chunk:{meeting_id}:{speaker_id}:{chunk_id}"
        await redis_client.setex(chunk_key, 300, audio_data)  # 5 minutes TTL
        
        # For real-time, we might want to accumulate chunks before transcribing
        # This is a simplified version that transcribes each chunk
        
        audio_np, sample_rate = preprocess_audio(audio_data)
        
        # Quick VAD check
        has_speech = detect_voice_activity(audio_np, sample_rate)
        if not has_speech:
            return {
                "success": True,
                "message": "No speech in chunk",
                "chunk_id": chunk_id,
                "has_speech": False
            }
        
        # Transcribe chunk
        transcript_data = await transcribe_audio(audio_np, language)
        
        # Store partial transcript
        timestamp = datetime.utcnow().isoformat()
        background_tasks.add_task(
            store_transcript,
            meeting_id,
            speaker_id,
            transcript_data,
            timestamp
        )
        
        return {
            "success": True,
            "chunk_id": chunk_id,
            "transcript": {
                "text": transcript_data["text"],
                "confidence": transcript_data.get("segments", [{}])[0].get("confidence", 0.0) if transcript_data.get("segments") else 0.0,
                "has_speech": True
            }
        }
        
    except Exception as e:
        logger.error(f"Real-time transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/transcripts/{meeting_id}")
async def get_meeting_transcripts(meeting_id: str):
    """Get all transcripts for a meeting"""
    try:
        list_key = f"transcripts:{meeting_id}"
        transcript_keys = await redis_client.lrange(list_key, 0, -1)
        
        transcripts = []
        for key in transcript_keys:
            transcript_data = await redis_client.get(key)
            if transcript_data:
                transcripts.append(json.loads(transcript_data))
        
        # Sort by timestamp
        transcripts.sort(key=lambda x: x.get("timestamp", ""))
        
        return {
            "success": True,
            "meeting_id": meeting_id,
            "transcripts": transcripts,
            "total": len(transcripts)
        }
        
    except Exception as e:
        logger.error(f"Error getting transcripts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/transcripts/{meeting_id}")
async def delete_meeting_transcripts(meeting_id: str):
    """Delete all transcripts for a meeting"""
    try:
        list_key = f"transcripts:{meeting_id}"
        transcript_keys = await redis_client.lrange(list_key, 0, -1)
        
        # Delete individual transcript records
        if transcript_keys:
            await redis_client.delete(*transcript_keys)
        
        # Delete the list
        await redis_client.delete(list_key)
        
        return {
            "success": True,
            "message": f"Deleted {len(transcript_keys)} transcripts for meeting {meeting_id}"
        }
        
    except Exception as e:
        logger.error(f"Error deleting transcripts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=False,
        log_level="info"
    )
