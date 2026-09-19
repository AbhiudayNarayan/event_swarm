import os
from typing import Any, Dict, List, Optional

import pandas as pd
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage


# ---------------------------------------------------------
# Environment Setup
# ---------------------------------------------------------

load_dotenv()


# ---------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------

def is_valid_email(email: Any) -> bool:
    """
    Basic email validation.
    Checks that the email contains '@' and a '.' after '@'.
    """
    if pd.isna(email):
        return False

    email = str(email).strip()

    if not email:
        return False

    if "@" not in email:
        return False

    domain = email.split("@", 1)[1]

    return "." in domain


def clean_value(value: Any, default: str = "") -> str:
    """
    Convert a CSV value into a clean string.
    """
    if pd.isna(value):
        return default

    value = str(value).strip()

    return value if value else default


def replace_placeholders(
    template: str,
    name: str,
    role: str,
    team_name: str
) -> str:
    """
    Replace supported placeholders in an email template.
    """

    return (
        template
        .replace("{name}", name)
        .replace("{role}", role)
        .replace("{team_name}", team_name)
    )


def create_llm(
    model: str = "gpt-4o",
    temperature: float = 0.7
) -> ChatOpenAI:
    """
    Create and return the LangChain OpenAI chat model.
    """

    return ChatOpenAI(
        model=model,
        temperature=temperature
    )


# ---------------------------------------------------------
# Main Email Segmentation + Personalization Function
# ---------------------------------------------------------

def run(
    csv_path: str,
    email_template: str
) -> Dict[str, Any]:
    """
    Read participant information from a CSV file, segment users
    by role, generate role-specific email templates using GPT,
    personalize the templates, and return email previews.

    Expected CSV columns:
        name
        email
        role
        team_name
    """

    # -----------------------------------------------------
    # 1. Load CSV
    # -----------------------------------------------------

    try:
        df = pd.read_csv(
            csv_path,
            on_bad_lines="skip"
        )

    except Exception as first_error:

        try:
            # Fallback for older pandas versions
            df = pd.read_csv(
                csv_path,
                error_bad_lines=False
            )

        except Exception as second_error:
            raise ValueError(
                f"Failed to read CSV file: {first_error}"
            ) from second_error

    # -----------------------------------------------------
    # 2. Ensure Required Columns Exist
    # -----------------------------------------------------

    required_columns = [
        "name",
        "email",
        "role",
        "team_name"
    ]

    for column in required_columns:
        if column not in df.columns:
            df[column] = ""

    # -----------------------------------------------------
    # 3. Validate Email Addresses
    # -----------------------------------------------------

    valid_rows = []

    for _, row in df.iterrows():

        email = clean_value(row["email"])

        if is_valid_email(email):
            valid_rows.append(row)

    # -----------------------------------------------------
    # 4. Return Empty Result If No Valid Recipients
    # -----------------------------------------------------

    if not valid_rows:
        return {
            "total_recipients": 0,
            "segments": {
                "participants": 0,
                "mentors": 0,
                "judges": 0
            },
            "preview": [],
            "status": "ready_to_send"
        }

    # -----------------------------------------------------
    # 5. Create Role-Based Segments
    # -----------------------------------------------------

    segments = {
        "participant": [],
        "mentor": [],
        "judge": []
    }

    for row in valid_rows:

        role = clean_value(
            row["role"],
            default="participant"
        ).lower()

        if role in segments:
            segments[role].append(row)

        else:
            # Unknown roles are treated as participants
            segments["participant"].append(row)

    # -----------------------------------------------------
    # 6. Initialize LLM
    # -----------------------------------------------------

    llm = create_llm(
        model="gpt-4o",
        temperature=0.7
    )

    system_prompt = """
You are an event communications assistant.

Your task is to rewrite an email template for a specific
audience segment at a technical hackathon.

Audience segments may include:
- Participants
- Mentors
- Judges

Rules:
1. Keep the email professional, warm, and concise.
2. Preserve the important information from the original template.
3. Adapt the language to the audience.
4. Do not invent event information.
5. Preserve placeholders such as:
   {name}
   {role}
   {team_name}
6. Return only the rewritten email body.
"""

    # -----------------------------------------------------
    # 7. Generate Templates for Each Segment
    # -----------------------------------------------------

    segment_templates: Dict[str, str] = {}

    for role_key, rows in segments.items():

        if not rows:
            continue

        user_prompt = f"""
Audience segment: {role_key}

Base email template:
{email_template}

Rewrite this template for the specified audience.
"""

        try:

            response = llm.invoke(
                [
                    SystemMessage(
                        content=system_prompt
                    ),
                    HumanMessage(
                        content=user_prompt
                    )
                ]
            )

            segment_templates[role_key] = (
                response.content.strip()
            )

        except Exception:
            # Use original template if LLM fails
            segment_templates[role_key] = email_template

    # -----------------------------------------------------
    # 8. Personalize Emails
    # -----------------------------------------------------

    preview: List[Dict[str, Any]] = []

    for role_key, rows in segments.items():

        if not rows:
            continue

        base_template = segment_templates.get(
            role_key,
            email_template
        )

        for row in rows:

            name = clean_value(
                row["name"],
                default="Participant"
            )

            actual_role = clean_value(
                row["role"],
                default=role_key
            )

            team_name = clean_value(
                row["team_name"],
                default="your team"
            )

            # Replace placeholders
            body = replace_placeholders(
                template=base_template,
                name=name,
                role=actual_role,
                team_name=team_name
            )

            preview.append(
                {
                    "name": name,
                    "email": clean_value(row["email"]),
                    "role": actual_role,
                    "team_name": team_name,
                    "subject": (
                        f"Important Update for "
                        f"{name} | Neurathon '26"
                    ),
                    "body": body
                }
            )

    # -----------------------------------------------------
    # 9. Return Final Result
    # -----------------------------------------------------

    return {
        "total_recipients": len(preview),

        "segments": {
            "participants": len(
                segments["participant"]
            ),
            "mentors": len(
                segments["mentor"]
            ),
            "judges": len(
                segments["judge"]
            )
        },

        "preview": preview,

        "status": "ready_to_send"
    }


