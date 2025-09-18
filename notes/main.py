import os
import asyncio
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
import re

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import pika
import redis.asyncio as redis
import asyncpg
from sentence_transformers import SentenceTransformer
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
import openai

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TalkFlow Notes Processing Service",
    description="AI-powered meeting notes organization and summarization",
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
sentence_model: Optional[SentenceTransformer] = None
redis_client: Optional[redis.Redis] = None
db_pool: Optional[asyncpg.Pool] = None
rabbitmq_connection: Optional[pika.BlockingConnection] = None
rabbitmq_channel: Optional[pika.channel.Channel] = None

# Configuration
MODEL_NAME = os.getenv("SENTENCE_MODEL", "all-MiniLM-L6-v2")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./talkflow.db")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://localhost:5672")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize OpenAI if API key is available
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY

async def initialize_services():
    """Initialize all required services"""
    global sentence_model, redis_client, db_pool, rabbitmq_connection, rabbitmq_channel
    
    try:
        # Initialize sentence transformer model
        logger.info(f"Loading sentence transformer model: {MODEL_NAME}")
        sentence_model = SentenceTransformer(MODEL_NAME)
        logger.info("✅ Sentence transformer model loaded successfully")
        
        # Initialize Redis
        redis_client = redis.from_url(REDIS_URL)
        await redis_client.ping()
        logger.info("✅ Connected to Redis")
        
        # Initialize database connection (PostgreSQL)
        if DATABASE_URL.startswith("postgresql://"):
            db_pool = await asyncpg.create_pool(DATABASE_URL)
            logger.info("✅ Connected to PostgreSQL")
        else:
            logger.info("Using SQLite database (PostgreSQL recommended for production)")
        
        # Initialize RabbitMQ
        if RABBITMQ_URL:
            connection_params = pika.URLParameters(RABBITMQ_URL)
            rabbitmq_connection = pika.BlockingConnection(connection_params)
            rabbitmq_channel = rabbitmq_connection.channel()
            
            # Declare queues
            rabbitmq_channel.queue_declare(queue='transcription_results', durable=True)
            rabbitmq_channel.queue_declare(queue='notes_processing', durable=True)
            rabbitmq_channel.queue_declare(queue='export_jobs', durable=True)
            
            logger.info("✅ Connected to RabbitMQ")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        raise

def extract_themes_from_transcripts(transcripts: List[Dict[str, Any]], num_themes: int = 5) -> List[Dict[str, Any]]:
    """Extract themes from meeting transcripts using clustering"""
    try:
        if not transcripts or len(transcripts) < 2:
            return []
        
        # Extract text content
        texts = [t.get('content', '') for t in transcripts if t.get('content', '').strip()]
        if len(texts) < 2:
            return []
        
        # Generate embeddings
        embeddings = sentence_model.encode(texts)
        
        # Perform clustering
        n_clusters = min(num_themes, len(texts))
        if n_clusters < 2:
            return []
        
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = kmeans.fit_predict(embeddings)
        
        # Extract themes
        themes = []
        for cluster_id in range(n_clusters):
            cluster_texts = [texts[i] for i in range(len(texts)) if cluster_labels[i] == cluster_id]
            if not cluster_texts:
                continue
            
            # Find most representative text (closest to centroid)
            cluster_embeddings = [embeddings[i] for i in range(len(embeddings)) if cluster_labels[i] == cluster_id]
            centroid = np.mean(cluster_embeddings, axis=0)
            
            similarities = [cosine_similarity([centroid], [emb])[0][0] for emb in cluster_embeddings]
            most_representative_idx = np.argmax(similarities)
            representative_text = cluster_texts[most_representative_idx]
            
            # Generate theme title (first few words or sentence)
            title = representative_text.split('.')[0][:100] + ('...' if len(representative_text) > 100 else '')
            
            themes.append({
                'title': title,
                'description': f"Discussion cluster with {len(cluster_texts)} related segments",
                'confidence': float(np.mean(similarities)),
                'sample_texts': cluster_texts[:3]  # Include sample texts for context
            })
        
        # Sort by confidence
        themes.sort(key=lambda x: x['confidence'], reverse=True)
        return themes
        
    except Exception as e:
        logger.error(f"Error extracting themes: {e}")
        return []

