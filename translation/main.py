"""
MindMeet Translation Service
Real-time language interpretation and translation service
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import aioredis
import pika
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import torch
from googletrans import Translator
import whisper
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MindMeet Translation Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
redis_client = None
rabbitmq_connection = None
translation_models = {}
supported_languages = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese (Simplified)',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'tr': 'Turkish',
    'pl': 'Polish',
    'nl': 'Dutch',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'ro': 'Romanian',
    'bg': 'Bulgarian',
    'hr': 'Croatian',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'et': 'Estonian',
    'lv': 'Latvian',
    'lt': 'Lithuanian',
    'mt': 'Maltese',
    'el': 'Greek',
    'cy': 'Welsh',
    'ga': 'Irish',
    'is': 'Icelandic',
    'mk': 'Macedonian',
    'sq': 'Albanian',
    'sr': 'Serbian',
    'bs': 'Bosnian',
    'me': 'Montenegrin',
    'uk': 'Ukrainian',
    'be': 'Belarusian',
    'kk': 'Kazakh',
    'ky': 'Kyrgyz',
    'uz': 'Uzbek',
    'tg': 'Tajik',
    'mn': 'Mongolian',
    'ka': 'Georgian',
    'am': 'Amharic',
    'sw': 'Swahili',
    'zu': 'Zulu',
    'af': 'Afrikaans',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'id': 'Indonesian',
    'ms': 'Malay',
    'tl': 'Filipino',
    'he': 'Hebrew',
    'fa': 'Persian',
    'ur': 'Urdu',
    'bn': 'Bengali',
    'ta': 'Tamil',
    'te': 'Telugu',
    'ml': 'Malayalam',
    'kn': 'Kannada',
    'gu': 'Gujarati',
    'pa': 'Punjabi',
    'or': 'Odia',
    'as': 'Assamese',
    'ne': 'Nepali',
    'si': 'Sinhala',
    'my': 'Myanmar',
    'km': 'Khmer',
    'lo': 'Lao'
}

# Pydantic models
class TranslationRequest(BaseModel):
    text: str
    source_language: str
    target_language: str
    meeting_id: str
    speaker_id: Optional[str] = None

class TranslationResponse(BaseModel):
    original_text: str
    translated_text: str
    source_language: str
    target_language: str
    confidence: float
    timestamp: datetime

class LanguageDetectionRequest(BaseModel):
    text: str

class LanguageDetectionResponse(BaseModel):
    language: str
    confidence: float

class RealTimeTranslationRequest(BaseModel):
    meeting_id: str
    source_language: str
    target_languages: List[str]

# Connection manager for WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.meeting_languages: Dict[str, Dict[str, str]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: str, user_id: str, target_language: str):
        await websocket.accept()
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []
            self.meeting_languages[meeting_id] = {}
        
        self.active_connections[meeting_id].append(websocket)
        self.meeting_languages[meeting_id][user_id] = target_language
        
        logger.info(f"User {user_id} connected to meeting {meeting_id} for {target_language} translation")

    def disconnect(self, websocket: WebSocket, meeting_id: str, user_id: str):
        if meeting_id in self.active_connections:
            if websocket in self.active_connections[meeting_id]:
                self.active_connections[meeting_id].remove(websocket)
            
            if meeting_id in self.meeting_languages and user_id in self.meeting_languages[meeting_id]:
                del self.meeting_languages[meeting_id][user_id]
            
            # Clean up empty meetings
            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]
                if meeting_id in self.meeting_languages:
                    del self.meeting_languages[meeting_id]

    async def broadcast_translation(self, meeting_id: str, translation_data: dict):
        if meeting_id in self.active_connections:
            disconnected = []
            for websocket in self.active_connections[meeting_id]:
                try:
                    await websocket.send_json(translation_data)
                except:
                    disconnected.append(websocket)
            
            # Remove disconnected websockets
            for ws in disconnected:
                self.active_connections[meeting_id].remove(ws)

manager = ConnectionManager()

# Initialize services
async def initialize_services():
    """Initialize Redis, RabbitMQ, and translation models"""
    global redis_client, rabbitmq_connection
    
    try:
        # Initialize Redis
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        redis_client = await aioredis.from_url(redis_url)
        logger.info("Connected to Redis")
        
        # Initialize RabbitMQ
        rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://localhost:5672')
        rabbitmq_connection = pika.BlockingConnection(pika.URLParameters(rabbitmq_url))
        logger.info("Connected to RabbitMQ")
        
        # Initialize translation models
        await load_translation_models()
        
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise

async def load_translation_models():
    """Load translation models for better performance"""
    global translation_models
    
    try:
        # Load Google Translator (fallback)
        translation_models['google'] = Translator()
        
        # Load Whisper for speech recognition
        translation_models['whisper'] = whisper.load_model("base")
        
        # Load multilingual models for better accuracy
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load mBART for high-quality translation
        try:
            translation_models['mbart_tokenizer'] = AutoTokenizer.from_pretrained("facebook/mbart-large-50-many-to-many-mmt")
            translation_models['mbart_model'] = AutoModelForSeq2SeqLM.from_pretrained("facebook/mbart-large-50-many-to-many-mmt").to(device)
            logger.info("Loaded mBART translation model")
        except Exception as e:
            logger.warning(f"Failed to load mBART model: {e}")
        
        logger.info("Translation models loaded successfully")
        
    except Exception as e:
        logger.error(f"Failed to load translation models: {e}")
        raise

def detect_language(text: str) -> Tuple[str, float]:
    """Detect language of input text"""
    try:
        translator = translation_models.get('google')
        if translator:
            detection = translator.detect(text)
            return detection.lang, detection.confidence
        return 'en', 0.5
    except Exception as e:
        logger.error(f"Language detection failed: {e}")
        return 'en', 0.0

def translate_text_google(text: str, source_lang: str, target_lang: str) -> Tuple[str, float]:
    """Translate text using Google Translate"""
    try:
        translator = translation_models.get('google')
        if not translator:
            raise HTTPException(status_code=500, detail="Translation service not available")
        
        result = translator.translate(text, src=source_lang, dest=target_lang)
        return result.text, 0.9  # Google Translate typically has high confidence
        
    except Exception as e:
        logger.error(f"Google translation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

def translate_text_mbart(text: str, source_lang: str, target_lang: str) -> Tuple[str, float]:
    """Translate text using mBART model for higher quality"""
    try:
        tokenizer = translation_models.get('mbart_tokenizer')
        model = translation_models.get('mbart_model')
        
        if not tokenizer or not model:
            # Fallback to Google Translate
            return translate_text_google(text, source_lang, target_lang)
        
        # mBART language codes mapping
        mbart_lang_map = {
            'en': 'en_XX', 'es': 'es_XX', 'fr': 'fr_XX', 'de': 'de_DE',
            'it': 'it_IT', 'pt': 'pt_XX', 'ru': 'ru_RU', 'ja': 'ja_XX',
            'ko': 'ko_KR', 'zh': 'zh_CN', 'ar': 'ar_AR', 'hi': 'hi_IN',
            'tr': 'tr_TR', 'pl': 'pl_PL', 'nl': 'nl_XX', 'sv': 'sv_SE'
        }
        
        src_lang = mbart_lang_map.get(source_lang, 'en_XX')
        tgt_lang = mbart_lang_map.get(target_lang, 'en_XX')
        
        # Tokenize input
        tokenizer.src_lang = src_lang
        encoded = tokenizer(text, return_tensors="pt", max_length=512, truncation=True)
        
        # Generate translation
        generated_tokens = model.generate(
            **encoded,
            forced_bos_token_id=tokenizer.lang_code_to_id[tgt_lang],
            max_length=512,
            num_beams=5,
            early_stopping=True
        )
        
        # Decode result
        translated_text = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]
        
        return translated_text, 0.95  # mBART typically has very high quality
        
    except Exception as e:
        logger.error(f"mBART translation failed: {e}")
        # Fallback to Google Translate
        return translate_text_google(text, source_lang, target_lang)

async def store_translation(meeting_id: str, original_text: str, translated_text: str, 
                          source_lang: str, target_lang: str, speaker_id: str = None, confidence: float = 0.0):
    """Store translation in database via API service"""
    try:
        api_url = os.getenv('API_SERVICE_URL', 'http://localhost:8001')
        
        translation_data = {
            'meeting_id': meeting_id,
            'original_text': original_text,
            'translated_text': translated_text,
            'source_language': source_lang,
            'target_language': target_lang,
            'speaker_id': speaker_id,
            'confidence': confidence,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{api_url}/translations", json=translation_data)
            response.raise_for_status()
            
    except Exception as e:
        logger.error(f"Failed to store translation: {e}")

# API Endpoints
@app.on_event("startup")
async def startup_event():
    await initialize_services()

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "translation"}

@app.get("/languages")
async def get_supported_languages():
    """Get list of supported languages"""
    return {"languages": supported_languages}

@app.post("/detect-language", response_model=LanguageDetectionResponse)
async def detect_language_endpoint(request: LanguageDetectionRequest):
    """Detect language of input text"""
    language, confidence = detect_language(request.text)
    return LanguageDetectionResponse(language=language, confidence=confidence)

@app.post("/translate", response_model=TranslationResponse)
async def translate_text_endpoint(request: TranslationRequest):
    """Translate text from source to target language"""
    
    # Validate languages
    if request.source_language not in supported_languages:
        raise HTTPException(status_code=400, detail=f"Unsupported source language: {request.source_language}")
    
    if request.target_language not in supported_languages:
        raise HTTPException(status_code=400, detail=f"Unsupported target language: {request.target_language}")
    
    # Perform translation
    translated_text, confidence = translate_text_mbart(
        request.text, 
        request.source_language, 
        request.target_language
    )
    
    # Store translation
    await store_translation(
        request.meeting_id,
        request.text,
        translated_text,
        request.source_language,
        request.target_language,
        request.speaker_id,
        confidence
    )
    
    return TranslationResponse(
        original_text=request.text,
        translated_text=translated_text,
        source_language=request.source_language,
        target_language=request.target_language,
        confidence=confidence,
        timestamp=datetime.utcnow()
    )

@app.websocket("/ws/translate/{meeting_id}/{user_id}/{target_language}")
async def websocket_translation_endpoint(websocket: WebSocket, meeting_id: str, user_id: str, target_language: str):
    """WebSocket endpoint for real-time translation"""
    
    if target_language not in supported_languages:
        await websocket.close(code=4000, reason="Unsupported target language")
        return
    
    await manager.connect(websocket, meeting_id, user_id, target_language)
    
    try:
        while True:
            # Receive transcript data
            data = await websocket.receive_json()
            
            if data.get('type') == 'transcript':
                original_text = data.get('text', '')
                source_language = data.get('language', 'en')
                speaker_id = data.get('speaker_id')
                
                if original_text and source_language != target_language:
                    # Translate text
                    translated_text, confidence = translate_text_mbart(
                        original_text, source_language, target_language
                    )
                    
                    # Store translation
                    await store_translation(
                        meeting_id, original_text, translated_text,
                        source_language, target_language, speaker_id, confidence
                    )
                    
                    # Send translation back to client
                    translation_response = {
                        'type': 'translation',
                        'original_text': original_text,
                        'translated_text': translated_text,
                        'source_language': source_language,
                        'target_language': target_language,
                        'speaker_id': speaker_id,
                        'confidence': confidence,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    
                    await websocket.send_json(translation_response)
                    
    except WebSocketDisconnect:
        manager.disconnect(websocket, meeting_id, user_id)
        logger.info(f"User {user_id} disconnected from meeting {meeting_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, meeting_id, user_id)

@app.post("/meetings/{meeting_id}/enable-translation")
async def enable_meeting_translation(meeting_id: str, request: RealTimeTranslationRequest):
    """Enable real-time translation for a meeting"""
    try:
        # Store meeting translation settings in Redis
        translation_settings = {
            'source_language': request.source_language,
            'target_languages': request.target_languages,
            'enabled': True,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await redis_client.setex(
            f"meeting_translation:{meeting_id}",
            3600,  # 1 hour expiry
            json.dumps(translation_settings)
        )
        
        return {"message": "Translation enabled for meeting", "meeting_id": meeting_id}
        
    except Exception as e:
        logger.error(f"Failed to enable translation: {e}")
        raise HTTPException(status_code=500, detail="Failed to enable translation")

@app.delete("/meetings/{meeting_id}/disable-translation")
async def disable_meeting_translation(meeting_id: str):
    """Disable real-time translation for a meeting"""
    try:
        await redis_client.delete(f"meeting_translation:{meeting_id}")
        return {"message": "Translation disabled for meeting", "meeting_id": meeting_id}
        
    except Exception as e:
        logger.error(f"Failed to disable translation: {e}")
        raise HTTPException(status_code=500, detail="Failed to disable translation")

@app.get("/meetings/{meeting_id}/translation-stats")
async def get_translation_stats(meeting_id: str):
    """Get translation statistics for a meeting"""
    try:
        # Get translation settings
        settings_data = await redis_client.get(f"meeting_translation:{meeting_id}")
        if not settings_data:
            raise HTTPException(status_code=404, detail="Translation not enabled for this meeting")
        
        settings = json.loads(settings_data)
        
        # Get active connections
        active_users = len(manager.meeting_languages.get(meeting_id, {}))
        
        return {
            "meeting_id": meeting_id,
            "translation_enabled": settings.get('enabled', False),
            "source_language": settings.get('source_language'),
            "target_languages": settings.get('target_languages'),
            "active_users": active_users,
            "supported_languages": list(supported_languages.keys())
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get translation stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get translation stats")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
