"""
Speech-to-text using OpenAI's local Whisper model. Model is loaded once
and cached; transcription happens fully on the backend so no audio ever
needs to reach a third-party API.
"""
import os
import tempfile
from functools import lru_cache

import whisper

from app.config import settings


@lru_cache(maxsize=1)
def _model():
    return whisper.load_model(settings.whisper_model)


def transcribe(audio_bytes: bytes, filename_suffix: str = ".webm") -> str:
    fd, temp_path = tempfile.mkstemp(suffix=filename_suffix)

    try:
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(audio_bytes)

        result = _model().transcribe(temp_path)
        return result.get("text", "").strip()

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
