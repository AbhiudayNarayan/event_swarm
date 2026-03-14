from pathlib import Path
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

from dotenv import load_dotenv
load_dotenv()

from db import get_db, serialize_doc, fresh_outputs

from agents.content_agent import run_content_agent
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
    event_name: str = ""
    raw_text: str = ""
    target_audience: str = ""
    csv_path: str = ""
    email_template: str = ""
    events: List[dict] = []


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


@app.post("/api/content/generate-image")
async def generate_image(request: Request):
    body = await request.json()
    prompt = body.get("prompt", "")
    style = body.get("style", "digital art")
    event_name = body.get("event_name", "")
    width = body.get("width", 1024)
    height = body.get("height", 1024)
    
    import re
    clean_prompt = re.sub(r"[^a-zA-Z0-9 ]", "", prompt)[:80]
    full_prompt = f"{event_name} {clean_prompt} {style} professional high quality"
    
    from urllib.parse import quote
    encoded = quote(full_prompt.strip())
    image_url = f"https://image.pollinations.ai/prompt/{encoded}?width={width}&height={height}&nologo=true&seed=42"
    
    return {
        "image_url": image_url,
        "prompt_used": full_prompt,
        "style": style
    }


@app.post("/api/participants/save")
async def save_participants(request: Request):
    body = await request.json()
    participants = body.get("participants", [])
    db = get_db()
    result = await db.events.update_one(
        {"is_active": True},
        {"$set": {"participants": participants}}
    )
    # Refresh app state
    updated = await db.events.find_one({"is_active": True})
    if updated:
        updated["_id"] = str(updated["_id"])
        app.state.active_event = updated
    return {"success": True, "count": len(participants)}


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


class ScheduleParseRequest(BaseModel):
    natural_text: str


class ScheduleDelayRequest(BaseModel):
    delayed_event_id: str
    delayed_event_name: str
    delay_minutes: int
    all_events: List[dict]


@app.post("/api/schedule/parse")
async def schedule_parse_endpoint(payload: ScheduleParseRequest):
    try:
        from dotenv import load_dotenv
        load_dotenv()
        import json
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        llm = ChatOpenAI(model="gpt-4o", temperature=0)
        messages = [
            SystemMessage(content="Parse the event schedule from natural language into a JSON array. Each event must have: id (E001, E002...), name, speaker (empty string if none), start_time (HH:MM 24hr), end_time (HH:MM 24hr), room. Return ONLY the raw JSON array, no markdown, no explanation."),
            HumanMessage(content=payload.natural_text)
        ]
        response = llm.invoke(messages)
        text = response.content.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed_events = json.loads(text.strip())

        # Room conflict detection: same room AND time overlap
        room_conflicts = []
        for i, e1 in enumerate(parsed_events):
            for j, e2 in enumerate(parsed_events):
                if j <= i:
                    continue
                if e1.get("room", "").strip().lower() != e2.get("room", "").strip().lower():
                    continue
                # Parse times
                try:
                    s1h, s1m = map(int, e1["start_time"].split(":"))
                    e1h, e1m = map(int, e1["end_time"].split(":"))
                    s2h, s2m = map(int, e2["start_time"].split(":"))
                    e2h, e2m = map(int, e2["end_time"].split(":"))
                    start1 = s1h * 60 + s1m
                    end1 = e1h * 60 + e1m
                    start2 = s2h * 60 + s2m
                    end2 = e2h * 60 + e2m
                    if start1 < end2 and start2 < end1:
                        overlap_start = max(start1, start2)
                        overlap_end = min(end1, end2)
                        time_overlap = f"{overlap_start // 60:02d}:{overlap_start % 60:02d} – {overlap_end // 60:02d}:{overlap_end % 60:02d}"
                        room_conflicts.append({
                            "event1_name": e1["name"],
                            "event2_name": e2["name"],
                            "room": e1["room"],
                            "time_overlap": time_overlap
                        })
                except Exception:
                    pass

        return {
            "events": parsed_events,
            "room_conflicts": room_conflicts,
            "has_room_conflicts": len(room_conflicts) > 0
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/schedule/delay")
async def schedule_delay_endpoint(payload: ScheduleDelayRequest):
    try:
        from dotenv import load_dotenv
        load_dotenv()
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        all_events = payload.all_events
        delayed_id = payload.delayed_event_id
        delay_mins = payload.delay_minutes

        delayed_event = next((e for e in all_events if e.get("id") == delayed_id), None)
        if not delayed_event:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=400, content={"error": "Event not found"})

        # Compute new end time
        try:
            eh, em = map(int, delayed_event["end_time"].split(":"))
            orig_end_mins = eh * 60 + em
            new_end_mins = orig_end_mins + delay_mins
            new_end_time = f"{new_end_mins // 60:02d}:{new_end_mins % 60:02d}"
        except Exception:
            new_end_time = delayed_event["end_time"]
            orig_end_mins = 0

        # Find affected events
        affected_events = []
        delayed_speaker = delayed_event.get("speaker", "").strip()
        delayed_room = delayed_event.get("room", "").strip()

        for ev in all_events:
            if ev.get("id") == delayed_id:
                continue
            try:
                sh, sm = map(int, ev["start_time"].split(":"))
                ev_start = sh * 60 + sm
            except Exception:
                continue

            reason = None
            if ev.get("room", "").strip().lower() == delayed_room.lower():
                if orig_end_mins <= ev_start < new_end_mins:
                    reason = "room"
            if not reason and delayed_speaker and ev.get("speaker", "").strip().lower() == delayed_speaker.lower():
                if orig_end_mins <= ev_start < new_end_mins:
                    reason = "speaker"
            if reason:
                affected_events.append({
                    "id": ev.get("id"),
                    "name": ev.get("name"),
                    "start_time": ev.get("start_time"),
                    "room": ev.get("room"),
                    "reason": reason
                })

        # GPT-4o impact summary
        llm = ChatOpenAI(model="gpt-4o", temperature=0.4)
        user_prompt = f"Event: {payload.delayed_event_name} ran {delay_mins} minutes over. Affected sessions: {affected_events}. Full schedule: {all_events}"
        messages = [
            SystemMessage(content="You are an event operations assistant. An event has run over time. Based on the delay and affected sessions, write a concise impact summary and suggest specific time adjustments. Be practical, max 4 sentences."),
            HumanMessage(content=user_prompt)
        ]
        gpt_response = llm.invoke(messages)
        suggestion = gpt_response.content.strip()

        affected_names = [a["name"] for a in affected_events]
        notification_message = (
            f"⚠️ Schedule Update: {payload.delayed_event_name} ran {delay_mins} mins late. "
            + (f"Affected: {', '.join(affected_names)}. " if affected_names else "No downstream sessions affected. ")
            + suggestion
        )

        # Persist to MongoDB so swarm context and history can access it
        from datetime import datetime, timezone
        change_doc = {
            "event_name":      payload.delayed_event_name,
            "delay_minutes":   delay_mins,
            "new_end_time":    new_end_time,
            "affected_emails": [],  # populated by email_agent later
            "changes":         [f"{payload.delayed_event_name} delayed by {delay_mins} min. New end: {new_end_time}"]  +
                                   [f"Affected: {a['name']} ({a['reason']})" for a in affected_events],
            "trigger":         f"Manual delay report: {payload.delayed_event_name} +{delay_mins}min",
            "timestamp":       datetime.now(timezone.utc).isoformat(),
        }
        try:
            db = get_db()
            await db.events.update_one(
                {"is_active": True},
                {"$push": {"outputs.schedule_changes": change_doc}}
            )
            updated = await db.events.find_one({"is_active": True})
            if updated:
                updated["_id"] = str(updated["_id"])
                app.state.active_event = updated
        except Exception:
            pass  # DB write failure should not block the response

        return {
            "delayed_event": payload.delayed_event_name,
            "delay_minutes": delay_mins,
            "new_end_time": new_end_time,
            "affected_events": affected_events,
            "suggestion": suggestion,
            "notification_message": notification_message
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


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

class EmailSendRequest(BaseModel):
    preview: List[dict]

@app.post("/api/email/send")
async def email_send_endpoint(payload: EmailSendRequest):
    try:
        from dotenv import load_dotenv
        load_dotenv()
        
        gmail_user = os.getenv("GMAIL_USER")
        gmail_password = os.getenv("GMAIL_APP_PASSWORD")

        if not gmail_user or not gmail_password:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=500, content={"error": "Gmail credentials not configured in .env"})

        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(gmail_user, gmail_password)

        count = 0
        for item in payload.preview:
            msg = MIMEMultipart()
            msg["From"] = gmail_user
            msg["To"] = item["email"]
            msg["Subject"] = item["subject"]
            msg.attach(MIMEText(item["body"], "plain"))
            
            server.sendmail(gmail_user, item["email"], msg.as_string())
            count += 1
            
        server.quit()

        return {
            "sent": count,
            "status": "dispatched",
            "message": f"Successfully sent {count} emails via Gmail"
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})

