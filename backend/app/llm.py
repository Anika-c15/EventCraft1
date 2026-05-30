"""
Groq LLM service — fast inference via llama-3.3-70b-versatile (free tier).
"""
import json
import re
from typing import List, Dict, Any, Optional
from functools import lru_cache

from groq import Groq

from .config import settings

_client: Optional[Groq] = None


def _get_client() -> Optional[Groq]:
    global _client
    if _client is None and settings.GROQ_API_KEY and settings.GROQ_API_KEY not in ("", "your-groq-api-key-here"):
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


MODEL = "llama-3.3-70b-versatile"


def _call(prompt: str, system: Optional[str] = None) -> str:
    """Single-turn Groq call."""
    client = _get_client()
    if client is None:
        return "[LLM not configured — add GROQ_API_KEY to backend/.env (get a free key at https://console.groq.com)]"
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        err = str(e)
        if "429" in err or "rate_limit" in err.lower():
            return "[Groq rate limit hit — wait a moment and try again]"
        if "401" in err or "invalid_api_key" in err.lower():
            return "[Invalid Groq API key — check GROQ_API_KEY in backend/.env]"
        return f"[LLM Error: {err}]"


@lru_cache(maxsize=128)
def check_stage_allows_submission(stage_name: str, stage_description: str) -> bool:
    """
    Use Groq LLM to dynamically classify if a pipeline stage allows project submissions.
    Falls back to keyword matching if LLM is not configured or fails.
    """
    client = _get_client()
    if client is not None:
        try:
            prompt = f"""Analyze if the following event pipeline stage is a project submission, project presentation, hackathon finale, or project hacking/coding phase where teams are actively working on and submitting their projects.
            
            Stage Name: {stage_name}
            Stage Description: {stage_description}
            
            Respond with EXACTLY 'true' or 'false' and nothing else."""
            
            system = "You are an AI classifier. Determine if the stage allows project submissions. Respond with only 'true' or 'false'."
            res = _call(prompt, system=system).strip().lower()
            if "true" in res:
                return True
            if "false" in res:
                return False
        except Exception as e:
            print(f"⚠️ Groq stage classification error: {e}")

    # Fallback to keyword heuristics
    keywords = ("submit", "finale", "presentation", "eval", "hack", "project", "build", "pitch", "code", "work")
    name_lower = stage_name.lower()
    return any(kw in name_lower for kw in keywords)


