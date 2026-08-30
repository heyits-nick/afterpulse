from __future__ import annotations

import json
import os
import sys
import threading
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import guava
from guava.events import BotSessionEnded, OutboundCallFailed


HOST = "localhost"
PORT = 8788
FROM_NUMBER = os.getenv("GUAVA_AGENT_NUMBER", "+14843362216")
TO_NUMBER = os.getenv("DEMO_PHONE_NUMBER")
DATA_DIR = Path(__file__).parent / "data"
EVENTS_PATH = DATA_DIR / "events.json"
FIELD_KEYS = (
    "trigger_context",
    "symptoms",
    "peak_intensity",
    "current_intensity",
    "what_helped",
    "follow_up_requested",
)
ALLOWED_ORIGINS = {"http://localhost:3000", "http://127.0.0.1:3000"}

state_lock = threading.Lock()
state: dict[str, Any] = {
    "status": "idle",
    "message": "Ready for wearable replay",
    "latest_event": None,
}


def update_state(**changes: Any) -> None:
    with state_lock:
        state.update(changes)


def state_snapshot() -> dict[str, Any]:
    with state_lock:
        return dict(state)


def load_latest_event() -> dict[str, Any] | None:
    try:
        events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
        return events[-1] if events else None
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def build_event(call: guava.Call, termination_reason: str) -> dict[str, Any]:
    answers = {key: call.get_field(key) for key in FIELD_KEYS}
    answered = sum(value not in (None, "") for value in answers.values())
    return {
        "id": f"evt-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}",
        "recorded_at": datetime.now(UTC).isoformat(),
        "termination_reason": termination_reason,
        "biometrics": {
            "source": "Galaxy Watch4 synthetic replay",
            "baseline_hr": 72,
            "max_hr": 124,
            "baseline_hrv": 54,
            "min_hrv": 19,
            "motion": "low",
            "recovery_seconds": 252,
        },
        "answers": answers,
        "completeness": {"answered": answered, "total": len(FIELD_KEYS)},
        "review_status": "clinician_review_required",
    }


def save_event(event: dict[str, Any]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    try:
        events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        events = []
    events.append(event)
    EVENTS_PATH.write_text(json.dumps(events, indent=2), encoding="utf-8")


def create_agent() -> guava.Agent:
    agent = guava.Agent(
        name="Maya",
        organization="AfterPulse",
        purpose=(
            "Conduct a warm, concise post-event wellness check-in after the person has opted in. "
            "Collect context for clinician review. Never diagnose, claim certainty, or replace emergency care."
        ),
    )

    @agent.on_call_start
    def on_call_start(call: guava.Call) -> None:
        update_state(status="in_call", message="Check-in in progress")
        call.set_task(
            "post_event_checkin",
            objective=(
                "Complete a compassionate check-in in about one minute. Introduce yourself as Maya, "
                "the AfterPulse automated check-in assistant, and confirm now is still a good time. "
                "Ask no more than four concise, natural questions. Use details from each answer to fill "
                "multiple fields and ask only for information still missing. Briefly acknowledge answers "
                "without giving medical advice. If the person reports immediate danger, tell them this "
                "service is not emergency care and that they should contact local emergency services or "
                "a trusted person now."
            ),
            checklist=[
                guava.Field(
                    key="trigger_context",
                    question="What was happening just before you noticed the episode?",
                    field_type="text",
                    sensitive=True,
                ),
                guava.Field(
                    key="symptoms",
                    question="What did you notice in your body or thoughts?",
                    field_type="text",
                    sensitive=True,
                ),
                guava.Field(
                    key="peak_intensity",
                    question="On a scale from 1 to 10, how intense was it at the peak?",
                    field_type="integer",
                    sensitive=True,
                ),
                guava.Field(
                    key="current_intensity",
                    question="On that same scale, where are you now?",
                    field_type="integer",
                    sensitive=True,
                ),
                guava.Field(
                    key="what_helped",
                    question="What, if anything, helped you feel more settled?",
                    field_type="text",
                    required=False,
                    sensitive=True,
                ),
                guava.Field(
                    key="follow_up_requested",
                    question="Would you like your therapist to follow up?",
                    field_type="multiple_choice",
                    choices=["yes", "no"],
                    sensitive=True,
                ),
            ],
            completion_criteria=(
                "All required fields are resolved, including explicit confirmation of whether clinician "
                "follow-up is requested. Optional information may be skipped if the person declines."
            ),
        )

    @agent.on_task_complete("post_event_checkin")
    def on_checkin_complete(call: guava.Call) -> None:
        update_state(status="processing", message="Structuring clinician record")
        call.hangup(
            "Thank them warmly, say their check-in will be available for clinician review, and end the call."
        )

    @agent.on_session_end
    def on_session_end(call: guava.Call, event: BotSessionEnded) -> None:
        record = build_event(call, event.termination_reason)
        save_event(record)
        update_state(
            status="completed",
            message="Clinician record ready",
            latest_event=record,
        )

    @agent.on_outbound_failed
    def on_outbound_failed(call: guava.Call, event: OutboundCallFailed) -> None:
        update_state(
            status="failed",
            message=f"Call failed: {event.error_reason}",
        )

    return agent


class DemoHandler(BaseHTTPRequestHandler):
    server_version = "AfterPulseDemo/1.0"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self._json(200, {"ok": True})
        elif path == "/state":
            self._json(200, state_snapshot())
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/call":
            self._start_call()
        elif path == "/reset":
            update_state(status="idle", message="Ready for wearable replay")
            self._json(200, state_snapshot())
        else:
            self._json(404, {"error": "not_found"})

    def _start_call(self) -> None:
        if not TO_NUMBER:
            self._json(503, {"error": "DEMO_PHONE_NUMBER is not configured"})
            return
        if state_snapshot()["status"] in {"dialing", "in_call", "processing"}:
            self._json(409, {"error": "A check-in is already active"})
            return

        update_state(status="dialing", message="Calling the consented iPhone")
        threading.Thread(target=place_call, daemon=True).start()
        self._json(202, state_snapshot())

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[bridge] {format % args}")


agent: guava.Agent | None = None


def place_call() -> None:
    try:
        assert agent is not None
        agent.call_phone(
            from_number=FROM_NUMBER,
            to_number=TO_NUMBER,
            variables={"consent": "Patient opted in from the AfterPulse app"},
        )
    except Exception as exc:
        update_state(status="failed", message=f"Unable to start call: {exc}")


def self_test() -> None:
    class FakeCall:
        values = {
            "trigger_context": "crowded train",
            "symptoms": "tight chest",
            "peak_intensity": 8,
            "current_intensity": 3,
            "what_helped": None,
            "follow_up_requested": "yes",
        }

        def get_field(self, key: str) -> Any:
            return self.values.get(key)

    record = build_event(FakeCall(), "user-hangup")  # type: ignore[arg-type]
    assert record["completeness"] == {"answered": 5, "total": 6}
    assert record["answers"]["follow_up_requested"] == "yes"
    print("self-test passed")


def main() -> None:
    global agent
    if "--self-test" in sys.argv:
        self_test()
        return

    state["latest_event"] = load_latest_event()
    agent = create_agent()
    server = ThreadingHTTPServer((HOST, PORT), DemoHandler)
    print(f"AfterPulse bridge ready at http://{HOST}:{PORT}")
    print(f"Guava caller: {FROM_NUMBER}; destination configured: {'yes' if TO_NUMBER else 'no'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