from datetime import datetime

class TrackerLoadRequest(BaseModel):
    events: List[dict]

@app.post("/api/tracker/load")
async def tracker_load_endpoint(payload: TrackerLoadRequest):
    try:
        now = datetime.now()
        current_total_minutes = now.hour * 60 + now.minute

        enriched_events = []
        live_count = 0
        upcoming_count = 0
        ended_count = 0

        for ev in payload.events:
            start_str = ev.get("start", "00:00")
            end_str = ev.get("end", "00:00")
            
            try:
                sh, sm = map(int, start_str.split(":"))
                start_mins = sh * 60 + sm
            except Exception:
                start_mins = 0
                
            try:
                eh, em = map(int, end_str.split(":"))
                end_mins = eh * 60 + em
            except Exception:
                end_mins = 0

            if current_total_minutes < start_mins:
                status = "upcoming"
                upcoming_count += 1
                sec_rem = (start_mins - current_total_minutes) * 60
            elif current_total_minutes >= end_mins:
                status = "ended"
                ended_count += 1
                sec_rem = 0
            else:
                status = "live"
                live_count += 1
                sec_rem = (end_mins - current_total_minutes) * 60

            ev_copy = dict(ev)
            ev_copy["status"] = status
            ev_copy["seconds_remaining"] = sec_rem
            enriched_events.append(ev_copy)

        return {
            "events": enriched_events,
            "total": len(enriched_events),
            "live_count": live_count,
            "upcoming_count": upcoming_count,
            "ended_count": ended_count
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


class TrackerFeedbackRequest(BaseModel):
    event_id: str
    event_name: str
    ran_on_time: bool
    issues: str
    rating: int
    next_event_name: str
    delay_minutes: int

@app.post("/api/tracker/feedback")
async def tracker_feedback_endpoint(payload: TrackerFeedbackRequest):
    try:
        from dotenv import load_dotenv
        load_dotenv()

        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
        system_prompt = "You are an intelligent event operations assistant helping manage a live technical hackathon. Based on organizer feedback about a completed session, provide a brief actionable recommendation for the next session. Be specific, concise, and practical. Maximum 3 sentences."
        
        user_prompt = f"""Event completed: {payload.event_name}
Ran on time: {payload.ran_on_time}
Issues: {payload.issues if payload.issues else 'None'}
Rating: {payload.rating}/5
Delay: {payload.delay_minutes} minutes
Next event: {payload.next_event_name}
What adjustments should be made for the next event?
"""
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]
        
        response = llm.invoke(messages)
        
        return {
            "event_id": payload.event_id,
            "event_name": payload.event_name,
            "suggestion": response.content,
            "status": "processed"
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


# ════════════════════════════════════════════════
# PHASE B — GPT-4o Parse Endpoints (NEW)
# ════════════════════════════════════════════════

SAMPLE_DATA_DIR = Path(__file__).parent / "sample_data"


class ParseTextRequest(BaseModel):
    plain_text: str = ""


def _call_gpt(system_prompt: str, user_content: str) -> str:
    """Helper: call GPT-4o and return raw string response."""
    from dotenv import load_dotenv
    load_dotenv()
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    resp = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_content)])
    text = resp.content.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


@app.post("/api/parse/schedule")
async def parse_schedule_endpoint(
    file: Optional[UploadFile] = File(None),
    plain_text: str = Form(""),
):
    """Accept a JSON/CSV file OR plain text, return normalised event list."""
    try:
        raw_content = ""
        if file and file.filename:
            raw_bytes = await file.read()
            raw_content = raw_bytes.decode("utf-8", errors="replace")
        elif plain_text.strip():
            raw_content = plain_text.strip()
        else:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=400, content={"error": "Provide a file or plain_text"})

        system = (
            "You are an event schedule parser. Convert the input (which may be a JSON array, CSV, or "
            "plain English description) into a JSON array of events. "
            "Each event MUST have these fields: id (E001, E002...), name, speaker (empty string if none), "
            "day (integer 1-4), start_time (HH:MM 24hr), end_time (HH:MM 24hr), room, status ('upcoming'), track. "
            "Return ONLY the raw JSON array, no markdown, no explanation. "
            "Normalise inconsistent or missing fields gracefully."
        )
        parsed_text = _call_gpt(system, raw_content)
        events = json.loads(parsed_text)

        # Auto-assign IDs if missing
        for i, ev in enumerate(events):
            if not ev.get("id"):
                ev["id"] = f"E{str(i+1).zfill(3)}"

        # Count days and rooms for summary
        days = sorted(set(ev.get("day", 1) for ev in events))
        rooms = sorted(set(ev.get("room", "") for ev in events if ev.get("room")))
        summary = f"Found {len(events)} events across {len(days)} day(s) in {len(rooms)} venue(s)"

        return {"events": events, "summary": summary}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/parse/participants")
async def parse_participants_endpoint(
    file: Optional[UploadFile] = File(None),
    plain_text: str = Form(""),
):
    """Accept a CSV file OR plain text, return normalised participant list."""
    try:
        raw_content = ""
        if file and file.filename:
            raw_bytes = await file.read()
            raw_content = raw_bytes.decode("utf-8", errors="replace")
        elif plain_text.strip():
            raw_content = plain_text.strip()
        else:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=400, content={"error": "Provide a file or plain_text"})

        system = (
            "You are a participant list parser. Convert the input (CSV, plain text, or JSON) into a "
            "JSON array of participants. Each entry MUST have: "
            "name, email, role (one of: participant/mentor/judge/speaker/volunteer), team_name, college. "
            "Fill in 'Unknown' for any missing field except email (use 'unknown@example.com'). "
            "Return ONLY the raw JSON array, no markdown, no explanation."
        )
        parsed_text = _call_gpt(system, raw_content)
        participants = json.loads(parsed_text)

        # Count by role for summary
        role_counts: Dict[str, int] = {}
        for p in participants:
            role = p.get("role", "unknown")
            role_counts[role] = role_counts.get(role, 0) + 1
        role_str = ", ".join(f"{v} {k}s" for k, v in role_counts.items())
        summary = f"Found {len(participants)} people: {role_str}"

        return {"participants": participants, "summary": summary}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/parse/sponsors")
async def parse_sponsors_endpoint(
    file: Optional[UploadFile] = File(None),
    plain_text: str = Form(""),
):
    """Accept a CSV file OR plain text, return normalised sponsor list."""
    try:
        raw_content = ""
        if file and file.filename:
            raw_bytes = await file.read()
            raw_content = raw_bytes.decode("utf-8", errors="replace")
        elif plain_text.strip():
            raw_content = plain_text.strip()
        else:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=400, content={"error": "Provide a file or plain_text"})

        system = (
            "You are a sponsor list parser. Convert the input (CSV, plain text, or JSON) into a "
            "JSON array of sponsors. Each entry MUST have: "
            "company, industry, contact_email, tier (one of: gold/silver/bronze). "
            "Fill in 'Unknown' for any missing field. "
            "Return ONLY the raw JSON array, no markdown, no explanation."
        )
        parsed_text = _call_gpt(system, raw_content)
        sponsors = json.loads(parsed_text)

        tier_counts: Dict[str, int] = {}
        for s in sponsors:
            tier = s.get("tier", "unknown")
            tier_counts[tier] = tier_counts.get(tier, 0) + 1
        tier_str = ", ".join(f"{v} {k}" for k, v in tier_counts.items())
        summary = f"Found {len(sponsors)} sponsors: {tier_str}"

        return {"sponsors": sponsors, "summary": summary}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


class ScenarioRequest(BaseModel):
    scenario: str  # "delay" | "cancel" | "sponsor" | "morning_brief"
    context: Dict[str, Any] = {}