# =========================================================
# Personalized Email Agent
# =========================================================

def run_email_agent(
    target_emails: List[str],
    participant_map: Dict[str, Dict[str, Any]],
    event_name: str,
    instruction: str,
    content_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate personalized email drafts for selected participants.

    Parameters
    ----------
    target_emails:
        List of target email addresses.
        Use ["all"] to generate emails for everyone.

    participant_map:
        Dictionary containing participant information
        and event schedules.

    event_name:
        Name of the event.

    instruction:
        Announcement or communication instruction.

    content_context:
        Optional additional context generated elsewhere.
    """

    # -----------------------------------------------------
    # 1. Initialize LLM
    # -----------------------------------------------------

    llm = create_llm(
        model="gpt-4o",
        temperature=0.2
    )

    # -----------------------------------------------------
    # 2. Select Target Participants
    # -----------------------------------------------------

    if target_emails == ["all"]:

        targets = participant_map

    else:

        target_set = {
            email.strip().lower()
            for email in target_emails
            if email and email.strip()
        }

        targets = {
            email: profile
            for email, profile in participant_map.items()
            if email.strip().lower() in target_set
        }

    # -----------------------------------------------------
    # 3. Handle No Targets
    # -----------------------------------------------------

    if not targets:
        return {
            "drafts_created": 0,
            "emails": []
        }

    # -----------------------------------------------------
    # 4. System Prompt
    # -----------------------------------------------------

    system_prompt = f"""
You are the Communications Director for {event_name}.

Your task is to write a personalized email for a specific
hackathon participant.

You will receive:
- Participant information
- Their event schedule
- An announcement/instruction
- Optional additional context

Rules:

1. Keep the tone warm, professional, and clear.
2. Personalize the email using the participant's name.
3. If the participant has scheduled events, include them
   as a clean bulleted list.
4. Include the event time, event name, and room when available.
5. Integrate the announcement naturally into the email.
6. Do not invent schedule information.
7. Do not create a subject line.
8. Do not use Markdown code fences.
9. Return ONLY the email body.
"""

    # -----------------------------------------------------
    # 5. Generate Drafts
    # -----------------------------------------------------

    drafts: List[Dict[str, Any]] = []

    for email, profile in targets.items():

        # -------------------------------------------------
        # Participant Information
        # -------------------------------------------------

        name = profile.get(
            "name",
            "Participant"
        )

        role = profile.get(
            "role",
            "participant"
        )

        # -------------------------------------------------
        # Build Schedule
        # -------------------------------------------------

        events = profile.get(
            "events",
            []
        )

        schedule_lines = []

        for event in events:

            time = event.get(
                "time",
                ""
            )

            event_name_value = event.get(
                "name",
                ""
            )

            room = event.get(
                "room",
                ""
            )

            schedule_lines.append(
                f"- {time}: "
                f"{event_name_value} @ {room}"
            )

        if schedule_lines:

            schedule_text = "\n".join(
                schedule_lines
            )

        else:

            schedule_text = (
                "You have no assigned events yet."
            )

        # -------------------------------------------------
        # Build User Prompt
        # -------------------------------------------------

        user_prompt = f"""
Participant:
{name}

Role:
{role}

Their Event Schedule:
{schedule_text}

ANNOUNCEMENT / INSTRUCTION:
{instruction}
"""

        # -------------------------------------------------
        # Add Optional Context
        # -------------------------------------------------

        if content_context:

            user_prompt += f"""
    
Additional Context:
{content_context}

Use this additional context only when relevant.
"""

        user_prompt += """

Write the personalized email body now.
"""

        # -------------------------------------------------
        # Call LLM
        # -------------------------------------------------

        try:

            response = llm.invoke(
                [
                    SystemMessage(
                        content=system_prompt
                    ),
                    HumanMessage(
                        content=user_prompt
                    )
                ]
            )

            body = response.content.strip()

        except Exception:

            # Fallback email
            body = (
                f"Hi {name},\n\n"
                f"{instruction}\n\n"
                f"Your Schedule:\n"
                f"{schedule_text}\n\n"
                f"Best,\n"
                f"{event_name} Team"
            )

        # -------------------------------------------------
        # Store Draft
        # -------------------------------------------------

        drafts.append(
            {
                "email": email,
                "name": name,
                "subject": (
                    f"Update from {event_name}"
                ),
                "body": body,
                "status": "pending_approval"
            }
        )

    # -----------------------------------------------------
    # 6. Return Drafts
    # -----------------------------------------------------

    return {
        "drafts_created": len(drafts),
        "emails": drafts
    }
