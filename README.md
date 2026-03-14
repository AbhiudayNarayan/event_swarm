## Event Logistics Swarm

Multi-agent FastAPI + React dashboard for orchestrating event logistics: content generation, email preparation, schedule conflict resolution, budgeting, logistics and participant Q&A.

### Tech Stack

- **Backend**: FastAPI, LangGraph, LangChain (OpenAI GPT `gpt-4o`), Motor (MongoDB), WebSockets
- **Frontend**: React, Vite, Tailwind CSS
- **Agents**: Content, Email, Scheduler, Budget, Logistics, Swarm Orchestrator, Participant Q&A

### Project Structure

- **`backend/`**: FastAPI API, LangGraph swarm orchestration, agents, tools and database layer
  - `main.py` – FastAPI app and HTTP/WebSocket endpoints
  - `orchestrator.py` – LangGraph `swarm_app` wiring content → scheduler → email (+ QA node)
  - `state.py` – `SwarmState` definition
  - `db.py` – MongoDB connection using Motor + helpers
  - `agents/` – individual agents (`content_agent.py`, `scheduler_agent.py`, `email_agent.py`, `budget_agent.py`, `logistics_agent.py`, `qa_agent.py`, `registry.py`)
  - `tools/` – CSV parsing and schedule conflict utilities
  - `sample_data/` – demo CSV/JSON for participants, sponsors and schedules
  - `requirements.txt` – Python dependencies for the backend
- **`frontend/`**: React dashboard UI (Vite + Tailwind)
  - `src/App.jsx`, `src/main.jsx`, `src/Layout.jsx`, `src/EventContext.jsx`
  - `src/pages/` – views for Dashboard, Swarm, Content, Scheduler, Budget, Email, Logistics, Q&A, Events, Setup
  - `src/components/` – reusable agent panels (Content, Email, Scheduler)

### Backend Setup (Python)

1. **Create & activate a virtualenv**
   - `cd backend`
   - `python -m venv .venv`
   - Windows: `.\.venv\Scripts\activate`
2. **Install dependencies**
   - `pip install -r requirements.txt`
3. **Environment variables (`backend/.env`)**
   - `OPENAI_API_KEY=your_openai_key`
   - `MONGODB_URI=mongodb://localhost:27017` (or your Mongo connection string)
   - `MONGODB_DB=event_swarm`
4. **Run the API**
   - From `backend/`:
   - `uvicorn main:app --reload --host 0.0.0.0 --port 8000`

### Frontend Setup (React)

1. `cd frontend`
2. Install dependencies: `npm install`
3. Start dev server: `npm run dev`
4. Open the printed `http://localhost:5173` (or similar) URL in the browser and ensure API base is `http://localhost:8000`.

### Using the App (Demo Flow)

1. **Create/Select Event (Dashboard / Setup)**
   - Configure basic event metadata from the dashboard/setup pages.
2. **Scheduler Agent**
   - Use `backend/sample_data/sample_schedule.json` (or paste your own events JSON) on the Scheduler page to detect and resolve conflicts.
3. **Content Agent**
   - On the Content page, provide event name, target audience and a short brief to generate Twitter/LinkedIn/Instagram posts plus posting schedule.
4. **Email Agent**
   - Upload or point to participants CSV (e.g. `backend/sample_data/sample_participants.csv`) and generate personalised invitation/follow-up emails.
5. **Budget Agent**
   - Define a total budget and allocations, then add expenses; view per-category and overall spending summaries.
6. **Logistics Agent**
   - Track venue, vendors and logistics notes for the event.
7. **Swarm Orchestrator**
   - Use the Swarm page to trigger the end‑to‑end multi‑agent workflow and watch the activity log stream in real time via WebSocket.
8. **Q&A Bot**
   - Ask participant-style questions (e.g. “What time is the keynote?”) and get answers grounded in the current schedule and generated content.

### Notes

- This repo is designed for local demos and hackathon-style experimentation; you should add proper auth, rate‑limiting and production‑grade configs before deploying.
- API keys and secrets must **never** be committed to git – keep them only in `.env` or your secret manager.