def extract_important_notes(transcripts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract important notes using keyword and pattern matching"""
    try:
        important_patterns = [
            r'\b(?:important|crucial|critical|key|essential|vital|significant)\b',
            r'\b(?:remember|note|highlight|emphasize|stress)\b',
            r'\b(?:action|todo|task|follow[- ]?up|next steps?)\b',
            r'\b(?:decision|decide|agreed?|concluded?)\b',
            r'\b(?:problem|issue|concern|challenge|risk)\b',
            r'\b(?:solution|resolve|fix|address)\b',
            r'\b(?:deadline|due|schedule|timeline)\b',
            r'\b(?:budget|cost|price|expense)\b'
        ]
        
        important_notes = []
        
        for transcript in transcripts:
            content = transcript.get('content', '').lower()
            if not content.strip():
                continue
            
            importance_score = 0
            matched_patterns = []
            
            # Check for important patterns
            for pattern in important_patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                if matches:
                    importance_score += len(matches)
                    matched_patterns.append(pattern)
            
            # Check for question marks (questions are often important)
            if '?' in content:
                importance_score += content.count('?')
            
            # Check for exclamation marks (emphasis)
            if '!' in content:
                importance_score += content.count('!')
            
            # Longer segments might be more important
            word_count = len(content.split())
            if word_count > 20:
                importance_score += 1
            
            if importance_score > 0:
                important_notes.append({
                    'content': transcript.get('content', ''),
                    'speaker_id': transcript.get('speaker_id'),
                    'timestamp': transcript.get('timestamp'),
                    'importance': importance_score,
                    'matched_patterns': matched_patterns
                })
        
        # Sort by importance score
        important_notes.sort(key=lambda x: x['importance'], reverse=True)
        return important_notes[:10]  # Return top 10 important notes
        
    except Exception as e:
        logger.error(f"Error extracting important notes: {e}")
        return []

def extract_decisions(transcripts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract decisions from meeting transcripts"""
    try:
        decision_patterns = [
            r'\b(?:we (?:decided|agreed|concluded|determined))\b',
            r'\b(?:decision|agreed?|concluded?|determined)\b',
            r'\b(?:let\'s|we\'ll|we will|we should)\b',
            r'\b(?:approved|rejected|accepted|denied)\b',
            r'\b(?:final|finalized|settled|resolved)\b'
        ]
        
        decisions = []
        
        for transcript in transcripts:
            content = transcript.get('content', '')
            if not content.strip():
                continue
            
            # Check for decision patterns
            for pattern in decision_patterns:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    # Extract the sentence containing the decision
                    sentences = content.split('.')
                    for sentence in sentences:
                        if match.group() in sentence.lower():
                            decisions.append({
                                'title': sentence.strip()[:100] + ('...' if len(sentence) > 100 else ''),
                                'description': sentence.strip(),
                                'timestamp': transcript.get('timestamp'),
                                'decided_by_speaker_id': transcript.get('speaker_id')
                            })
                            break
        
        # Remove duplicates and return unique decisions
        unique_decisions = []
        seen_titles = set()
        for decision in decisions:
            if decision['title'] not in seen_titles:
                unique_decisions.append(decision)
                seen_titles.add(decision['title'])
        
        return unique_decisions[:10]  # Return top 10 decisions
        
    except Exception as e:
        logger.error(f"Error extracting decisions: {e}")
        return []

def extract_action_items(transcripts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract action items from meeting transcripts"""
    try:
        action_patterns = [
            r'\b(?:action|todo|task|assignment)\b',
            r'\b(?:follow[- ]?up|next steps?)\b',
            r'\b(?:will|should|need to|have to|must)\b',
            r'\b(?:by|before|until|deadline)\b',
            r'\b(?:responsible|assigned|owner)\b'
        ]
        
        action_items = []
        
        for transcript in transcripts:
            content = transcript.get('content', '')
            if not content.strip():
                continue
            
            # Check for action patterns
            action_score = 0
            for pattern in action_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    action_score += 1
            
            if action_score >= 2:  # Require multiple action indicators
                # Try to extract who is responsible
                assignee_patterns = [
                    r'\b(\w+) will\b',
                    r'\b(\w+) should\b',
                    r'\bassigned to (\w+)\b',
                    r'\b(\w+) is responsible\b'
                ]
                
                assigned_to = None
                for pattern in assignee_patterns:
                    match = re.search(pattern, content, re.IGNORECASE)
                    if match:
                        assigned_to = match.group(1)
                        break
                
                # Try to extract due date
                due_date_patterns = [
                    r'\bby (\w+ \d+)\b',
                    r'\bbefore (\w+ \d+)\b',
                    r'\buntil (\w+ \d+)\b',
                    r'\bdeadline (\w+ \d+)\b'
                ]
                
                due_date = None
                for pattern in due_date_patterns:
                    match = re.search(pattern, content, re.IGNORECASE)
                    if match:
                        due_date = match.group(1)
                        break
                
                action_items.append({
                    'title': content[:100] + ('...' if len(content) > 100 else ''),
                    'description': content,
                    'assigned_to_speaker_id': transcript.get('speaker_id') if not assigned_to else None,
                    'assigned_to_name': assigned_to,
                    'due_date': due_date,
                    'status': 'PENDING',
                    'priority': 'MEDIUM'
                })
        
        return action_items[:15]  # Return top 15 action items
        
    except Exception as e:
        logger.error(f"Error extracting action items: {e}")
        return []

async def generate_summary_with_openai(transcripts: List[Dict[str, Any]], meeting_title: str) -> str:
    """Generate meeting summary using OpenAI GPT"""
    try:
        if not OPENAI_API_KEY or not transcripts:
            return generate_basic_summary(transcripts, meeting_title)
        
        # Combine all transcript content
        full_transcript = "\n".join([
            f"Speaker {t.get('speaker_id', 'Unknown')}: {t.get('content', '')}"
            for t in transcripts if t.get('content', '').strip()
        ])
        
        if len(full_transcript) > 8000:  # Limit for API
            full_transcript = full_transcript[:8000] + "..."
        
        prompt = f"""
        Please provide a concise summary of this meeting titled "{meeting_title}".
        
        Meeting Transcript:
        {full_transcript}
        
        Please provide:
        1. A brief overview of what was discussed
        2. Key points and highlights
        3. Main outcomes or conclusions
        
        Keep the summary professional and concise (2-3 paragraphs).
        """
        
        response = await openai.ChatCompletion.acreate(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a professional meeting summarizer. Create clear, concise summaries."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.3
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        logger.error(f"Error generating OpenAI summary: {e}")
        return generate_basic_summary(transcripts, meeting_title)

def generate_basic_summary(transcripts: List[Dict[str, Any]], meeting_title: str) -> str:
    """Generate a basic summary without OpenAI"""
    try:
        if not transcripts:
            return f"Meeting '{meeting_title}' was held but no transcript content is available."
        
        total_segments = len(transcripts)
        speakers = set(t.get('speaker_id') for t in transcripts if t.get('speaker_id'))
        
        # Get first and last few segments for context
        first_segments = transcripts[:3]
        last_segments = transcripts[-3:] if len(transcripts) > 3 else []
        
        summary = f"Meeting '{meeting_title}' included {len(speakers)} participants with {total_segments} discussion segments. "
        
        if first_segments:
            summary += "The meeting began with discussions about: "
            summary += " ".join([s.get('content', '')[:50] + "..." for s in first_segments[:2]])
        
        if last_segments:
            summary += " The meeting concluded with: "
            summary += " ".join([s.get('content', '')[:50] + "..." for s in last_segments[:2]])
        
        return summary
        
    except Exception as e:
        logger.error(f"Error generating basic summary: {e}")
        return f"Meeting '{meeting_title}' was completed."

async def process_meeting_notes(meeting_id: str) -> Dict[str, Any]:
    """Process meeting transcripts and generate organized notes"""
    try:
        # Get transcripts from Redis
        list_key = f"transcripts:{meeting_id}"
        transcript_keys = await redis_client.lrange(list_key, 0, -1)
        
        transcripts = []
        for key in transcript_keys:
            transcript_data = await redis_client.get(key)
            if transcript_data:
                transcripts.append(json.loads(transcript_data))
        
        if not transcripts:
            logger.warning(f"No transcripts found for meeting {meeting_id}")
            return None
        
        logger.info(f"Processing {len(transcripts)} transcripts for meeting {meeting_id}")
        
        # Extract different types of content
        themes = extract_themes_from_transcripts(transcripts)
        important_notes = extract_important_notes(transcripts)
        decisions = extract_decisions(transcripts)
        action_items = extract_action_items(transcripts)
        
        # Generate summary
        meeting_title = f"Meeting {meeting_id}"  # In production, get from database
        summary = await generate_summary_with_openai(transcripts, meeting_title)
        
        # Prepare notes data
        notes_data = {
            'meeting_id': meeting_id,
            'summary': summary,
            'themes': themes,
            'important_notes': important_notes,
            'decisions': decisions,
            'action_items': action_items,
            'processed_at': datetime.utcnow().isoformat(),
            'transcript_count': len(transcripts)
        }
        
        # Store processed notes in Redis
        notes_key = f"processed_notes:{meeting_id}"
        await redis_client.setex(notes_key, 86400, json.dumps(notes_data))  # 24 hours TTL
        
        logger.info(f"Successfully processed notes for meeting {meeting_id}")
        return notes_data
        
    except Exception as e:
        logger.error(f"Error processing meeting notes: {e}")
        return None

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    await initialize_services()

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    if redis_client:
        await redis_client.close()
    if db_pool:
        await db_pool.close()
    if rabbitmq_connection:
        rabbitmq_connection.close()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check Redis
        await redis_client.ping()
        
        # Check sentence model
        model_status = "loaded" if sentence_model else "not_loaded"
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "services": {
                "sentence_model": model_status,
                "redis": "connected",
                "database": "connected" if db_pool else "not_configured",
                "rabbitmq": "connected" if rabbitmq_channel else "disconnected",
                "openai": "configured" if OPENAI_API_KEY else "not_configured"
            },
            "model_info": {
                "name": MODEL_NAME
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }

@app.post("/process-notes/{meeting_id}")
async def process_notes_endpoint(meeting_id: str, background_tasks: BackgroundTasks):
    """Process notes for a specific meeting"""
    try:
        # Process notes in background
        background_tasks.add_task(process_meeting_notes, meeting_id)
        
        return {
            "success": True,
            "message": f"Notes processing started for meeting {meeting_id}",
            "meeting_id": meeting_id
        }
        
    except Exception as e:
        logger.error(f"Error starting notes processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/notes/{meeting_id}")
async def get_processed_notes(meeting_id: str):
    """Get processed notes for a meeting"""
    try:
        notes_key = f"processed_notes:{meeting_id}"
        notes_data = await redis_client.get(notes_key)
        
        if not notes_data:
            return {
                "success": False,
                "message": "Notes not found or not yet processed",
                "meeting_id": meeting_id
            }
        
        return {
            "success": True,
            "meeting_id": meeting_id,
            "notes": json.loads(notes_data)
        }
        
    except Exception as e:
        logger.error(f"Error getting processed notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/notes/{meeting_id}")
async def delete_processed_notes(meeting_id: str):
    """Delete processed notes for a meeting"""
    try:
        notes_key = f"processed_notes:{meeting_id}"
        deleted = await redis_client.delete(notes_key)
        
        return {
            "success": True,
            "message": f"Deleted notes for meeting {meeting_id}",
            "deleted": bool(deleted)
        }
        
    except Exception as e:
        logger.error(f"Error deleting processed notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=False,
        log_level="info"
    )
