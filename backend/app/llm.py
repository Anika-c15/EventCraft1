"""
Gemini LLM service using the new google-genai SDK.
"""
import json
import re
from typing import List, Dict, Any, Optional

from google import genai

from .config import settings

_client = genai.Client(api_key=settings.GEMINI_API_KEY)
MODEL = "gemini-2.0-flash-lite"  # Fast, free-tier friendly, works with google-genai SDK


def _call(prompt: str) -> str:
    """Single-turn Gemini call."""
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your-gemini-api-key-here":
        return "[LLM not configured — add GEMINI_API_KEY to backend/.env]"
    try:
        response = _client.models.generate_content(
            model=MODEL,
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        err = str(e)
        if "429" in err or "RESOURCE_EXHAUSTED" in err:
            return "[Gemini quota exceeded — try again in a few minutes or upgrade your API plan at https://aistudio.google.com]"
        return f"[LLM Error: {err}]"


def _extract_json(text: str) -> Any:
    """Extract JSON from LLM response that may contain markdown fences."""
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1)
    try:
        return json.loads(text)
    except Exception:
        return None


# ── Team Formation ─────────────────────────────────────────────────────────────

def generate_team_rationale(
    team_name: str,
    members: List[Dict[str, Any]],
    rules: Dict[str, Any],
) -> str:
    member_desc = "\n".join(
        f"- {m['name']} ({m['institution']}, {m['level']}): {', '.join(m['skills'])}"
        for m in members
    )
    prompt = f"""You are an expert event coordinator writing team rationale for a hackathon committee.

Team Name: {team_name}
Members:
{member_desc}

Formation Rules Applied: {json.dumps(rules, indent=2)}

Write a compelling 3-4 sentence rationale explaining why this team composition is strong.
Focus on skill complementarity, institutional diversity, and how the members' backgrounds
will help them succeed together. Be specific about each member's contribution.
Write in third person, professional tone."""
    return _call(prompt)


def generate_all_team_rationales(
    teams: List[Dict[str, Any]],
    rules: Dict[str, Any],
) -> Dict[str, str]:
    teams_desc = ""
    for t in teams:
        member_desc = "\n".join(
            f"    - {m['name']} ({m['institution']}, {m['level']}): {', '.join(m['skills'])}"
            for m in t["members"]
        )
        teams_desc += f"\nTeam: {t['name']}\nMembers:\n{member_desc}\n"

    prompt = f"""You are an expert event coordinator. Generate rationales for these hackathon teams.

Formation Rules: {json.dumps(rules, indent=2)}

Teams:
{teams_desc}

Return a JSON object where keys are team names and values are rationale strings (3-4 sentences each).
Return ONLY valid JSON inside a ```json block, no other text.

Example:
```json
{{"Team Alpha": "rationale here...", "Team Beta": "rationale here..."}}
```"""

    result = _call(prompt)
    parsed = _extract_json(result)
    if isinstance(parsed, dict):
        return parsed
    return {t["name"]: generate_team_rationale(t["name"], t["members"], rules) for t in teams}


# ── Communication Drafting ─────────────────────────────────────────────────────

def draft_communication(
    stage: str,
    recipient_type: str,
    event_name: str,
    extra_context: Optional[str] = None,
    team_info: Optional[Dict] = None,
) -> Dict[str, str]:
    context = extra_context or ""
    team_ctx = f"\nTeam Info: {json.dumps(team_info)}" if team_info else ""

    prompt = f"""You are drafting an official email for a competitive event management system.

Event: {event_name}
Stage: {stage}
Recipient Type: {recipient_type}
{context}
{team_ctx}

Draft a professional, warm email. Use {{participant_name}} as placeholder where needed.

Return ONLY a JSON object inside a ```json block with exactly two keys:
- "subject": email subject line
- "body": full email body

```json
{{"subject": "...", "body": "..."}}
```"""

    result = _call(prompt)
    parsed = _extract_json(result)
    if isinstance(parsed, dict) and "subject" in parsed and "body" in parsed:
        return parsed
    return {
        "subject": f"[{event_name}] Update: {stage}",
        "body": f"Dear Participant,\n\nThis is an update regarding {stage} for {event_name}.\n\nBest regards,\nEventCraft Team",
    }


# ── Evaluation Guide ───────────────────────────────────────────────────────────

