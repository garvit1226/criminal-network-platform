from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.models.schemas import ReportIn, ExtractionResult, TranscriptionOut
from app.services import extraction, stt_service
from app.services.graph_service import graph_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("/text", response_model=ExtractionResult)
def submit_text_report(payload: ReportIn):
    """Submit a typed crime report; extract entities/relationships and store them in the graph."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Report text cannot be empty.")
    graph_service.clear_graph()
    result = extraction.extract(payload.case_id, payload.text)
    graph_service.save_extraction(result)
    return result


@router.post("/voice", response_model=ExtractionResult)
async def submit_voice_report(case_id: str = Form(...), audio: UploadFile = File(...)):
    """Submit a spoken crime report as an audio file; transcribe, extract, and store."""
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")
    suffix = "." + (audio.filename.rsplit(".", 1)[-1] if audio.filename and "." in audio.filename else "webm")
    text = stt_service.transcribe(audio_bytes, filename_suffix=suffix)
    if not text:
        raise HTTPException(status_code=422, detail="Could not transcribe any speech from the audio.")
    graph_service.clear_graph()
    result = extraction.extract(case_id, text)
    graph_service.save_extraction(result)
    return result


@router.post("/transcribe", response_model=TranscriptionOut)
async def transcribe_only(audio: UploadFile = File(...)):
    """Transcribe audio to text without extraction/storage -- lets the UI show text for editing first."""
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")
    suffix = "." + (audio.filename.rsplit(".", 1)[-1] if audio.filename and "." in audio.filename else "webm")
    text = stt_service.transcribe(audio_bytes, filename_suffix=suffix)
    return TranscriptionOut(text=text)