@lru_cache(maxsize=128)
def check_stage_is_results_phase(stage_name: str, stage_description: str) -> bool:
    """
    Use Groq LLM to dynamically classify if a pipeline stage is a results, announcement, rankings, or progression phase.
    Falls back to keyword matching if LLM is not configured or fails.
    """
    client = _get_client()
    if client is not None:
        try:
            prompt = f"""Analyze if the following event pipeline stage is a results announcement, rankings display, awards presentation, winner announcement, or progression/finale phase where final scores and rankings are made public to the participants.
            
            Stage Name: {stage_name}
            Stage Description: {stage_description}
            
            Respond with EXACTLY 'true' or 'false' and nothing else."""
            
            system = "You are an AI classifier. Determine if the stage is a results/rankings phase. Respond with only 'true' or 'false'."
            res = _call(prompt, system=system).strip().lower()
            if "true" in res:
                return True
            if "false" in res:
                return False
        except Exception as e:
            print(f"⚠️ Groq stage classification error: {e}")

    # Fallback to keyword heuristics
    keywords = ("result", "rank", "winner", "award", "announc", "progression", "placement", "leaderboard", "congrat")
    name_lower = stage_name.lower()
    desc_lower = stage_description.lower() if stage_description else ""
    is_results = any(kw in name_lower for kw in keywords) or any(kw in desc_lower for kw in keywords)
    if not is_results:
        is_results = ("final" in name_lower and "finale" not in name_lower) or \
                     ("final" in desc_lower and "finale" not in desc_lower)
    return is_results


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
    prompt = f"""Team Name: {team_name}
Members:
{member_desc}

Formation Rules Applied: {json.dumps(rules, indent=2)}

Write a compelling 3-4 sentence rationale explaining why this team composition is strong.
Focus on skill complementarity, institutional diversity, and how the members' backgrounds
will help them succeed together. Be specific about each member's contribution.
Write in third person, professional tone."""

    system = "You are an expert event coordinator writing team rationale for a hackathon committee."
    return _call(prompt, system)


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

    prompt = f"""Formation Rules: {json.dumps(rules, indent=2)}

Teams:
{teams_desc}

Return a JSON object where keys are team names and values are rationale strings (3-4 sentences each).
Return ONLY valid JSON inside a ```json block, no other text.

Example:
```json
{{"Team Alpha": "rationale here...", "Team Beta": "rationale here..."}}
```"""

    system = "You are an expert event coordinator. Generate rationales for hackathon teams. Return only valid JSON."
    result = _call(prompt, system)
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

    prompt = f"""Event: {event_name}
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

    system = "You are drafting official emails for a competitive event management system. Return only valid JSON."
    result = _call(prompt, system)
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


def extract_profile_from_resume(text: str) -> dict:
    """Use Groq LLM to parse a candidate's resume and extract structured profile details."""
    prompt = f"""You are an expert resume parser for a hackathon registration system.
Extract structured information from the following resume text and return ONLY a valid JSON object. Do not include markdown fences, backticks, or any other introductory or concluding text.

JSON Structure:
{{
  "name": "full name",
  "email": "email address or empty string",
  "institution": "university or college name or empty string",
  "level": "one of exactly: Beginner, Intermediate, Advanced, Expert",
  "skills": "comma-separated technical skills e.g. Python, React, ML",
  "summary": "one sentence describing this candidate's strongest area"
}}

For level: 0-1yr experience = Beginner, 1-2yr = Intermediate, 2-4yr = Advanced, 4+yr = Expert.

Resume Text:
{text[:4000]}
"""
    system = "You are a JSON resume parser. You output only valid raw JSON."
    response_text = _call(prompt, system=system).strip()
    
    # Extract JSON in case LLM wrapped it in markdown fences
    parsed = _extract_json(response_text)
    if isinstance(parsed, dict):
        return parsed
    
    # Fallback parsing
    try:
        start = response_text.find('{')
        end = response_text.rfind('}')
        if start != -1 and end != -1:
            return json.loads(response_text[start:end+1])
    except Exception:
        pass
        
    return {
        "name": "",
        "email": "",
        "institution": "",
        "level": "Intermediate",
        "skills": "",
        "summary": "Failed to parse resume text dynamically."
    }


# ── Dynamic Event Configuration Agent ─────────────────────────────────────────

SYSTEM_PROMPT = """You are EventCraft's intelligent event configuration assistant.
Your job is to configure a complete event pipeline from a natural language description.

When the user describes their event, extract ALL of the following:
1. Event phases/stages (in order) with descriptions and tasks
2. Team formation rules (team size, skill balance, institution diversity, experience grouping)
3. Evaluation criteria and scoring weights
4. Communication touchpoints (which stages need emails)
5. Anomaly threshold for score divergence

Be proactive — if the user gives you enough info (event type, team size, judging criteria),
generate the full config immediately. Only ask clarifying questions if critical info is missing.

For a hackathon with teams of N judged on X criteria, you have enough to configure everything.

When ready, respond with EXACTLY this JSON block (no extra text before or after the JSON block):

```json
{
  "pipeline_ready": true,
  "stages": [
    {
      "name": "Participant Intake",
      "description": "Register and verify all participants",
      "tasks": ["Open registration", "Collect profiles", "Verify eligibility", "Approve roster"]
    },
    {
      "name": "Team Formation",
      "description": "Form balanced teams based on skills and background",
      "tasks": ["Configure rules", "Run AI formation", "Review teams", "Approve compositions"]
    },
    {
      "name": "Evaluation",
      "description": "Judges evaluate team submissions",
      "tasks": ["Open evaluation portal", "Collect scores", "Aggregate results", "Flag anomalies"]
    },
    {
      "name": "Results",
      "description": "Announce final rankings",
      "tasks": ["Calculate rankings", "Generate reports", "Draft announcements", "Notify participants"]
    },
    {
      "name": "Progression",
      "description": "Advance qualifying teams",
      "tasks": ["Identify qualifiers", "Send invitations", "Confirm participation", "Archive data"]
    }
  ],
  "formation_rules": {
    "team_size": 3,
    "skill_balance": true,
    "institution_diversity": true,
    "experience_level_grouping": "mixed",
    "max_teams": 20,
    "max_per_institution": 1
  },
  "evaluation_criteria": ["Innovation", "Execution", "Presentation", "Impact"],
  "scoring_weights": {
    "Innovation": 0.25,
    "Execution": 0.25,
    "Presentation": 0.25,
    "Impact": 0.25
  },
  "anomaly_threshold": 2.5,
  "communication_stages": ["Participant Intake", "Team Formation", "Evaluation", "Results", "Progression"]
}
```

Adapt the stages, team_size, criteria, and weights based on what the user describes.
For example: coding contest → criteria might be ["Correctness", "Efficiency", "Code Quality"]
Case competition → stages might include "Submission", "Presentation", "Final Pitch"

If info is missing, make reasonable assumptions and mention them in your reply before the JSON."""


