import os
import pandas as pd
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

def run(csv_path: str, email_template: str) -> dict:
    load_dotenv()
    
    # 2. Read the CSV using pandas. Handle missing columns gracefully.
    try:
        df = pd.read_csv(csv_path, on_bad_lines='skip')
    except Exception as e:
        try:
            df = pd.read_csv(csv_path, error_bad_lines=False)
        except Exception as e2:
            raise ValueError(f"Failed to read CSV: {str(e)}")
        
    required_cols = ['name', 'email', 'role', 'team_name']
    for col in required_cols:
        if col not in df.columns:
            df[col] = ""
            
    # 3. Validate each row — skip rows where email doesn't contain "@" followed by a "."
    valid_rows = []
    for _, row in df.iterrows():
        email = str(row['email']).strip()
        if "@" in email and "." in email.split("@")[-1]:
            valid_rows.append(row)
            
    if not valid_rows:
        return {
            "total_recipients": 0,
            "segments": {"participants": 0, "mentors": 0, "judges": 0},
            "preview": [],
            "status": "ready_to_send"
        }

    # 4. Group rows into three segments by role: participants, mentors, judges
    segments = {
        "participant": [],
        "mentor": [],
        "judge": []
    }
    
    for row in valid_rows:
        role = str(row['role']).strip().lower()
        if role in segments:
            segments[role].append(row)
        else:
            # Default to participant if unknown
            segments["participant"].append(row)
            
    # 5. For each segment, call GPT-4o
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
    system_prompt = "You are an event communications assistant. Rewrite the given email template to be appropriate for the given audience segment at a technical hackathon. Keep it professional, warm, and concise."
    
    segment_templates = {}
    
    for role_key, rows in segments.items():
        if not rows:
            continue
            
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Audience segment: {role_key}\n\nBase template:\n{email_template}")
        ]
        
        try:
            response = llm.invoke(messages)
            segment_templates[role_key] = response.content
        except Exception as e:
            # Fallback to the original template if LLM fails
            segment_templates[role_key] = email_template

    # 6 & 7. Personalize and build preview list
    preview = []
    
    for role_key, rows in segments.items():
        if not rows:
            continue
            
        base_text = segment_templates[role_key]
        
        for row in rows:
            name = str(row['name']).strip() or "Participant"
            actual_role = str(row['role']).strip() or role_key
            team_name = str(row['team_name']).strip()
            if not team_name or str(team_name).lower() == 'nan':
                team_name = "your team"
                
            body = base_text.replace("{name}", name).replace("{role}", actual_role).replace("{team_name}", team_name)
            
            preview.append({
                "name": name,
                "email": str(row['email']).strip(),
                "role": actual_role,
                "team_name": team_name,
                "subject": f"Important Update for {name} | Neurathon '26",
                "body": body
            })
            
    # 8. Return dictionary
    return {
        "total_recipients": len(preview),
        "segments": {
            "participants": len(segments["participant"]),
            "mentors": len(segments["mentor"]),
            "judges": len(segments["judge"])
        },
        "preview": preview,
        "status": "ready_to_send"
    }


def run_email_agent(
    target_emails: list[str],
    participant_map: dict,
    event_name: str,
    instruction: str
) -> dict:
    """
    Generates tailored email drafts for specific participants using their schedule.
    
    target_emails: List of email strings to draft emails for. If ["all"], does everyone.
    participant_map: The participant_schedule_map dict built in main.py.
    instruction: System instruction from GPT-4o (e.g. "Announce keynote delay").
    """
    load_dotenv()
    llm = ChatOpenAI(model="gpt-4o", temperature=0.2)
    
    # 1. Filter the map to only target emails
    if target_emails == ["all"]:
        targets = participant_map
    else:
        # Normalise emails
        target_set = {e.strip().lower() for e in target_emails}
        targets = {k: v for k, v in participant_map.items() if k.strip().lower() in target_set}
        
    if not targets:
        return {"drafts_created": 0, "emails": []}

    system_prompt = f"""You are the Communications Director for {event_name}.
Your job is to write a single, perfectly tailored email body for a specific participant.
You will be given their profile, their personal event schedule, and the specific ANNOUNCEMENT to make.

RULES:
1. Keep the tone warm, professional, and clear.
2. If their schedule has events, include a clean bulleted list of their events (time, name, room).
3. Merge the ANNOUNCEMENT seamlessly into the email.
4. Return ONLY the raw body text of the email. No subject line. No markdown fences. No preambles.
"""

    drafts = []
    
    # 2. Generate an email for each target
    for email, profile in targets.items():
        name = profile.get("name", "Participant")
        role = profile.get("role", "participant")
        
        # Build schedule string
        sched_lines = []
        for e in profile.get("events", []):
            sched_lines.append(f"- {e.get('time', '')}: {e.get('name', '')} @ {e.get('room', '')}")
            
        schedule_text = "\n".join(sched_lines) if sched_lines else "You have no assigned events yet."
        
        user_prompt = f"""Participant: {name} (Role: {role})
Their Schedule:
{schedule_text}

ANNOUNCEMENT / INSTRUCTION to integrate:
{instruction}

Write the email body now:"""

        try:
            resp = llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ])
            body = resp.content.strip()
        except Exception:
            body = f"Hi {name},\n\n{instruction}\n\nYour Schedule:\n{schedule_text}\n\nBest,\n{event_name} Team"

        drafts.append({
            "email": email,
            "name": name,
            "subject": f"Update from {event_name}",
            "body": body,
            "status": "pending_approval"
        })

    return {
        "drafts_created": len(drafts),
        "emails": drafts
    }

