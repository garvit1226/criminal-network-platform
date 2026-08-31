"""
Speech-to-text using OpenAI's local Whisper model. Model is loaded once
and cached; transcription happens fully on the backend so no audio ever
needs to reach a third-party API.
"""
import tempfile
from functools import lru_cache

import whisper

from app.config import settings


@lru_cache(maxsize=1)
def _model():
    return whisper.load_model(settings.whisper_model)


def transcribe(audio_bytes: bytes, filename_suffix: str = ".webm") -> str:
    with tempfile.NamedTemporaryFile(suffix=filename_suffix, delete=True) as tmp:
        tmp.write(audio_bytes)
        tmp.flush()
        result = _model().transcribe(tmp.name)
    return result.get("text", "").strip()