def agent_chat(
    history: List[Dict[str, str]],
    new_message: str,
) -> Dict[str, Any]:
    """Multi-turn conversation with the event config agent using Groq."""
    client = _get_client()
    if client is None:
        return {
            "reply": "Groq API key not configured. Please add GROQ_API_KEY to backend/.env (get a free key at https://console.groq.com)",
            "pipeline_config": None,
            "pipeline_ready": False,
            "needs_clarification": False,
        }

    try:
        # Build messages array for Groq chat completions
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        for msg in history:
            role = "user" if msg["role"] == "user" else "assistant"
            messages.append({"role": role, "content": msg["parts"]})

        messages.append({"role": "user", "content": new_message})

        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=4096,
        )
        reply = response.choices[0].message.content.strip()

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
        err = str(e)
        if "429" in err or "rate_limit" in err.lower():
            msg = "Groq rate limit hit — wait a moment and try again."
        elif "401" in err or "invalid_api_key" in err.lower():
            msg = "Invalid Groq API key — check GROQ_API_KEY in backend/.env"
        else:
            msg = f"I encountered an error: {err}. Please check your Groq API key in backend/.env"
        return {
            "reply": msg,
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


# ── Bias Mitigation Rationale ──────────────────────────────────────────────────

def generate_bias_mitigation_rationale(
    team_name: str,
    judge_score: float,
    public_score: float,
    deviation: float,
) -> str:
    """
    Generates a short, conversational rationale explaining the score difference.
    Strictly follows the prefix structure:
    'Why did this get flagged? [1-2 sentences generated dynamically by the LLM]'
    """
    system_prompt = (
        "You are an AI assistant designed to balance expert judge scores with public consensus voting.\n"
        "Explain in a conversational tone why the judges and public diverged (e.g. judges focused on technical details while the public voted on appeal/presentation).\n"
        "Strictly adhere to the following constraint:\n"
        "Start your response EXACTLY with the text 'Why did this get flagged? ' (including the trailing space), "
        "and then write exactly 1-2 simple, conversational sentences. Do not add any other formatting, quotes, or conversational preamble."
    )
    prompt = (
        f"Team: '{team_name}'\n"
        f"Expert Judge Score: {judge_score:.2f}/10\n"
        f"Public Vote Score: {public_score:.2f}/10\n"
        f"Absolute Difference: {deviation:.2f} points\n\n"
        "Generate the justification now."
    )
    try:
        explanation = _call(prompt, system=system_prompt)
        explanation = explanation.strip()
        
        # Ensure it starts with the correct prefix
        prefix = "Why did this get flagged? "
        if not explanation.startswith(prefix):
            # Clean up other variants
            if "Why did this get flagged?" in explanation:
                explanation = explanation.replace("Why did this get flagged?", "").strip()
                explanation = explanation.lstrip(":").strip()
            explanation = f"{prefix}{explanation}"
            
        return explanation
    except Exception as e:
        print(f"Error generating LLM bias mitigation rationale: {e}")
        return f"Why did this get flagged? The judge average of {judge_score:.1f} and public voting score of {public_score:.1f} diverged significantly, reflecting differing assessments of technical execution versus presentation appeal."

