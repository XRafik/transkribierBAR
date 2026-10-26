"""What the status WebSocket sends about a finished transcription."""
import asyncio
import uuid

from starlette.testclient import TestClient

from app.database import get_db
from app.main import app


async def _seed(user_id: str, transcription_id: str, **columns) -> None:
    names = ", ".join(["id", "user_id", *columns])
    marks = ", ".join("?" * (len(columns) + 2))
    async with get_db() as db:
        await db.execute("INSERT INTO users (id, email) VALUES (?, ?)", (user_id, f"{user_id}@x"))
        await db.execute(
            f"INSERT INTO transcriptions ({names}) VALUES ({marks})",
            (transcription_id, user_id, *columns.values()),
        )
        await db.commit()


def test_failed_message_carries_the_error_code():
    user_id, transcription_id = str(uuid.uuid4()), str(uuid.uuid4())
    with TestClient(app) as client:
        asyncio.run(_seed(
            user_id, transcription_id, status="failed",
            error_message="The server restarted while this transcription was running.",
            error_code="server_restarted",
        ))
        with client.websocket_connect(
            f"/api/ws/status/{transcription_id}", headers={"X-Auth-Request-User": user_id},
        ) as ws:
            msg = ws.receive_json()

    assert msg == {
        "type": "status", "status": "failed",
        "error": "The server restarted while this transcription was running.",
        "error_code": "server_restarted",
    }
