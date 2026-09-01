"""
Speech-to-text using OpenAI's local Whisper model. Model is loaded once
and cached; transcription happens fully on the backend so no audio ever
needs to reach a third-party API.
"""
import glob
import logging
import os
import shutil
import tempfile
from functools import lru_cache

import torch #type: ignore
import whisper  # type: ignore

from app.config import settings

logger = logging.getLogger(__name__)


def _ensure_ffmpeg():
    """Ensure ffmpeg executable is available in PATH for Whisper."""
    if shutil.which("ffmpeg"):
        return

    # Look in common Windows WinGet / standard locations
    potential_paths = [
        os.path.expanduser(r"~\AppData\Local\Microsoft\WinGet\Packages"),
        r"C:\Program Files\ffmpeg\bin",
        r"C:\ffmpeg\bin",
        r"C:\tools\ffmpeg\bin",
    ]

    for base in potential_paths:
        if os.path.exists(base):
            if base.endswith("bin") and os.path.exists(os.path.join(base, "ffmpeg.exe")):
                os.environ["PATH"] = base + os.pathsep + os.environ["PATH"]
                return
            matches = glob.glob(os.path.join(base, "**", "bin", "ffmpeg.exe"), recursive=True)
            if matches:
                bin_dir = os.path.dirname(matches[0])
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ["PATH"]
                logger.info(f"Added FFmpeg to PATH: {bin_dir}")
                return


@lru_cache(maxsize=1)
def _model():
    _ensure_ffmpeg()
    return whisper.load_model(settings.whisper_model)


def transcribe(audio_bytes: bytes, filename_suffix: str = ".webm") -> str:
    _ensure_ffmpeg()
    if not audio_bytes or len(audio_bytes) < 100:
        logger.warning("Empty or truncated audio bytes passed to transcribe")
        return ""

    fd, temp_path = tempfile.mkstemp(suffix=filename_suffix)

    try:
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(audio_bytes)

        use_fp16 = torch.cuda.is_available()
        logger.info(f"Transcribing audio file ({len(audio_bytes)} bytes) with model '{settings.whisper_model}'...")

        result = _model().transcribe(
            temp_path,
            fp16=use_fp16,
            language="en",
            temperature=0.0,
            initial_prompt="Crime investigation incident report, FIR, suspects, locations, vehicles, phone numbers, and financial transactions.",
            condition_on_previous_text=False,
        )
        text = result.get("text", "").strip()
        logger.info(f"Transcription result: {text}")
        return text

    except Exception as e:
        logger.error(f"Error during Whisper transcription: {e}", exc_info=True)
        raise e

    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