@app.post("/api/swarm/scenario")
async def swarm_scenario_endpoint(payload: ScenarioRequest):
    """Run the full LangGraph swarm with a real scenario context."""
    try:
        ctx = payload.context
        scenario = payload.scenario

        if scenario == "delay":
            event_name = ctx.get("event_name", "Opening Keynote")
            delay_mins = ctx.get("delay_minutes", 20)
            room = ctx.get("room", "Hall A")
            raw_text = (
                f"DELAY ALERT: '{event_name}' in {room} is running {delay_mins} minutes late. "
                f"All downstream sessions in {room} must be shifted by {delay_mins} minutes. "
                f"Generate a public announcement post and notify affected participants."
            )
            email_template = (
                f"Hi {{name}},\n\nPlease note that '{event_name}' has been delayed by {delay_mins} minutes. "
                f"All sessions in {room} will run accordingly. We apologize for the inconvenience.\n\nThe Organizing Team"
            )
        elif scenario == "cancel":
            event_name = ctx.get("event_name", "2pm Workshop")
            room = ctx.get("room", "Room 101")
            raw_text = (
                f"CANCELLATION: The session '{event_name}' in {room} has been cancelled. "
                f"There is now a gap in {room}'s schedule. "
                f"Generate a public announcement and notify registered participants."
            )
            email_template = (
                f"Hi {{name}},\n\nWe regret to inform you that '{event_name}' has been cancelled. "
                f"We are working to fill the gap with alternative sessions. Thank you for your understanding.\n\nThe Organizing Team"
            )
        elif scenario == "sponsor":
            company = ctx.get("company", "a Tech Company")
            industry = ctx.get("industry", "Technology")
            raw_text = (
                f"SPONSOR OUTREACH: Generate personalised sponsorship pitch for '{company}' in the '{industry}' sector. "
                f"We are organising Neurathon '26, a 4-day AI hackathon with 200+ participants. "
                f"Include branding visibility, speaking slot, and on-ground benefits."
            )
            email_template = (
                f"Dear {{name}} from {company},\n\nI'm reaching out regarding a partnership opportunity "
                f"for Neurathon '26. Given your expertise in {industry}, we believe there's a strong alignment.\n\n"
                f"We'd love to discuss how {company} can gain visibility across 200+ student technologists.\n\nBest regards,\nNeurathon Team"
            )
        elif scenario == "morning_brief":
            day_num = ctx.get("day", 1)
            raw_text = (
                f"MORNING BRIEF — Day {day_num}: Prepare the day's schedule summary, opening social post, "
                f"and personalized briefing emails for each participant segment "
                f"(participants get their track schedule, mentors get their session list, judges get their panel). "
                f"This is Day {day_num} of Neurathon '26."
            )
            email_template = (
                f"Good morning {{name}},\n\nHere is your personalised schedule for Day {day_num} of Neurathon '26. "
                f"As a {{role}}, your sessions are listed below. Have a great day!\n\nThe Organizing Team"
            )
        else:
            raw_text = ctx.get("raw_text", "Run event logistics swarm for Neurathon '26")
            email_template = ctx.get("email_template", "Hi {name}, updates from the organizing team.")

        # Build initial swarm state
        initial_state: SwarmState = {
            "event_name": ctx.get("event_name", "Neurathon '26"),
            "raw_text": raw_text,
            "target_audience": ctx.get("target_audience", "students, developers, and tech enthusiasts"),
            "csv_path": str(SAMPLE_DATA_DIR / "sample_participants.csv"),
            "email_template": email_template,
            "events": ctx.get("events", []),
            "generated_posts": {},
            "schedule": [],
            "email_results": {},
            "conflicts_found": False,
            "changes": [],
            "last_agent": "",
            "messages": [],
            "activity_log": [{
                "agent": "orchestrator",
                "status": "starting",
                "timestamp": "",
                "summary": f"🎬 Scenario: {scenario.replace('_', ' ').title()} — LangGraph swarm starting..."
            }],
        }

        result: Dict[str, Any] = swarm_app.invoke(initial_state)

        return {
            "scenario": scenario,
            "activity_log": result.get("activity_log", []),
            "generated_posts": result.get("generated_posts", {}),
            "schedule": result.get("schedule", []),
            "email_results": result.get("email_results", {}),
            "conflicts_found": result.get("conflicts_found", False),
            "changes": result.get("changes", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sample-data/schedule")
async def get_sample_schedule():
    """Serve the sample schedule JSON for demo loading in the frontend."""
    try:
        data = json.loads((SAMPLE_DATA_DIR / "sample_schedule.json").read_text(encoding="utf-8"))
        return {"events": data}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/sample-data/participants")
async def get_sample_participants():
    """Serve the sample participants CSV as text for demo loading."""
    try:
        text = (SAMPLE_DATA_DIR / "sample_participants.csv").read_text(encoding="utf-8")
        return {"csv_text": text}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/sample-data/sponsors")
async def get_sample_sponsors():
    """Serve the sample sponsors CSV as text for demo loading."""
    try:
        text = (SAMPLE_DATA_DIR / "sample_sponsors.csv").read_text(encoding="utf-8")
        return {"csv_text": text}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})



# ════════════════════════════════════════════════════════════════
# MONGODB EVENT STORE  —  db.events collection
# ════════════════════════════════════════════════════════════════

EVENTS_DIR = Path(__file__).parent / "uploads" / "events"  # kept for migration only


def _event_id_from_name(name: str) -> str:
    """Convert display name → safe slug.  'Neurathon '26' → 'neurathon_26'"""
    import re
    slug = re.sub(r"[^\w\s-]", "", name.lower()).strip()
    return re.sub(r"[\s-]+", "_", slug) or "event"


async def _db_get_active_event() -> Optional[Dict]:
    """Fresh read of the active event from MongoDB — always use this, never app.state alone."""
    db = get_db()
    doc = await db.events.find_one({"is_active": True})
    return serialize_doc(doc) if doc else None


async def _db_save_event(event_id: str, data: Dict, make_active: bool = False) -> None:
    """Upsert an event document into MongoDB."""
    db = get_db()
    data["event_id"] = event_id
    if make_active:
        # Deactivate all others first
        await db.events.update_many({}, {"$set": {"is_active": False}})
        data["is_active"] = True
    if "outputs" not in data:
        data["outputs"] = fresh_outputs()
    await db.events.replace_one({"event_id": event_id}, data, upsert=True)


async def _db_load_event(event_id: str) -> Optional[Dict]:
    """Load a single event by event_id from MongoDB."""
    db = get_db()
    doc = await db.events.find_one({"event_id": event_id})
    return serialize_doc(doc) if doc else None


async def _db_list_events() -> List[Dict]:
    """List summary cards for all events."""
    db = get_db()
    events = []
    async for doc in db.events.find({}).sort("event_name", 1):
        d = serialize_doc(doc)
        events.append({
            "event_id":          d.get("event_id", ""),
            "event_name":        d.get("event_name", ""),
            "tagline":           d.get("tagline", ""),
            "venue":             d.get("venue", ""),
            "city":              d.get("city", ""),
            "dates":             d.get("dates", {}),
            "expected_footfall": d.get("expected_footfall", 0),
            "events_count":      len(d.get("schedule", [])),
            "participants_count": len(d.get("participants", [])),
            "sponsors_count":    len(d.get("sponsors", [])),
            "rooms_count":       len(d.get("rooms", [])),
            "is_active":         d.get("is_active", False),
        })
    return events