def generate_assessment_guide(
    event_name: str,
    team_name: str,
    challenge: Optional[str],
    criteria: List[str],
) -> str:
    criteria_str = ", ".join(criteria) if criteria else "Innovation, Execution, Presentation, Impact"
    challenge_str = challenge or "General hackathon challenge"

    prompt = f"""Generate a structured assessment guide for a judge evaluating a hackathon team.

Event: {event_name}
Team: {team_name}
Challenge: {challenge_str}
Evaluation Criteria: {criteria_str}

Write a concise guide (200-300 words) covering:
1. What to look for in each criterion
2. 2-3 specific questions to ask the team
3. Scoring guidance (what 9-10 vs 5-6 vs 1-3 looks like)"""
    return _call(prompt)


# ── Anomaly Detection ──────────────────────────────────────────────────────────

def explain_anomaly(
    team_name: str,
    judge_name: str,
    judge_score: float,
    panel_avg: float,
    threshold: float,
) -> str:
    prompt = f"""A score anomaly was detected in a hackathon evaluation.

Team: {team_name}
Judge: {judge_name}
Judge Score: {judge_score:.1f}/10
Panel Average: {panel_avg:.1f}/10
Deviation: {abs(judge_score - panel_avg):.1f} (threshold: {threshold})

Write a brief 2-sentence neutral explanation for the committee dashboard."""
    return _call(prompt)


# ── Dynamic Event Configuration Agent ─────────────────────────────────────────

SYSTEM_PROMPT = """You are EventCraft's intelligent event configuration assistant.
Help committee members configure a competitive event by understanding their description
and translating it into a structured pipeline configuration.

When the user describes their event, extract:
1. Event phases/stages (in order)
2. Team formation rules
3. Evaluation criteria and scoring model
4. Communication touchpoints
5. Approval gates

If the description is incomplete or contradictory, ask specific clarifying questions.

When you have enough information, respond with a JSON configuration block:
```json
{
  "pipeline_ready": true,
  "stages": [
    {"name": "Stage Name", "description": "...", "tasks": ["task1", "task2"]}
  ],
  "formation_rules": {
    "team_size": 3,
    "skill_balance": true,
    "institution_diversity": true,
    "experience_level_grouping": "mixed",
    "max_teams": 10
  },
  "evaluation_criteria": ["Innovation", "Execution", "Presentation", "Impact"],
  "scoring_weights": {"Innovation": 0.25, "Execution": 0.25, "Presentation": 0.25, "Impact": 0.25},
  "anomaly_threshold": 2.5,
  "communication_stages": ["Team Formation", "Evaluation", "Results"]
}
```

If you need more info, set "pipeline_ready": false and ask your questions."""


def agent_chat(
    history: List[Dict[str, str]],
    new_message: str,
) -> Dict[str, Any]:
    """Multi-turn conversation with the event config agent."""
    try:
        # Build the full prompt with history inline (simpler than multi-turn API)
        conversation = SYSTEM_PROMPT + "\n\n"

        for msg in history:
            role_label = "User" if msg["role"] == "user" else "Assistant"
            conversation += f"{role_label}: {msg['parts']}\n\n"

        conversation += f"User: {new_message}\n\nAssistant:"

        response = _client.models.generate_content(
            model=MODEL,
            contents=conversation,
        )
        reply = response.text.strip()

        # Try to extract pipeline config
        pipeline_config = None
        pipeline_ready = False

        json_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", reply)
        if json_match:
            try:
                config = json.loads(json_match.group(1))
                if config.get("pipeline_ready"):
                    pipeline_config = config
                    pipeline_ready = True
            except Exception:
                pass

        needs_clarification = not pipeline_ready and any(
            c in reply.lower() for c in ["?", "clarif", "could you", "please provide", "what is", "how many"]
        )

        return {
            "reply": reply,
            "pipeline_config": pipeline_config,
            "pipeline_ready": pipeline_ready,
            "needs_clarification": needs_clarification,
        }
    except Exception as e:
        return {
            "reply": f"I encountered an error: {str(e)}. Please check your Gemini API key in backend/.env",
            "pipeline_config": None,
            "pipeline_ready": False,
            "needs_clarification": False,
        }


# ── Results Summary ────────────────────────────────────────────────────────────

def generate_results_summary(
    event_name: str,
    teams_with_scores: List[Dict[str, Any]],
) -> str:
    teams_str = "\n".join(
        f"- {t['name']}: {t['score']:.2f}/10 (Rank #{t['rank']})"
        for t in teams_with_scores
    )
    prompt = f"""Write a brief results summary for {event_name}.

Final Rankings:
{teams_str}

Write 2-3 sentences congratulating the winners and acknowledging all participants.
Professional, celebratory tone."""
    return _call(prompt)
