# EL Swarm — Event Logistics Swarm

> A multi-agent AI platform for end-to-end event management.

EL Swarm orchestrates **7 specialized GPT‑4o agents** through a single LangGraph-powered workflow to automate coordination across scheduling, communications, budgeting, logistics, and attendee Q&A. Built for **Neurathon ’26**.

---

## ✨ Highlights

- **One prompt → full workflow**: trigger the swarm and watch each agent collaborate in sequence.
- **Real-time dashboard**: React + Tailwind UI with **WebSocket** activity streaming.
- **Conflict-aware scheduling**: detect & resolve schedule overlaps from JSON input.
- **Personalized outreach**: generate invite/follow-up emails from participant CSVs.
- **Social content in minutes**: draft platform-specific posts + a posting plan.
- **Budget & logistics tracking**: allocations, expenses, vendors, venue notes.
- **Grounded attendee Q&A**: answers based on the current schedule + generated artifacts.

## 🧠 Agents

| Agent | What it does |
|------|--------------|
| **Swarm Orchestrator** | Runs the end‑to‑end multi-agent graph |
| **Scheduler** | Detects conflicts + proposes resolutions |
| **Email** | Drafts personalized emails from participant data |
| **Content / Social** | Generates LinkedIn/Twitter/Instagram content + schedule |
| **Budget** | Tracks allocations, expenses, and summaries |
| **Logistics** | Manages vendors, venue, and operational notes |
| **Participant Q&A** | Answers attendee questions grounded in event context |

## 🧱 Tech Stack

- **Backend**: FastAPI, LangGraph, LangChain, OpenAI (GPT‑4o), Motor (MongoDB), WebSockets
- **Frontend**: React, Vite, Tailwind CSS
- **Data**: CSV/JSON sample inputs for quick demos

## 📁 Project Structure

- `backend/`
  - `main.py` — FastAPI app + HTTP/WebSocket endpoints
  - `orchestrator.py` — LangGraph `swarm_app` wiring nodes
  - `state.py` — `SwarmState` definition
  - `db.py` — MongoDB connection (Motor) + helpers
  - `agents/` — content, scheduler, email, budget, logistics, qa, registry
  - `tools/` — schedule conflict + CSV utilities
  - `sample_data/` — demo participants/schedule/sponsors
  - `requirements.txt` — backend dependencies
- `frontend/`
  - Vite + React + Tailwind dashboard
  - `src/pages/` — Dashboard, Swarm, Content, Scheduler, Budget, Email, Logistics, Q&A

---

## 🚀 Quickstart

### 1) Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows: .\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env`:

```bash
OPENAI_API_KEY=your_openai_key
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=event_swarm
```

Run the API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Open the printed dev URL (typically `http://localhost:5173`) and ensure the API base is `http://localhost:8000`.

---

## 🧪 Demo Flow (recommended)

1. **Create/Select an Event** (Dashboard / Setup)
2. **Scheduler**: load `backend/sample_data/sample_schedule.json` to detect/resolve conflicts
3. **Content**: generate social posts + a posting schedule
4. **Email**: use `backend/sample_data/sample_participants.csv` for personalized outreach
5. **Budget**: set allocations + track expenses
6. **Logistics**: capture vendor/venue notes
7. **Swarm**: run the full orchestration and watch the live activity log
8. **Q&A**: ask attendee questions ("What time is the keynote?") grounded in your schedule

---

## 🔐 Notes & Best Practices

- This repository is intended for **local demos/hackathon iteration**.
- For production: add **auth**, **rate limiting**, validation, and deployment configs.
- Never commit secrets—keep keys in `.env` or a secret manager.

## 📜 License

No license specified yet. If you plan to open-source this, consider adding a LICENSE file.