async def _migrate_json_files_to_mongo():
    """One-time migration: if db.events is empty but JSON files exist, import them."""
    db = get_db()
    count = await db.events.count_documents({})
    if count > 0:
        return  # already have data

    if not EVENTS_DIR.exists():
        return

    active_file = Path(__file__).parent / "uploads" / "active_event.txt"
    active_id = None
    if active_file.exists():
        active_id = active_file.read_text(encoding="utf-8").strip() or None

    for p in sorted(EVENTS_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            eid = p.stem
            data["event_id"] = eid
            data["is_active"] = (eid == active_id)
            if "outputs" not in data:
                data["outputs"] = fresh_outputs()
            await db.events.insert_one(data)
        except Exception:
            pass


# ── startup: migrate JSON → Mongo, load active event ────────────────────────

@app.on_event("startup")
async def startup_load_active_event():
    await _migrate_json_files_to_mongo()
    ev = await _db_get_active_event()
    if ev:
        app.state.active_event = ev
        app.state.active_event_id = ev.get("event_id")
    else:
        app.state.active_event = {}
        app.state.active_event_id = None


# ── Rich context builder ─────────────────────────────────────────────────────


def _normalize_schedule(raw) -> List[Dict]:
    """Ensure schedule is always a flat list of event dicts.

    The MongoDB document may store the schedule as:
      - a list of dicts  (expected)              → return as-is
      - a nested dict with an inner 'schedule' or 'events' key → extract the inner list
    """
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        # Try common inner keys
        for key in ("schedule", "events"):
            inner = raw.get(key)
            if isinstance(inner, list):
                return inner
        return []
        return []
    return []


def _build_participant_schedule_map(schedule: List[Dict], participants: List[Dict]) -> Dict[str, Any]:
    """Map each participant email to their profile and specific event schedule.
    
    Checks both sides mapping:
    - event.assigned_emails[]
    - participant.registered_events[]
    If neither exists for any event, assumes they are invited to all general events.
    """
    pax_map = {}
    
    # 1. Initialize profile for each participant
    for p in participants:
        if not isinstance(p, dict): continue
        email = p.get("email", "").strip().lower()
        if not email: continue
        
        pax_map[email] = {
            "name": p.get("name", "Participant"),
            "role": p.get("role", "participant"),
            "team": p.get("team_name", ""),
            "track": p.get("track", ""),
            "events": []
        }
        
    # 2. Map events to participants
    for e in schedule:
        if not isinstance(e, dict): continue
        
        evt_id = e.get("id", "")
        assigned_emails = [em.strip().lower() for em in e.get("assigned_emails", [])]
        
        event_mini = {
            "name": e.get("name", "Unnamed Event"),
            "time": f"{e.get('start_time', '')}-{e.get('end_time', '')}".strip("-"),
            "room": e.get("room", "TBD")
        }
        
        for p in participants:
            if not isinstance(p, dict): continue
            email = p.get("email", "").strip().lower()
            if not email or email not in pax_map: continue
            
            # Check if participant is assigned to this event
            is_assigned = email in assigned_emails
            # Or if participant document says they registered for it
            registered_events = p.get("registered_events", [])
            if evt_id and evt_id in registered_events:
                is_assigned = True
                
            # Fallback: if data has no assignments at all, assign to all events (for demo purposes)
            if not assigned_emails and not registered_events:
                is_assigned = True
                
            if is_assigned:
                pax_map[email]["events"].append(event_mini)

    return pax_map


def _build_agent_context(event: Dict) -> str:
    """Build a structured system-prompt context block from a full event dict."""
    if not event:
        return "No event context loaded yet."

    name       = event.get("event_name", "Unknown Event")
    tagline    = event.get("tagline", "")
    theme      = event.get("theme", "")
    venue      = event.get("venue", "TBD")
    city       = event.get("city", "")
    footfall   = event.get("expected_footfall", "?")
    dates      = event.get("dates", {})
    start_d    = dates.get("start", "?")
    end_d      = dates.get("end", "?")
    total_days = dates.get("total_days", "?")
    organiser  = event.get("organiser", {})
    branding   = event.get("branding", {})
    hashtags   = " ".join(branding.get("hashtags", []))

    schedule     = _normalize_schedule(event.get("schedule", []))
    participants = event.get("participants", [])
    rooms        = event.get("rooms", [])
    resources    = event.get("resources", [])
    sponsors     = event.get("sponsors", [])
    content_plan = event.get("content_plan", {})

    # People counts per role
    role_counts: Dict[str, int] = {}
    for p in participants:
        if isinstance(p, dict):
            r = p.get("role", "participant")
            role_counts[r] = role_counts.get(r, 0) + 1

    # Next upcoming event
    from datetime import datetime
    now_str = datetime.now().strftime("%H:%M")
    
    upcoming = [e for e in schedule if isinstance(e, dict) and e.get("status") in ("upcoming", "scheduled", "")]
    upcoming.sort(key=lambda e: (e.get("day", 99), e.get("start_time", "99:99")))
    next_ev = upcoming[0] if upcoming else None
    next_line = (
        f"Next: {next_ev.get('name','?')} at {next_ev.get('start_time','')} "
        f"in {next_ev.get('room','')} (Day {next_ev.get('day','')})"
        if next_ev else "No upcoming events."
    )

    # Schedule summary by day
    sched_lines = []
    days: Dict[int, list] = {}
    for e in schedule:
        if isinstance(e, dict):
            d = e.get("day", 1)
            days.setdefault(d, []).append(e)
    for d in sorted(days.keys()):
        evs = days[d]
        sched_lines.append(f"  Day {d}: {len(evs)} events → " +
                           ", ".join(f"{e.get('name','')} ({e.get('start_time','')}–{e.get('end_time','')}) @{e.get('room','')}" for e in evs[:4] if isinstance(e, dict)) +
                           (f" +{len(evs)-4} more" if len(evs) > 4 else ""))

    # Sponsors
    sponsor_lines = []
    for s in sponsors:
        if isinstance(s, dict):
            sponsor_lines.append(f"  {s.get('company','?')} [{s.get('tier','?')} tier] — contact: {s.get('contact_email','?')}")

    # Resources
    proj_count = sum(1 for r in resources if isinstance(r, dict) and "projector" in r.get("type", "").lower())
    mic_count  = sum(1 for r in resources if isinstance(r, dict) and "mic" in r.get("type", "").lower())

    # Build Participant Map
    participant_map = _build_participant_schedule_map(schedule, participants)
    participant_map_json = json.dumps(participant_map, indent=2) if participant_map else "{}"

    ctx = f"""You are managing: {name}{"— " + tagline if tagline else ""}
Theme: {theme or "N/A"} | Dates: {start_d} to {end_d} ({total_days} days) | Venue: {venue}, {city}
Expected footfall: {footfall} | Organiser: {organiser.get("name","N/A")} ({organiser.get("email","N/A")})
Hashtags: {hashtags or "N/A"}  Instagram: {branding.get("instagram","N/A")}  Twitter: {branding.get("twitter","N/A")}

SCHEDULE: {len(schedule)} total events across {len(days)} days in {len(rooms) or "?"} venues
{chr(10).join(sched_lines) if sched_lines else "  (No schedule loaded yet)"}
{next_line}

PARTICIPANT SCHEDULE MAP:
This map ties every participant to their personal list of events:
{participant_map_json}

PEOPLE: {len(participants)} total
  Participants: {role_counts.get("participant",0)} | Mentors: {role_counts.get("mentor",0)} | Judges: {role_counts.get("judge",0)} | Speakers: {role_counts.get("speaker",0)} | Volunteers: {role_counts.get("volunteer",0)}

SPONSORS ({len(sponsors)}):
{chr(10).join(sponsor_lines) if sponsor_lines else "  (No sponsors loaded yet)"}

RESOURCES: Projectors: {proj_count} | Mics: {mic_count} | Total resources: {len(resources)}

ROOMS ({len(rooms)}): {", ".join(r.get("name","?") for r in rooms if isinstance(r, dict)) or "Not loaded yet"}

CONTENT PLAN: Countdown starts: {content_plan.get("countdown_posts_start","?")} days before | Post times: {content_plan.get("posting_times",{})}
"""
    return ctx.strip()


# ════════════════════════════════════════════════════════════════
# EVENT CRUD ENDPOINTS
# ════════════════════════════════════════════════════════════════

@app.get("/api/events")
async def list_events():
    """Return summary cards for all stored events."""
    events = await _db_list_events()
    active_id = None
    for e in events:
        if e.get("is_active"):
            active_id = e["event_id"]
            break
    return {"events": events, "active_event_id": active_id}


@app.get("/api/events/active")
async def get_active_event():
    """Return summary for the currently active event (for EventContext)."""
    ev = await _db_get_active_event()
    if not ev:
        return {"loaded": False, "event_id": None, "event_name": None}
    return {
        "loaded":             True,
        "event_id":           ev.get("event_id"),
        "event_name":         ev.get("event_name", ""),
        "tagline":            ev.get("tagline", ""),
        "venue":              ev.get("venue", ""),
        "city":               ev.get("city", ""),
        "dates":              ev.get("dates", {}),
        "expected_footfall":  ev.get("expected_footfall", 0),
        "events_count":       len(ev.get("schedule", [])),
        "participants_count": len(ev.get("participants", [])),
        "sponsors_count":     len(ev.get("sponsors", [])),
        "organiser":          ev.get("organiser", {}),
        "branding":           ev.get("branding", {}),
        "schedule":           ev.get("schedule", []),
        "participants":       ev.get("participants", []),
    }


@app.get("/api/events/{event_id}")
async def get_event(event_id: str):
    """Return full event data for a given event_id."""
    data = await _db_load_event(event_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")
    return data


@app.post("/api/events/{event_id}/activate")
async def activate_event(event_id: str):
    """Set the active event via MongoDB is_active flag."""
    data = await _db_load_event(event_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")
    db = get_db()
    await db.events.update_many({}, {"$set": {"is_active": False}})
    await db.events.update_one({"event_id": event_id}, {"$set": {"is_active": True}})
    # Refresh app.state
    fresh = await _db_get_active_event()
    app.state.active_event = fresh or {}
    app.state.active_event_id = event_id
    return {"status": "ok", "active_event_id": event_id, "event_name": data.get("event_name")}


@app.delete("/api/events/{event_id}")
async def delete_event(event_id: str):
    """Delete an event from MongoDB. Clears active if needed."""
    db = get_db()
    existing = await _db_load_event(event_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")
    was_active = existing.get("is_active", False)
    await db.events.delete_one({"event_id": event_id})
    if was_active:
        app.state.active_event = {}
        app.state.active_event_id = None
    return {"status": "deleted", "event_id": event_id}


# ════════════════════════════════════════════════════════════════
# POST /api/setup/context — create / update event (full data model)
# ════════════════════════════════════════════════════════════════

class SetupContextRequest(BaseModel):
    event_name: str
    event_date: str = ""
    venue: str = ""
    target_audience: str = ""
    description: str = ""
    key_speakers: str = ""
    email_template: str = ""
    schedule_json: str = ""
    participants_csv: str = ""


def _gpt_parse(system_prompt: str, user_text: str) -> Any:
    """Helper: call GPT-4o to parse text into structured data. Returns parsed Python obj."""
    from dotenv import load_dotenv
    load_dotenv()
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    resp = llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_text[:4000])])
    text = resp.content.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def _parse_schedule(raw: str) -> List[Dict]:
    """Direct JSON parse, GPT-4o fallback."""
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            valid = [x for x in parsed if isinstance(x, dict)]
            if valid: return valid
    except Exception:
        pass
    # GPT fallback
    try:
        parsed_gpt = _gpt_parse(
            "Convert this schedule data to a JSON array of events. Each event must have: "
            "id (e001…), name, type (keynote/workshop/hackathon/panel/ceremony/networking/cultural), "
            "day (int), date, start_time (HH:MM), end_time (HH:MM), room, track, speaker_id, "
            "description, capacity (int), registered (int), status (upcoming), "
            "equipment (list), conflict (bool). Return ONLY the raw JSON array. DO NOT output strings.",
            raw,
        )
        if isinstance(parsed_gpt, list):
            return [x for x in parsed_gpt if isinstance(x, dict)]
        return []
    except Exception:
        return []


def _parse_participants(csv_text: str) -> List[Dict]:
    """CSV DictReader first, GPT-4o fallback."""
    import io, csv as csvlib
    participants: List[Dict] = []
    try:
        reader = csvlib.DictReader(io.StringIO(csv_text))
        for row in reader:
            norm = {k.strip().lower(): (v or "").strip() for k, v in row.items()}
            name    = norm.get("name", "")
            email   = norm.get("email", "")
            role    = norm.get("role", "participant")
            team    = norm.get("team_name", norm.get("team", ""))
            college = norm.get("college", norm.get("institution", ""))
            phone   = norm.get("phone", "")
            track   = norm.get("track", "")
            dietary = norm.get("dietary", norm.get("dietary_requirement", ""))
            payment = norm.get("payment_status", norm.get("payment", ""))
            if name or email:
                p: Dict[str, Any] = {
                    "id": f"p{len(participants)+1:03d}",
                    "name": name, "email": email, "phone": phone,
                    "role": role, "college": college, "team_name": team,
                    "track": track, "dietary": dietary, "payment_status": payment,
                    "registered_events": [],
                }
                # Role-specific extra fields
                if role == "speaker":
                    p["bio"] = norm.get("bio", "")
                    p["talk_title"] = norm.get("talk_title", "")
                    p["av_requirements"] = norm.get("av_requirements", "")
                elif role == "judge":
                    p["panel"] = norm.get("panel", "")
                    p["judging_criteria"] = norm.get("judging_criteria", "")
                elif role == "mentor":
                    p["expertise"] = norm.get("expertise", "")
                    p["assigned_teams"] = []
                elif role == "volunteer":
                    p["duty_assignment"] = norm.get("duty_assignment", "")
                    p["shift_timing"] = norm.get("shift_timing", "")
                participants.append(p)
    except Exception:
        pass
    if not participants and csv_text.strip():
        try:
            participants = _gpt_parse(
                "Convert this data to a JSON array of participants. Each: id (p001…), name, email, "
                "phone, role (participant/mentor/judge/speaker/volunteer), college, team_name, track, "
                "dietary, payment_status, registered_events (empty list). Return ONLY the raw JSON array.",
                csv_text,
            )
        except Exception:
            participants = []
    return participants


@app.post("/api/setup/context")
async def save_setup_context(
    event_name: str = Form(""),
    event_date: str = Form(""),
    venue: str = Form(""),
    city: str = Form(""),
    target_audience: str = Form(""),
    description: str = Form(""),
    key_speakers: str = Form(""),
    email_template: str = Form(""),
    tagline: str = Form(""),
    theme: str = Form(""),
    expected_footfall: str = Form(""),
    organiser_name: str = Form(""),
    organiser_email: str = Form(""),
    organiser_phone: str = Form(""),
    hashtags: str = Form(""),
    instagram: str = Form(""),
    twitter: str = Form(""),
    wifi_password: str = Form(""),
    # schedule — three intake paths
    schedule_file: Optional[UploadFile] = File(None),
    schedule_json: str = Form(""),
    schedule_natural: str = Form(""),
    # participants — three intake paths
    participants_file: Optional[UploadFile] = File(None),
    participants_csv: str = Form(""),
    participants_natural: str = Form(""),
    # rooms + sponsors (plain text or JSON)
    rooms_natural: str = Form(""),
    rooms_json: str = Form(""),
    sponsors_natural: str = Form(""),
    sponsors_json: str = Form(""),
):
    """Create or update a full event. Saves to disk + activates as the current event."""

    # ── Core metadata ────────────────────────────────────────────────────────
    event_id = _event_id_from_name(event_name) if event_name.strip() else "event"

    # Load existing data if updating
    existing = (await _db_load_event(event_id)) or {}

    # Date range
    start_date = event_date  # kept for backward compat (single date)
    total_days_val = existing.get("dates", {}).get("total_days", 1)

    hashtag_list = [h.strip() for h in hashtags.replace(",", " ").split() if h.strip()]

    core: Dict[str, Any] = {
        "event_id":           event_id,
        "event_name":         event_name or existing.get("event_name", ""),
        "tagline":            tagline or existing.get("tagline", ""),
        "theme":              theme or existing.get("theme", ""),
        "dates": {
            "start":       event_date or existing.get("dates", {}).get("start", ""),
            "end":         existing.get("dates", {}).get("end", event_date),
            "total_days":  total_days_val,
        },
        "venue":              venue or existing.get("venue", ""),
        "city":               city or existing.get("city", ""),
        "expected_footfall":  int(expected_footfall) if expected_footfall.strip().isdigit() else existing.get("expected_footfall", 0),
        "organiser": {
            "name":            organiser_name or existing.get("organiser", {}).get("name", ""),
            "email":           organiser_email or existing.get("organiser", {}).get("email", ""),
            "emergency_phone": organiser_phone or existing.get("organiser", {}).get("emergency_phone", ""),
        },
        "branding": {
            "hashtags":  hashtag_list or existing.get("branding", {}).get("hashtags", []),
            "instagram": instagram or existing.get("branding", {}).get("instagram", ""),
            "twitter":   twitter or existing.get("branding", {}).get("twitter", ""),
        },
        "wifi_password":  wifi_password or existing.get("wifi_password", ""),
        "target_audience": target_audience or existing.get("target_audience", ""),
        "description":     description or existing.get("description", ""),
        "key_speakers":    key_speakers or existing.get("key_speakers", ""),
        "email_template":  email_template or existing.get("email_template", ""),
    }

    # ── Schedule ─────────────────────────────────────────────────────────────
    events: List[Dict] = existing.get("schedule", [])
    raw_sched = schedule_json.strip() or schedule_natural.strip()
    if schedule_file and schedule_file.filename:
        sched_bytes = await schedule_file.read()
        raw_sched = sched_bytes.decode("utf-8", errors="replace")

    if raw_sched:
        parsed = _parse_schedule(raw_sched)
        if parsed:
            events = parsed

    # ── Participants ──────────────────────────────────────────────────────────
    participants: List[Dict] = existing.get("participants", [])
    csv_text = participants_csv
    if participants_file and participants_file.filename:
        raw_bytes = await participants_file.read()
        csv_text = raw_bytes.decode("utf-8", errors="replace")
    if not csv_text.strip() and participants_natural.strip():
        csv_text = participants_natural   # natural language → GPT-4o parse
    if csv_text.strip():
        parsed_p = _parse_participants(csv_text)
        if parsed_p:
            participants = parsed_p

    # ── Rooms ─────────────────────────────────────────────────────────────────
    rooms: List[Dict] = existing.get("rooms", [])
    raw_rooms = rooms_json.strip() or rooms_natural.strip()
    if raw_rooms:
        try:
            rooms = _gpt_parse(
                "Convert this to a JSON array of rooms. Each: room_id (hall_a, room_101…), "
                "name, capacity (int), equipment (list of strings), floor, accessible (bool). "
                "Return ONLY the raw JSON array.",
                raw_rooms,
            )
        except Exception:
            rooms = existing.get("rooms", [])

    # ── Sponsors ──────────────────────────────────────────────────────────────
    sponsors: List[Dict] = existing.get("sponsors", [])
    raw_sponsors = sponsors_json.strip() or sponsors_natural.strip()
    if raw_sponsors:
        try:
            sponsors = _gpt_parse(
                "Convert this to a JSON array of sponsors. Each: id (sp001…), company, tier "
                "(title/gold/silver/bronze/community), industry, contact_name, contact_email, "
                "contact_phone, amount (int), payment_received (bool), benefits (list), "
                "outreach_status (contacted/followup_sent/confirmed/declined). "
                "Return ONLY the raw JSON array.",
                raw_sponsors,
            )
        except Exception:
            sponsors = existing.get("sponsors", [])

    # ── Content plan defaults ─────────────────────────────────────────────────
    content_plan: Dict = existing.get("content_plan", {
        "countdown_posts_start": 7,
        "day_of_templates": {
            "morning_brief":      "Good morning! Day {day} of {event_name} starts NOW...",
            "event_starting":     "{event_name} starting in 10 mins in {room}!",
            "delay_announcement": "Heads up! {event_name} is running {minutes} mins late...",
            "cancellation":       "Update: {event_name} in {room} has been cancelled.",
            "emergency":          "URGENT: {message} — follow volunteer instructions.",
        },
        "posting_times": {
            "twitter":   ["08:00", "12:00", "18:00"],
            "linkedin":  ["09:00", "17:00"],
            "instagram": ["10:00", "20:00"],
        },
        "sponsor_spotlight_schedule": [],
        "speaker_spotlight_schedule": [],
    })

    # ── Assemble + persist ────────────────────────────────────────────────────
    full_event: Dict[str, Any] = {
        **core,
        "schedule":     events,
        "participants": participants,
        "rooms":        rooms,
        "resources":    existing.get("resources", []),
        "sponsors":     sponsors,
        "content_plan": content_plan,
    }

    await _db_save_event(event_id, full_event, make_active=True)
    fresh = await _db_get_active_event()
    app.state.active_event = fresh or full_event
    app.state.active_event_id = event_id

    role_counts: Dict[str, int] = {}
    for p in participants:
        r = p.get("role", "participant")
        role_counts[r] = role_counts.get(r, 0) + 1

    return {
        "status":               "ok",
        "event_id":             event_id,
        "event_name":           event_name,
        "events_loaded":        len(events),
        "participants_loaded":  len(participants),
        "rooms_loaded":         len(rooms),
        "sponsors_loaded":      len(sponsors),
        "role_summary":         role_counts,
    }


# ════════════════════════════════════════════════════════════════
# GET /api/setup/context/status  — backward-compat status check
# ════════════════════════════════════════════════════════════════

@app.get("/api/setup/context/status")
async def context_status(event_name: str = ""):
    """Check if context has been loaded for a given event_name. Reads from MongoDB."""
    ev = await _db_get_active_event() or {}
    eid = ev.get("event_id") if ev else None

    # If a specific event_name was requested, try to find it
    if event_name.strip():
        candidate_id = _event_id_from_name(event_name)
        candidate = (await _db_load_event(candidate_id)) or ev
    else:
        candidate = ev

    if candidate:
        return {
            "loaded":             True,
            "event_id":           eid,
            "events_count":       len(candidate.get("schedule", [])),
            "participants_count": len(candidate.get("participants", [])),
            "event_name":         candidate.get("event_name", event_name),
        }
    return {"loaded": False, "events_count": 0, "participants_count": 0}


# ════════════════════════════════════════════════════════════════
# CHAT ORCHESTRATOR  —  POST /api/swarm/chat
# ════════════════════════════════════════════════════════════════

class ChatMessage(BaseModel):
    role: str    # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    event_name: str = ""
    history: List[ChatMessage] = []


class ApproveRequest(BaseModel):
    email_drafts: List[Dict[str, Any]]


@app.post("/api/swarm/chat")
async def swarm_chat(payload: ChatRequest):
    """Natural language → GPT-4o decides agents → fires them → returns results."""
    import traceback as _tb
    try:
        return await _swarm_chat_inner(payload)
    except Exception as exc:
        print(f"[swarm_chat] UNHANDLED ERROR:\n{_tb.format_exc()}")
        raise HTTPException(status_code=500, detail=str(exc))


async def _swarm_chat_inner(payload: ChatRequest):
    from dotenv import load_dotenv
    load_dotenv()
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage

    # ── ALWAYS do a fresh DB read — app.state can go stale between requests ──
    ev = await _db_get_active_event()

    if not ev:
        return {
            "display_message": (
                "⚠️ No event context loaded yet. Go to **Events Manager** and create or activate an event first."
            ),
            "agents_fired": [],
            "results": {},
            "needs_approval": False,
        }

    context_block = _build_agent_context(ev)
    schedule   = _normalize_schedule(ev.get("schedule", []))
    pax        = ev.get("participants", [])
    sponsors   = ev.get("sponsors", [])
    email_tmpl = ev.get("email_template", "Hi {name}, here is an update from {event_name}.")
    
    # Build Participant Map dynamically
    pax_map = _build_participant_schedule_map(schedule, pax)
    
    # Gather recent actions
    outputs = ev.get("outputs", {})
    raw_schedule_changes = outputs.get("schedule_changes", [])
    recent_schedule_changes_detail = [
        {
            "event_name":      c.get("event_name") or (c.get("trigger", "")[:60] if c.get("trigger") else ""),
            "delay_minutes":   c.get("delay_minutes"),
            "new_start_time":  c.get("new_start_time"),
            "reason":          c.get("reason"),
            "changed_at":      c.get("timestamp") or c.get("changed_at"),
            "affected_emails": c.get("affected_emails", []),
            "changes":         c.get("changes", []),
        }
        for c in raw_schedule_changes[-5:]
    ]
    recent_actions = {
        "recent_emails": outputs.get("email_drafts", [])[-5:],
        "recent_schedule_changes": recent_schedule_changes_detail,
    }

    event_name_str = ev.get("event_name", "your event")
    start_date = ev.get("start_date", "TBD")
    end_date = ev.get("end_date", start_date)
    venue = ev.get("venue", "TBD")

    # ── Orchestrator Proactive Intelligence: Build Full Context ──────────────
    full_context = {
        "event_summary": {
            "name": event_name_str,
            "dates": f"{start_date} to {end_date}",
            "venue": venue,
            "total_events": len(schedule),
            "total_participants": len(pax)
        },
        "participant_schedule_map": pax_map,
        "conflict_summary": ev.get("conflict_summary", []),
        "recent_actions": recent_actions,
        "agent_capabilities": {
            "content_agent": "Drafts engaging social media posts, announcements, and summaries.",
            "scheduler_agent": "Modifies the event schedule: delays events, handles cancellations, and resolves resource/room conflicts.",
            "email_agent": "Drafts highly personalised emails based on the participant_schedule_map. ALWAYS needs raw lists of affected participant emails to function.",
            "image_agent": "Generates images based on descriptions."
        }
    }

    # ── Step 1: GPT-4o decision ──────────────────────────────────────────────
    decision_prompt = f"""You are the master Event Logistics Orchestrator for {event_name_str}.
You are helpful, warm, and highly proactive. You are not just a router; you are a smart coordinator.

Here is the FULL CONTEXT of your event right now (JSON format):
{json.dumps(full_context, indent=2, default=str)}

Additional general context:
{context_block}

PROACTIVE REASONING PROTOCOL:
When a user asks you to take an action (e.g., "delay the keynote by 30 mins"), you must cascade the necessary side-effects automatically.
Think in this exact order:
1. What happened? (e.g. Schedule is changing)
2. Who is affected? (Check participant_schedule_map to see who was attending that event)
3. What changes? (Fire scheduler_agent to move the time)
4. Who needs emailing? (Fire email_agent, giving it the exact list of affected participant emails or roles)
5. What needs announcing? (Fire content_agent to draft a social media post)

Never fire the email_agent without providing specific instructions on who to email (using the participant_schedule_map data).
For casual messages (greetings, questions), just respond naturally and helpfully without firing agents. No robotic language.

Return ONLY a JSON object evaluating the situation. No text before or after, no markdown backticks.
Your response must exactly match this structure:
{{
  "understood":     "A friendly, conversational reply (use this to answer casual questions or confirm actions)",
  "display_text":   "Detailed markdown response if needed (or leave empty to just use 'understood')",
  "agents_firing":  ["scheduler_agent", "content_agent", "email_agent", "image_agent"],
  "scheduler_payload": {{
    "action": "cascade_delay | mark_cancelled | resource_conflict | no_change",
    "event_id": "...",
    "event_name": "...",
    "delay_minutes": 0,
    "room": ""
  }},
  "content_payload": {{
    "type": "delay_announcement | cancellation | morning_brief | sponsor_spotlight | speaker_spotlight | general",
    "event_name": "...",
    "details": ""
  }},
  "email_payload": {{
    "filter_role": "all | participant | judge | mentor | speaker | volunteer",
    "filter_event_id": "",
    "subject": "",
    "body_instruction": "what the email should say"
  }},
  "needs_approval": true,
  "approval_message": "Confirm: about to email X people...",
  "missing_data": ""
}}

SCHEDULE CHANGE AWARENESS:
- recent_actions.recent_schedule_changes contains the last 5 schedule changes made in this session.
- If the user says "some event got delayed", "inform participants about the delay", "send reschedule notification", or similar:
  * Check recent_schedule_changes FIRST. If it is not empty, use the MOST RECENT entry automatically.
  * DO NOT ask the user for event_name or delay_minutes if they are already present in recent_schedule_changes.
  * Extract affected_emails from the change and pass them directly to email_agent.
  * Set email body_instruction to reference the specific event name and new time from the change.
- NEVER ask the user to go to Events Manager if schedule data already exists in recent_schedule_changes or participant_schedule_map.

RULES:
- For casual messages like "how is your day", "hello", "thanks": return "understood" with a friendly reply, "agents_firing" as [], "needs_approval" as false.
- For general knowledge questions like "what is the capital of India": answer in the "understood" field, "agents_firing" empty.
- For event tasks: fill "agents_firing" and "agent_inputs" payloads.
- ALWAYS return raw JSON only. No markdown, no backticks, no explanation outside the JSON.
"""

    history_msgs = [
        (HumanMessage if m.role == "user" else SystemMessage)(content=m.content)
        for m in payload.history[-8:]
    ]

    llm = ChatOpenAI(model="gpt-4o", temperature=0.2)
    decision_resp = llm.invoke([
        SystemMessage(content=decision_prompt),
        *history_msgs,
        HumanMessage(content=payload.message),
    ])

    try:
        raw = decision_resp.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        decision = json.loads(raw.strip())
    except Exception:
        # Graceful fallback: show whatever the model outputted as a friendly reply
        decision = {
            "understood": decision_resp.content.strip()[:500],
            "agents_firing": [],
            "missing_data": "",
            "needs_approval": False
        }

    understood    = decision.get("understood", payload.message)
    agents_firing = decision.get("agents_firing", [])
    missing_data  = decision.get("missing_data", "")

    # ── Missing data early return ────────────────────────────────────────────
    # Only block if there is ALSO no schedule loaded — don't block when
    # schedule/participants are already present in the active event.
    has_schedule = len(schedule) > 0
    has_participants = len(pax) > 0
    if missing_data and not has_schedule and not has_participants:
        return {
            "display_message": f"ℹ️ {missing_data}\n\nGo to **Events Manager** to add this data — you can upload a file, paste CSV, or just describe it in plain English.",
            "understood":      understood,
            "agents_fired":    [],
            "results":         {},
            "needs_approval":  False,
        }

    # ── Step 2: Fire agents ──────────────────────────────────────────────────
    results: Dict[str, Any] = {}
    email_drafts: List[Dict] = []
    final_response_fields: Dict[str, Any] = {}

    # Scheduler agent
    if "scheduler_agent" in agents_firing:
        try:
            sp = decision.get("scheduler_payload", {})
            action = sp.get("action", "")
            if action == "cascade_delay" and schedule:
                delay_mins = int(sp.get("delay_minutes", 0)) or 0
                target_name = sp.get("event_name", "") or sp.get("event_id", "")
                target_room = sp.get("room", "")
                # Find the event to delay
                target = next(
                    (e for e in schedule if
                     target_name.lower() in e.get("name","").lower() or
                     e.get("id","") == sp.get("event_id","")),
                    None
                )
                if not target and target_room:
                    target = next(
                        (e for e in schedule if target_room.lower() in e.get("room","").lower()),
                        None
                    )
                if target and delay_mins:
                    target_day  = target.get("day", 1)
                    target_room_str = target.get("room", "")
                    changes = []
                    # Cascade all events in same room on same day from that point
                    for e in schedule:
                        if (e.get("day") == target_day and
                                target_room_str.lower() in e.get("room","").lower() and
                                e.get("start_time","") >= target.get("start_time","")):
                            # Shift start and end
                            for tf in ["start_time", "end_time"]:
                                try:
                                    h, m = map(int, e[tf].split(":"))
                                    total = h * 60 + m + delay_mins
                                    e[tf] = f"{total//60:02d}:{total%60:02d}"
                                except Exception:
                                    pass
                            changes.append(f"{e['name']}: now {e.get('start_time','')}–{e.get('end_time','')}")
                    # Persist updated schedule to MongoDB
                    db = get_db()
                    eid = ev.get("event_id")
                    if eid:
                        await db.events.update_one(
                            {"event_id": eid},
                            {"$set": {"schedule": schedule}}
                        )
                        # Refresh app.state
                        app.state.active_event = await _db_get_active_event() or ev
                    
                    # ── Proactive: Draft Reschedule Notifications ──────────────────────
                    # Identify all affected emails for the target event
                    affected_emails = set()
                    for em in target.get("assigned_emails", []):
                        affected_emails.add(em.strip().lower())
                    # And anyone registered
                    target_id = target.get("id", "")
                    for p in pax:
                        if isinstance(p, dict) and target_id in p.get("registered_events", []):
                            affected_emails.add(p.get("email", "").strip().lower())
                            
                    # Fallback if no specific assignments: notify everyone (demo mode)
                    if not affected_emails:
                        affected_emails = {p.get("email").strip().lower() for p in pax if isinstance(p, dict) and p.get("email")}
                        
                    if affected_emails:
                        from agents import email_agent
                        instr = f"URGENT: Your event '{target.get('name')}' has been delayed by {delay_mins} minutes. It will now take place in {target_room_str}. Sorry for the inconvenience."
                        notif_res = email_agent.run_email_agent(list(affected_emails), pax_map, event_name_str, instr)
                        email_drafts.extend(notif_res.get("emails", []))
                    # ───────────────────────────────────────────────────────────────────

                    results["scheduler"] = {
                        "summary": f"Cascaded {len(changes)} events in {target_room_str} by {delay_mins} min.",
                        "changes": changes,
                        "error": None,
                    }
                else:
                    results["scheduler"] = {"summary": f"Identified delay but couldn't find target event in schedule.", "changes": [], "error": None}
            elif action == "mark_cancelled":
                target_name = sp.get("event_name", "")
                db = get_db()
                eid = ev.get("event_id")
                if eid:
                    for e in schedule:
                        if target_name.lower() in e.get("name","").lower():
                            e["status"] = "cancelled"
                            break
                    await db.events.update_one(
                        {"event_id": eid},
                        {"$set": {"schedule": schedule}}
                    )
                    app.state.active_event = await _db_get_active_event() or ev
                results["scheduler"] = {"summary": f"Marked '{target_name}' as cancelled.", "changes": [], "error": None}
            else:
                results["scheduler"] = {"summary": "Schedule reviewed — no changes needed.", "changes": [], "error": None}
        except Exception as exc:
            results["scheduler"] = {"summary": "", "changes": [], "error": str(exc)}

    # Content agent
    if "content_agent" in agents_firing:
        try:
            cp = decision.get("content_payload", {})
            ctype = cp.get("type", "general")
            details = cp.get("details", payload.message)
            branding = ev.get("branding", {})
            ht = " ".join(branding.get("hashtags", []))
            content_llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
            posts_resp = content_llm.invoke([
                SystemMessage(content=f"""You are a social media manager for {ev.get('event_name','')}.
Hashtags: {ht}
Instagram: {branding.get('instagram','')}  Twitter: {branding.get('twitter','')}

Write concise, engaging posts for a {ctype} announcement. Return JSON:
{{"twitter":"","linkedin":"","instagram":"","announcement":""}}"""),
                HumanMessage(content=details),
            ])
            raw_posts = posts_resp.content.strip()
            if raw_posts.startswith("```"):
                raw_posts = raw_posts.split("```")[1]
                if raw_posts.startswith("json"): raw_posts = raw_posts[4:]
            posts = json.loads(raw_posts.strip())
            summary = f"Drafted {', '.join(k for k,v in posts.items() if v)} posts."
            results["content"] = {"summary": summary, "posts": posts, "error": None}
        except Exception as exc:
            results["content"] = {"summary": "", "posts": {}, "error": str(exc)}

    # Email agent
    if "email_agent" in agents_firing:
        try:
            from agents import email_agent
            ep = decision.get("email_payload", {})
            filter_role = ep.get("filter_role", "all")
            body_instr = ep.get("body_instruction", payload.message)

            # Determine target emails
            if filter_role == "all" or not filter_role:
                target_emails = ["all"]
            else:
                target_emails = [p.get("email", "").strip().lower() for p in pax if isinstance(p, dict) and p.get("role", "").lower() == filter_role.lower() and p.get("email")]
                if not target_emails:
                    target_emails = ["all"]

            # Extract generated content posts if any, to pass as context
            content_context_to_pass = results.get("content", {}).get("posts", None)

            # Run the new map-aware email agent
            email_res = email_agent.run_email_agent(
                target_emails, 
                pax_map, 
                event_name_str, 
                body_instr,
                content_context=content_context_to_pass
            )
            drafts = email_res.get("emails", [])
            email_drafts.extend(drafts)
            
            preview = [{"name": d["name"], "email": d["email"], "subject": d["subject"], "body": d["body"][:200]} for d in drafts[:3]]
            
            summary_text = f"Drafted {len(drafts)} personalised emails."
            if filter_role != "all":
                summary_text += f" (Filtered by role: {filter_role})"
                
            results["email"] = {
                "summary": summary_text,
                "preview": preview,
                "error": None,
            }
        except Exception as exc:
            import traceback as tb
            print("EMAIL ERROR:", tb.format_exc())
            results["email"] = {"summary": "", "preview": [], "error": str(exc)}

    # Image agent
    if "image_agent" in agents_firing:
        try:
            ip = decision.get("image_payload", {})
            prompt = ip.get("prompt", payload.message)
            style = ip.get("style", "digital art")
            width = ip.get("width", 1024)
            height = ip.get("height", 1024)
            
            import re
            from urllib.parse import quote
            clean_prompt = re.sub(r"[^a-zA-Z0-9 ]", "", prompt)[:80]
            full_prompt = f"{event_name_str} {clean_prompt} {style} professional high quality"
            encoded = quote(full_prompt.strip())
            image_url = f"https://image.pollinations.ai/prompt/{encoded}?width={width}&height={height}&nologo=true&seed=42"
            
            final_response_fields["image_url"] = image_url
            final_response_fields["image_prompt"] = prompt
            final_response_fields["image_style"] = style
            
            results["image"] = {"summary": f"Generated image for {prompt}", "error": None}
        except Exception as exc:
            results["image"] = {"summary": "", "error": str(exc)}

    # ── Build display message ────────────────────────────────────────────────
    # Prefer GPT-4o's own display_text for natural, warm responses
    display_text_from_gpt = decision.get("display_text", "")

    if display_text_from_gpt:
        # GPT already wrote a great response — use it, but append agent summaries if any fired
        extra = []
        if results.get("scheduler"):
            r = results["scheduler"]
            extra.append(f"\n📅 **Scheduler**: {r.get('summary','')}")
            if r.get("changes"):
                extra.extend([f"  - {c}" for c in r["changes"][:6]])
        if results.get("content"):
            extra.append(f"\n🎨 **Content**: {results['content'].get('summary','')}")
        if results.get("email"):
            extra.append(f"\n📧 **Email**: {results['email'].get('summary','')}")
        display_message = display_text_from_gpt + ("\n" + "\n".join(extra) if extra else "")
    else:
        # Fallback: build from results
        lines = []
        if results.get("scheduler"):
            r = results["scheduler"]
            lines.append(f"📅 **Scheduler**: {r.get('summary','')}")
            if r.get("changes"):
                lines.extend([f"  - {c}" for c in r["changes"][:6]])
        if results.get("content"):
            lines.append(f"🎨 **Content**: {results['content'].get('summary','')}")
        if results.get("email"):
            lines.append(f"📧 **Email**: {results['email'].get('summary','')}")
        if not lines:
            lines.append(understood)
        display_message = "\n".join(lines)

    # ── Save outputs to MongoDB ──────────────────────────────────────────────
    run_id = str(uuid.uuid4())
    db = get_db()
    active_eid = ev.get("event_id")
    now = datetime.now(timezone.utc)

    if active_eid:
        # Save user message to chat_history
        await db.events.update_one(
            {"event_id": active_eid},
            {"$push": {"outputs.chat_history": {
                "role": "user",
                "content": payload.message,
                "timestamp": now.isoformat(),
            }}}
        )

        # Save assistant message to chat_history
        await db.events.update_one(
            {"event_id": active_eid},
            {"$push": {"outputs.chat_history": {
                "role": "assistant",
                "content": display_message,
                "timestamp": now.isoformat(),
                "agents_fired": agents_firing,
                "run_id": run_id,
            }}}
        )

        # Save generated posts
        if results.get("content") and results["content"].get("posts"):
            await db.events.update_one(
                {"event_id": active_eid},
                {"$push": {"outputs.generated_posts": {
                    "run_id": run_id,
                    "triggered_by": payload.message,
                    "timestamp": now.isoformat(),
                    "posts": results["content"]["posts"],
                    "approved": False,
                }}}
            )

        # Save schedule changes
        if results.get("scheduler") and results["scheduler"].get("changes"):
            await db.events.update_one(
                {"event_id": active_eid},
                {"$push": {"outputs.schedule_changes": {
                    "run_id": run_id,
                    "trigger": payload.message,
                    "timestamp": now.isoformat(),
                    "changes": results["scheduler"]["changes"],
                }}}
            )

        # Save email drafts
        if email_drafts:
            await db.events.update_one(
                {"event_id": active_eid},
                {"$push": {"outputs.email_drafts": {
                    "run_id": run_id,
                    "trigger": payload.message,
                    "timestamp": now.isoformat(),
                    "recipients": [{"name": d.get("name"), "email": d.get("email")} for d in email_drafts],
                    "subject": email_drafts[0].get("subject", "") if email_drafts else "",
                    "drafts": email_drafts,
                    "approved": False,
                    "sent": False,
                }}}
            )

        # Audit log in agent_runs collection
        await db.agent_runs.insert_one({
            "run_id": run_id,
            "event_id": active_eid,
            "trigger": payload.message,
            "agents_fired": agents_firing,
            "timestamp": now.isoformat(),
            "status": "success",
        })

    res = {
        "display_message":  display_message,
        "understood":       understood,
        "agents_fired":     agents_firing,
        "results":          results,
        "email_drafts":     email_drafts,
        "needs_approval":   decision.get("needs_approval", bool(email_drafts)),
        "approval_message": decision.get("approval_message", f"Send {len(email_drafts)} emails?"),
        "run_id":           run_id,
    }
    res.update(final_response_fields)
    return res


# ════════════════════════════════════════════════════════════════
# POST /api/swarm/approve  —  send pre-drafted emails
# ════════════════════════════════════════════════════════════════

@app.post("/api/swarm/approve")
async def swarm_approve(payload: ApproveRequest):
    """Send the pre-drafted emails via Gmail SMTP after user approval."""
    from dotenv import load_dotenv
    load_dotenv()
    gmail_user = os.getenv("GMAIL_USER")
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD")
    if not gmail_user or not gmail_pass:
        raise HTTPException(status_code=500, detail="GMAIL_USER / GMAIL_APP_PASSWORD not set in .env")

    sent = 0
    failed = []
    for draft in payload.email_drafts:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = draft.get("subject", "Event Update")
            msg["From"]    = gmail_user
            msg["To"]      = draft.get("email", "")
            msg.attach(MIMEText(draft.get("body", ""), "plain"))
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
                smtp.login(gmail_user, gmail_pass)
                smtp.sendmail(gmail_user, draft["email"], msg.as_string())
            sent += 1
        except Exception as exc:
            failed.append({"email": draft.get("email"), "error": str(exc)})

    return {"status": "done", "sent": sent, "failed": failed}


# ════════════════════════════════════════════════════════════════
# OUTPUT HISTORY ROUTES  —  read saved outputs from MongoDB
# ════════════════════════════════════════════════════════════════

@app.get("/api/outputs/posts")
async def get_output_posts():
    """Return all generated posts for the active event, newest first."""
    ev = await _db_get_active_event()
    if not ev:
        return {"posts": []}
    posts = ev.get("outputs", {}).get("generated_posts", [])
    posts.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"posts": posts}


