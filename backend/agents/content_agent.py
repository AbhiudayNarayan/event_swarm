import json
import os
import time
from typing import Any, Dict

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI


load_dotenv()


# region debug-log
def _debug_log(hypothesis_id: str, location: str, message: str, data: Dict[str, Any]) -> None:
    try:
        payload = {
            "sessionId": "f612a6",
            "runId": "pre-fix",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with open("debug-f612a6.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception:
        # Logging must never break the agent
        pass


# endregion


def _parse_json_response(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Strip possible Markdown code fences
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find the first and last brace block
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def run_content_agent(
    event_name: str, 
    raw_text: str, 
    target_audience: str,
    image_prompt: str = None,
    image_style: str = "digital art"
) -> Dict[str, Any]:
    """
    Generate platform-specific social content for an event.
    """
    try:
        _debug_log(
            "H1",
            "content_agent.py:34",
            "run_content_agent entered",
            {
                "has_openai_key": bool(os.getenv("OPENAI_API_KEY")),
                "event_name_empty": not bool(event_name.strip()),
                "target_audience_empty": not bool(target_audience.strip()),
            },
        )

        llm = ChatOpenAI(model="gpt-4o")

        system_prompt = (
            "You are an expert social media strategist specializing in tech events and hackathons.\n"
            "Your job is to create engaging, platform-specific promotional content.\n"
            "Always use relevant emojis, hashtags, and platform-appropriate tone.\n"
            "For Twitter: concise, punchy, max 280 chars, 3-5 hashtags.\n"
            "For LinkedIn: professional, detailed, 150-200 words, industry hashtags.\n"
            "For Instagram: visual-focused, energetic, storytelling tone, 10+ hashtags.\n\n"
            "Respond ONLY with valid JSON in the exact structure requested."
        )

        user_prompt = (
            "Create promotional content for this event.\n\n"
            f"Event Name: {event_name}\n"
            f"Target Audience: {target_audience}\n"
            f"Event Details: {raw_text}\n\n"
            "Generate exactly:\n"
            "1. A Twitter/X post (under 280 characters)\n"
            "2. A LinkedIn post (150-200 words, professional tone)\n"
            "3. An Instagram caption (energetic, with 10+ hashtags)\n"
            "4. Recommended posting schedule (best times for each platform)\n\n"
            "Format your response as JSON with keys:\n"
            "twitter, linkedin, instagram, posting_schedule"
        )

        # Pass a single combined prompt; system guidance is included explicitly.
        combined_prompt = f"{system_prompt}\n\nUser request:\n{user_prompt}"

        _debug_log(
            "H2",
            "content_agent.py:63",
            "invoking ChatOpenAI",
            {"prompt_length": len(combined_prompt)},
        )

        response = llm.invoke(combined_prompt)

        content_text = getattr(response, "content", "") or ""
        parsed = _parse_json_response(content_text if isinstance(content_text, str) else str(content_text))

        _debug_log(
            "H3",
            "content_agent.py:68",
            "run_content_agent success",
            {"has_twitter": bool(parsed.get("twitter")), "has_linkedin": bool(parsed.get("linkedin"))},
        )

        return {
            "twitter": parsed.get("twitter", ""),
            "linkedin": parsed.get("linkedin", ""),
            "instagram": parsed.get("instagram", ""),
            "posting_schedule": parsed.get("posting_schedule", ""),
            "status": "success"
        }
    except Exception as e:
        _debug_log(
            "H4",
            "content_agent.py:76",
            "run_content_agent exception",
            {"error_type": type(e).__name__, "error_message": str(e)[:200]},
        )
        return {"status": "error", "message": str(e)}

