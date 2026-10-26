from fastapi import HTTPException

from app.config import settings
from app.database import get_db


def resolve_whisper_model(model: str | None) -> str:
    """The requested model, or the instance default; 422 if the instance does not offer it."""
    if not model:
        return settings.DEFAULT_WHISPER_MODEL
    if model not in settings.WHISPER_MODELS:
        raise HTTPException(status_code=422, detail=f"Model '{model}' is not available on this instance")
    return model


async def ensure_transcription_owned(db, transcription_id: str, user_id: str) -> None:
    cursor = await db.execute(
        "SELECT id FROM transcriptions WHERE id = ? AND user_id = ?",
        (transcription_id, user_id),
    )
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Transcription not found")


async def load_speaker_mappings(db, transcription_id: str) -> dict[str, str]:
    cursor = await db.execute(
        "SELECT original_label, custom_name FROM speaker_mappings WHERE transcription_id = ?",
        (transcription_id,),
    )
    rows = await cursor.fetchall()
    return {r["original_label"]: r["custom_name"] for r in rows} if rows else {}


async def reset_translation_state(transcription_id: str, user_id: str) -> None:
    async with get_db() as db:
        await db.execute(
            "UPDATE transcriptions SET translated_utterances_json = NULL, "
            "translation_language = NULL, translation_source = NULL, "
            "translation_source_hash = NULL "
            "WHERE id = ? AND user_id = ?",
            (transcription_id, user_id),
        )
        await db.commit()


async def reset_refinement_state(transcription_id: str, user_id: str) -> None:
    async with get_db() as db:
        await db.execute(
            "UPDATE transcriptions SET refined_utterances_json = NULL WHERE id = ? AND user_id = ?",
            (transcription_id, user_id),
        )
        await db.commit()


async def fetch_file_owned_or_404(db, file_id: str, user_id: str, *, detail: str = "File not found"):
    cursor = await db.execute(
        "SELECT * FROM files WHERE id = ? AND user_id = ?",
        (file_id, user_id),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=detail)
    return row