@app.get("/api/outputs/schedule-changes")
async def get_output_schedule_changes():
    """Return all schedule changes for the active event, newest first."""
    ev = await _db_get_active_event()
    if not ev:
        return {"changes": []}
    changes = ev.get("outputs", {}).get("schedule_changes", [])
    changes.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"changes": changes}


@app.get("/api/outputs/email-drafts")
async def get_output_email_drafts(sent: Optional[str] = None):
    """Return email drafts for the active event. ?sent=true or ?sent=false to filter."""
    ev = await _db_get_active_event()
    if not ev:
        return {"drafts": []}
    drafts = ev.get("outputs", {}).get("email_drafts", [])
    if sent is not None:
        want_sent = sent.lower() == "true"
        drafts = [d for d in drafts if d.get("sent", False) == want_sent]
    drafts.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"drafts": drafts}


@app.get("/api/outputs/chat-history")
async def get_output_chat_history():
    """Return chat history for the active event, oldest first."""
    ev = await _db_get_active_event()
    if not ev:
        return {"history": []}
    history = ev.get("outputs", {}).get("chat_history", [])
    history.sort(key=lambda x: x.get("timestamp", ""))
    return {"history": history}


@app.get("/api/outputs/runs")
async def get_output_runs():
    """Return last 20 agent runs from the agent_runs collection."""
    db = get_db()
    ev = await _db_get_active_event()
    if not ev:
        return {"runs": []}
    eid = ev.get("event_id")
    runs = []
    async for doc in db.agent_runs.find({"event_id": eid}).sort("timestamp", -1).limit(20):
        runs.append(serialize_doc(doc))
    return {"runs": runs}


@app.post("/api/swarm/approve-post")
async def approve_post(payload: dict):
    """Mark a generated post as approved by run_id."""
    run_id = payload.get("run_id")
    if not run_id:
        raise HTTPException(status_code=400, detail="run_id is required")
    db = get_db()
    result = await db.events.update_one(
        {"is_active": True, "outputs.generated_posts.run_id": run_id},
        {"$set": {"outputs.generated_posts.$[elem].approved": True}},
        array_filters=[{"elem.run_id": run_id}]
    )
    return {"status": "ok", "matched": result.matched_count, "modified": result.modified_count}


# ════════════════════════════════════════════════════════════════
# Sample data endpoints (for demo)
# ════════════════════════════════════════════════════════════════

@app.get("/api/sample-data/schedule")
async def sample_schedule():
    p = Path(__file__).parent / "sample_data" / "sample_schedule.json"
    if p.exists():
        return {"events": json.loads(p.read_text())}
    return {"events": []}


@app.get("/api/sample-data/participants")
async def sample_participants():
    p = Path(__file__).parent / "sample_data" / "sample_participants.csv"
    if p.exists():
        return {"csv_text": p.read_text()}
    return {"csv_text": ""}

