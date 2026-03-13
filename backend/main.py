from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents.content_agent import run_content_agent
from agents.email_agent import run_email_agent
from agents.qa_agent import run_qa_agent
from agents.scheduler_agent import run_scheduler_agent
from orchestrator import swarm_app
from state import SwarmState


class ContentRequest(BaseModel):
    event_name: str
    raw_text: str
    target_audience: str


class ScheduleRequest(BaseModel):
    events: List[dict]


class SwarmRequest(BaseModel):
    event_name: str
    raw_text: str
    target_audience: str
    csv_path: str
    email_template: str
    events: List[dict]


class QARequest(BaseModel):
    question: str
    event_name: str
    schedule: List[dict]
    generated_posts: Dict[str, Any]


app = FastAPI(title="Event Logistics Swarm API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "Backend is running!"}


@app.post("/api/content")
async def content_endpoint(payload: ContentRequest):
    try:
        result = run_content_agent(
            event_name=payload.event_name,
            raw_text=payload.raw_text,
            target_audience=payload.target_audience,
        )
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/api/email")
async def email_endpoint(
    file: UploadFile = File(...),
    template: str = Form(...),
):
    file_path: Optional[Path] = None
    try:
        file_path = UPLOAD_DIR / file.filename
        contents = await file.read()
        file_path.write_bytes(contents)

        from agents.email_agent import run
        
        result = run(csv_path=str(file_path), email_template=template)
        return result
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if file_path and file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass


@app.post("/api/schedule")
async def schedule_endpoint(payload: ScheduleRequest):
    try:
        result = run_scheduler_agent(payload.events)
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/swarm/run")
async def swarm_run_endpoint(payload: SwarmRequest):
    try:
        initial_state: SwarmState = {
            "event_name": payload.event_name,
            "raw_text": payload.raw_text,
            "target_audience": payload.target_audience,
            "csv_path": payload.csv_path,
            "email_template": payload.email_template,
            "events": payload.events,
            "generated_posts": {},
            "schedule": [],
            "email_results": {},
            "conflicts_found": False,
            "changes": [],
            "last_agent": "",
            "messages": [],
            "activity_log": [],
        }

        result: Dict[str, Any] = swarm_app.invoke(initial_state)

        return {
            "activity_log": result.get("activity_log", []),
            "generated_posts": result.get("generated_posts", {}),
            "schedule": result.get("schedule", []),
            "email_results": result.get("email_results", {}),
            "conflicts_found": result.get("conflicts_found", False),
            "changes": result.get("changes", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/qa")
async def qa_endpoint(payload: QARequest):
    try:
        context: Dict[str, Any] = {
            "event_name": payload.event_name,
            "schedule": payload.schedule,
            "generated_posts": payload.generated_posts,
        }
        result = run_qa_agent(payload.question, context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
