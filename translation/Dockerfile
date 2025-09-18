# MindMeet Translation Service Dockerfile

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    libffi-dev \
    libssl-dev \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download translation models
RUN python -c "import whisper; whisper.load_model('base')"
RUN python -c "from transformers import AutoTokenizer, AutoModelForSeq2SeqLM; AutoTokenizer.from_pretrained('facebook/mbart-large-50-many-to-many-mmt'); AutoModelForSeq2SeqLM.from_pretrained('facebook/mbart-large-50-many-to-many-mmt')"

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 mindmeet && chown -R mindmeet:mindmeet /app
USER mindmeet

# Expose port
EXPOSE 8003

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8003/health || exit 1

# Start the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003", "--workers", "1"]
