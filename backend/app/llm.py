"""
Groq LLM service — fast inference via llama-3.3-70b-versatile (free tier).
"""
import json
import re
from typing import List, Dict, Any, Optional
from functools import lru_cache

# pyrefly: ignore [missing-import]
from groq import Groq, AuthenticationError, RateLimitError

from .config import settings

_client: Optional[Groq] = None
_cached_key: Optional[str] = None

_PLACEHOLDER_KEYS = {"", "your-groq-api-key-here", "gsk_your_key_here"}


def _reset_client() -> None:
    global _client, _cached_key
    _client = None
    _cached_key = None


def _api_key() -> str:
    return (settings.GROQ_API_KEY or "").strip()


def _get_client() -> Optional[Groq]:
    global _client, _cached_key
    key = _api_key()
    if key in _PLACEHOLDER_KEYS:
        _reset_client()
        return None
    if _client is None or _cached_key != key:
        _client = Groq(api_key=key)
        _cached_key = key
    return _client


def _is_auth_error(exc: Exception) -> bool:
    if isinstance(exc, AuthenticationError):
        return True
    err = str(exc).lower()
    return "invalid_api_key" in err or "invalid api key" in err


def _is_rate_limit_error(exc: Exception) -> bool:
    if isinstance(exc, RateLimitError):
        return True
    err = str(exc).lower()
    return "429" in err or "rate_limit" in err


MODEL = "llama-3.3-70b-versatile"


def _chat_completion_with_fallback(
    client: Groq,
    messages: List[Dict[str, Any]],
    temperature: float = 0.7,
    max_tokens: int = 2048,
    model: str = MODEL
) -> Any:
    """Calls Groq chat completions."""
    return client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def _use_gemini() -> bool:
    return bool((settings.GEMINI_API_KEY or "").strip())


def _call_gemini_api(
    messages: List[Dict[str, Any]],
    temperature: float = 0.7,
    max_tokens: int = 2048
) -> str:
    import httpx
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY not configured")

    system_instruction = None
    contents = []

    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if role == "system":
            system_instruction = {"parts": [{"text": content}]}
        else:
            gemini_role = "user" if role == "user" else "model"
            contents.append({
                "role": gemini_role,
                "parts": [{"text": content}]
            })

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={key}"
    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens
        }
    }
    if system_instruction:
        payload["systemInstruction"] = system_instruction

    with httpx.Client(timeout=30.0) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            raise ValueError(f"Unexpected response format from Gemini: {data}")


def _call(prompt: str, system: Optional[str] = None) -> str:
    """Single-turn call, trying Groq first, with fallback to Gemini."""
    groq_client = _get_client()
    
    # Try Groq if key is configured
    if groq_client is not None:
        try:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            response = _chat_completion_with_fallback(
                client=groq_client,
                messages=messages,
                temperature=0.7,
                max_tokens=2048,
            )
            return response.choices[0].message.content.strip()
        except Exception as groq_err:
            print(f"[LLM Fallback] Groq call failed: {groq_err}. Trying Gemini...")
            # If Groq fails, fall back to Gemini if configured
            if _use_gemini():
                try:
                    messages = []
                    if system:
                        messages.append({"role": "system", "content": system})
                    messages.append({"role": "user", "content": prompt})
                    return _call_gemini_api(messages)
                except Exception as gemini_err:
                    return f"[Gemini Fallback Error: {gemini_err} (Groq error was: {groq_err})]"
            
            # If Gemini not configured, handle original Groq error
            if _is_rate_limit_error(groq_err):
                return "[Groq rate limit hit — wait a moment and try again]"
            if _is_auth_error(groq_err):
                _reset_client()
                return "[Invalid Groq API key — check GROQ_API_KEY in backend/.env]"
            return f"[LLM Error: {groq_err}]"

    # If Groq client is not configured, try Gemini directly
    if _use_gemini():
        try:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
            return _call_gemini_api(messages)
        except Exception as e:
            return f"[Gemini Error: {e}]"

    return "[LLM not configured — add GROQ_API_KEY or GEMINI_API_KEY to backend/.env]"


@lru_cache(maxsize=128)
def check_stage_allows_submission(stage_name: str, stage_description: str) -> bool:
    """
    Use Groq LLM to dynamically classify if a pipeline stage allows project submissions.
    Falls back to keyword matching if LLM is not configured or fails.
    """
    client = _get_client()
    if client is not None:
        try:
            prompt = f"""Analyze if the following event pipeline stage occurs after team formation and allows teams to submit or present their project.
            Any stage after the team formation phase (such as hacking, prototyping, development, peer review, presentation, or expert evaluation/judging) should allow teams to submit their project links and details. Only one finalized submission is allowed per team.
            Stages like participant intake, registration, or team formation itself do NOT allow project submissions, and the final results/announcement phase also does NOT.
            
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


@lru_cache(maxsize=128)
def check_stage_is_evaluation_phase(stage_name: str, stage_description: str) -> bool:
    """
    Use Groq LLM to dynamically classify if a pipeline stage is an evaluation, scoring, or judging phase.
    Falls back to keyword matching if LLM is not configured or fails.
    """
    client = _get_client()
    if client is not None:
        try:
            prompt = f"""Analyze if the following event pipeline stage is an evaluation, judging, scoring, peer review, or grading phase where judges or peers assess the submitted projects.
            
            Stage Name: {stage_name}
            Stage Description: {stage_description}
            
            Respond with EXACTLY 'true' or 'false' and nothing else."""
            
            system = "You are an AI classifier. Determine if the stage is an evaluation/judging phase. Respond with only 'true' or 'false'."
            res = _call(prompt, system=system).strip().lower()
            if "true" in res:
                return True
            if "false" in res:
                return False
        except Exception as e:
            print(f"⚠️ Groq stage classification error: {e}")

    # Fallback to keyword heuristics
    keywords = ("eval", "judg", "scor", "peer", "review", "grade", "assessment", "rating", "vote")
    name_lower = stage_name.lower()
    desc_lower = stage_description.lower() if stage_description else ""
    return any(kw in name_lower for kw in keywords) or any(kw in desc_lower for kw in keywords)


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

# Stage-specific instructions so Groq knows exactly what each email should contain
_STAGE_INSTRUCTIONS = {
    "Participant Intake": {
        "all_participants": (
            "This is the welcome/registration confirmation email sent to participants after they register. "
            "It should: confirm their registration, briefly explain the event flow (team formation → hacking → evaluation → results), "
            "mention they will receive their personal portal link separately, and build excitement. "
            "Warm, energetic tone. Use {participant_name} placeholder."
        ),
        "default": (
            "Welcome email for the Participant Intake stage. Confirm registration and explain next steps."
        ),
    },
    "Team Formation": {
        "all_participants": (
            "Teams have just been formed by AI. This email tells participants their team has been assigned. "
            "It should: announce team formation is complete, tell them to check their participant portal for team details and teammates, "
            "encourage them to connect with teammates immediately, mention the hacking phase begins soon. "
            "Excited, motivating tone. Use {participant_name} placeholder."
        ),
        "default": (
            "Team formation complete email. Tell participants to check their portal for team assignments."
        ),
    },
    "Evaluation": {
        "all_participants": (
            "This is a reminder email during the evaluation/hacking phase. "
            "It should: remind participants of the project submission deadline, list what they need to submit "
            "(GitHub repo, demo video, presentation slides), encourage them to use their submission portal, "
            "and wish them luck. Urgent but supportive tone. Use {participant_name} placeholder."
        ),
        "judges": (
            "This email is sent to judges when the evaluation portal opens. "
            "It should: inform them the evaluation portal is now live, explain the 4 scoring criteria "
            "(Innovation 0-10, Execution 0-10, Presentation 0-10, Impact 0-10), "
            "provide guidance on what each score range means, and thank them for their time. "
            "Professional, clear tone. Address as 'Dear Judge'."
        ),
        "default": (
            "Evaluation phase email. Inform recipients about the evaluation process and deadlines."
        ),
    },
    "Results": {
        "all_participants": (
            "Results announcement email sent after final rankings are published. "
            "It should: announce that results are now live, tell participants to check their portal for final rankings, "
            "congratulate all participants for their hard work regardless of placement, "
            "and mention the live leaderboard is available. "
            "Celebratory, inclusive tone. Use {participant_name} placeholder."
        ),
        "default": (
            "Results announcement email. Inform participants that final rankings are published."
        ),
    },
    "Progression": {
        "winners": (
            "Congratulations email sent ONLY to teams that qualified/won. "
            "It should: congratulate them on qualifying for the next round or winning, "
            "ask them to confirm their participation, mention what comes next (finals, prizes, certificates), "
            "and express pride in their achievement. "
            "Celebratory, prestigious tone. Use {participant_name} placeholder."
        ),
        "all_participants": (
            "Thank you email sent to all participants at the end of the event. "
            "It should: thank everyone for participating, acknowledge the effort put in, "
            "mention certificates will be shared, and invite them to subscribe for future events. "
            "Warm, appreciative tone. Use {participant_name} placeholder."
        ),
        "default": (
            "Progression/closing email. Thank participants and share next steps."
        ),
    },
}


def draft_communication(
    stage: str,
    recipient_type: str,
    event_name: str,
    extra_context: Optional[str] = None,
    team_info: Optional[Dict] = None,
) -> Dict[str, str]:

    # Get stage-specific instructions
    stage_instructions = _STAGE_INSTRUCTIONS.get(stage, {})
    instruction = stage_instructions.get(recipient_type) or stage_instructions.get("default") or (
        f"Draft a professional email for the '{stage}' stage of a hackathon, addressed to {recipient_type}."
    )

    extra = f"\nAdditional context: {extra_context}" if extra_context else ""
    team_ctx = f"\nTeam Info: {json.dumps(team_info)}" if team_info else ""

    prompt = f"""You are drafting an official email for a hackathon event management system.

Event Name: {event_name}
Pipeline Stage: {stage}
Recipient: {recipient_type.replace('_', ' ').title()}

Email Purpose:
{instruction}
{extra}
{team_ctx}

Requirements:
- Use {{participant_name}} as the salutation placeholder (e.g. "Dear {{participant_name}},")
- Subject line should be specific and action-oriented, not generic
- Body should be 150-250 words — professional but warm
- End with "Best regards,\\nEventCraft Committee"
- Do NOT include placeholder URLs or fake links
- Do NOT use markdown formatting in the body

Return ONLY a JSON object inside a ```json block with exactly two keys:
- "subject": the email subject line
- "body": the full email body text

```json
{{"subject": "...", "body": "..."}}
```"""

    system = (
        "You are an expert event communications manager drafting emails for a hackathon. "
        "Return only valid JSON with 'subject' and 'body' keys. No extra text."
    )
    result = _call(prompt, system)
    parsed = _extract_json(result)
    if isinstance(parsed, dict) and "subject" in parsed and "body" in parsed:
        # Validate content quality
        if len(parsed["body"]) > 50 and not parsed["subject"].startswith("["):
            return parsed

    # Fallback
    return {
        "subject": f"[{event_name}] {stage} Update",
        "body": f"Dear {{participant_name}},\n\nThis is an update regarding the {stage} phase of {event_name}.\n\nPlease check your participant portal for the latest information.\n\nBest regards,\nEventCraft Committee",
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
    """
    Use Groq LLM to parse a candidate's resume and extract structured profile details
    including an AI fit score and skill breakdown.
    """
    prompt = f"""You are an expert resume screener for a competitive hackathon registration system.
Analyze the following resume and return ONLY a valid JSON object with NO markdown fences, backticks, or extra text.

JSON Structure:
{{
  "name": "full name",
  "email": "email address or empty string",
  "institution": "university or college name or empty string",
  "level": "one of exactly: Beginner, Intermediate, Advanced, Expert",
  "skills": "comma-separated technical skills e.g. Python, React, ML, Docker",
  "summary": "one sentence describing this candidate's strongest technical area",
  "fit_score": <integer 0-100 representing overall hackathon readiness>,
  "fit_breakdown": {{
    "technical_depth": <0-25, score for depth of technical skills>,
    "project_experience": <0-25, score for hands-on project/internship experience>,
    "collaboration": <0-25, score for teamwork, open source, or group project evidence>,
    "innovation": <0-25, score for creative or research work, novel projects>
  }},
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "flags": ["any concern or gap, or empty list if none"]
}}

Scoring guide:
- fit_score = sum of all fit_breakdown values (max 100)
- 80-100: Exceptional candidate, strong technical background
- 60-79: Good candidate, solid skills with some gaps
- 40-59: Average candidate, basic skills present
- 0-39: Weak fit, limited relevant experience

Experience level guide:
- Beginner: 0-1yr or student with no internships
- Intermediate: 1-2yr or student with 1 internship
- Advanced: 2-4yr or multiple internships/projects
- Expert: 4+yr or significant open source/research contributions

Resume Text:
{text[:4000]}
"""
    system = "You are a JSON resume screener for hackathon registration. Output only valid raw JSON, no markdown."
    response_text = _call(prompt, system=system).strip()

    # Try to extract JSON
    parsed = _extract_json(response_text)
    if not isinstance(parsed, dict):
        try:
            start = response_text.find('{')
            end = response_text.rfind('}')
            if start != -1 and end != -1:
                parsed = json.loads(response_text[start:end+1])
        except Exception:
            parsed = None

    if isinstance(parsed, dict):
        # Validate and clamp fit_score
        if "fit_score" not in parsed:
            breakdown = parsed.get("fit_breakdown", {})
            parsed["fit_score"] = sum(breakdown.values()) if breakdown else 50
        parsed["fit_score"] = max(0, min(100, int(parsed.get("fit_score", 50))))
        # Ensure required fields exist
        parsed.setdefault("strengths", [])
        parsed.setdefault("flags", [])
        parsed.setdefault("fit_breakdown", {
            "technical_depth": 0, "project_experience": 0,
            "collaboration": 0, "innovation": 0
        })
        return parsed

    return {
        "name": "",
        "email": "",
        "institution": "",
        "level": "Intermediate",
        "skills": "",
        "summary": "Failed to parse resume text.",
        "fit_score": 0,
        "fit_breakdown": {"technical_depth": 0, "project_experience": 0, "collaboration": 0, "innovation": 0},
        "strengths": [],
        "flags": ["Could not extract resume content — please upload a text-based PDF or .txt file"],
    }


# ── Dynamic Event Configuration Agent ─────────────────────────────────────────

SYSTEM_PROMPT = """You are EventCraft's intelligent event configuration assistant.
Your job is to configure a complete event pipeline from a natural language description.

When the user describes their event, extract ALL of the following:
1. Event phases/stages (in order) with descriptions and tasks
2. Team formation rules (team size, skill balance, institution diversity, experience grouping)
3. Evaluation criteria and scoring weights
4. Communication touchpoints (which stages need emails, and to whom)
5. Anomaly threshold for score divergence

CRITICAL RULES ABOUT WHEN TO ASK vs WHEN TO GENERATE:
- If the user gives ONLY a vague description (e.g. "organize a hackathon", "plan an event", "set up a competition") WITHOUT specifying team size, judging criteria, number of participants, or duration — you MUST ask clarifying questions. Do NOT generate a config from vague input.
- Ask specific questions: How many participants? Individual or team-based? If teams, what size? How long is the event? What will judges evaluate? Any special stages beyond the standard ones?
- Only generate the full config once you have: event type, participant count OR team size, judging criteria, and event duration.
- If the user gives a detailed description (e.g. "2-day ML hackathon, 60 participants, teams of 3, judged on Innovation, Execution, Presentation, Impact"), generate immediately.

WHEN YOU GENERATE, your response must have TWO parts:
1. A DETAILED summary (not brief) — cover every decision you made: all stages and why, team rules and why, all criteria and their weights, which stages get emails and to whom, the anomaly threshold and what it means. This should be 10-15 lines minimum. Do NOT say "brief summary". Do NOT say "Here is the JSON configuration" or "Here is the configuration".
2. The JSON block — output it silently at the end with no label or introduction before it.

- Adapt stages to the event type. A hackathon has different stages than a case competition or coding contest.
- For individual competitions (no teams), set team_size to 1.
- Always include at least: registration/intake, evaluation, and results stages.
- Evaluation criteria should match the event type.
- communication_stages must be a list of objects with "stage" and "recipient_type" fields.
- recipient_type must be one of: "all_participants", "judges", "winners".

When ready, output the JSON block with no additional text after it.

```json
{
  "pipeline_ready": true,
  "stages": [
    {
      "name": "Participant Intake",
      "description": "Register and verify all participants, collect skill declarations.",
      "tasks": ["Open registration portal", "Collect participant profiles", "Verify eligibility", "Approve roster"],
      "allows_submission": false,
      "is_evaluation": false,
      "portal_description": "Registration is open. Your profile has been received."
    },
    {
      "name": "Team Formation",
      "description": "Form balanced teams based on skills and institutional diversity.",
      "tasks": ["Configure formation rules", "Run AI team formation", "Review proposed teams", "Approve compositions"],
      "allows_submission": false,
      "is_evaluation": false,
      "portal_description": "Teams are being formed. You'll receive an email once your team assignment is confirmed."
    },
    {
      "name": "Hacking",
      "description": "Teams work on their AI/ML projects.",
      "tasks": ["Provide project guidelines", "Offer mentorship and support", "Monitor progress", "Ensure resource availability"],
      "allows_submission": true,
      "is_evaluation": false,
      "portal_description": "Hacking is in progress! Build your project and submit it using the My Submission Hub."
    },
    {
      "name": "Evaluation",
      "description": "Judges evaluate team submissions across defined criteria.",
      "tasks": ["Open evaluation portal", "Collect judge scores", "Aggregate and normalize scores", "Flag anomalies for review"],
      "allows_submission": false,
      "is_evaluation": true,
      "portal_description": "Evaluation is underway. Judges are reviewing all team submissions."
    },
    {
      "name": "Results",
      "description": "Compile final rankings and announce winners.",
      "tasks": ["Calculate final rankings", "Generate result reports", "Prepare certificates", "Draft announcement communications"],
      "allows_submission": false,
      "is_evaluation": false,
      "portal_description": "Results are being compiled. Final rankings will be announced soon."
    },
    {
      "name": "Progression",
      "description": "Advance qualifying participants to the next round or finale.",
      "tasks": ["Identify qualifying teams", "Send progression notifications", "Update participant statuses", "Archive event data"],
      "allows_submission": false,
      "is_evaluation": false,
      "portal_description": "Qualifying teams are being notified for the next round."
    }
  ],
  "formation_rules": {
    "team_size": 3,
    "allow_incomplete_teams": false,
    "skill_balance": true,
    "institution_diversity": true,
    "max_per_institution": 1,
    "experience_level_grouping": "mixed",
    "max_teams": 20
  },
  "evaluation_criteria": ["Innovation", "Execution", "Presentation", "Impact"],
  "scoring_weights": {
    "Innovation": 0.25,
    "Execution": 0.25,
    "Presentation": 0.25,
    "Impact": 0.25
  },
  "anomaly_threshold": 2.5,
  "communication_stages": [
    {"stage": "Participant Intake", "recipient_type": "all_participants"},
    {"stage": "Team Formation",     "recipient_type": "all_participants"},
    {"stage": "Evaluation",         "recipient_type": "judges"},
    {"stage": "Evaluation",         "recipient_type": "all_participants"},
    {"stage": "Results",            "recipient_type": "all_participants"},
    {"stage": "Progression",        "recipient_type": "winners"}
  ]
}
```

Adapt ALL fields based on the user's description:
- Hackathon → stages: Intake, Team Formation, Hacking, Evaluation, Results, Progression
- Coding contest → stages: Registration, Qualification Round, Final Round, Results
- Case competition → stages: Registration, Submission, Presentation, Final Pitch, Results
- Individual event → team_size: 1, skip Team Formation stage
- Custom event → infer appropriate stages from the description

For each stage in your stages list, you MUST explicitly set:
- "allows_submission": true if teams/participants build and submit their project, code, slides, or presentation during this stage, false otherwise.
- "is_evaluation": true if this is the evaluation, judging, or peer review stage where judges/peers rate and score the projects, false otherwise.
- "portal_description": A friendly, participant-facing status message to be displayed on their portal during this stage (e.g. "Hacking is in progress! Build your project and submit it using the My Submission Hub" or "Evaluation is underway. Judges are reviewing all team submissions.").

Always make scoring_weights sum to 1.0. Always include all 6 communication_stages entries (or adapt to your custom stages). Always set pipeline_ready to true when you have enough info."""


def agent_chat(
    history: List[Dict[str, str]],
    new_message: str,
) -> Dict[str, Any]:
    """Multi-turn conversation with the event config agent, trying Groq first, falling back to Gemini."""
    groq_client = _get_client()

    # 1. Try Groq first if client is configured
    if groq_client is not None:
        try:
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]

            for msg in history:
                role = "user" if msg["role"] == "user" else "assistant"
                messages.append({"role": role, "content": msg["parts"]})

            messages.append({"role": "user", "content": new_message})

            response = _chat_completion_with_fallback(
                client=groq_client,
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
        except Exception as groq_err:
            print(f"[Agent Fallback] Groq agent chat failed: {groq_err}. Trying Gemini...")
            
            # Fall back to Gemini if configured
            if _use_gemini():
                try:
                    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

                    for msg in history:
                        role = "user" if msg["role"] == "user" else "assistant"
                        messages.append({"role": role, "content": msg["parts"]})

                    messages.append({"role": "user", "content": new_message})

                    reply = _call_gemini_api(messages, max_tokens=4096)

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
                except Exception as gemini_err:
                    return {
                        "reply": f"Both Groq and Gemini failed. Groq: {groq_err}. Gemini: {gemini_err}",
                        "pipeline_config": None,
                        "pipeline_ready": False,
                        "needs_clarification": False,
                    }

            # If Gemini not configured, handle original Groq error
            if _is_rate_limit_error(groq_err):
                msg = "Groq rate limit hit — wait a moment and try again."
            elif _is_auth_error(groq_err):
                _reset_client()
                msg = "Invalid Groq API key — check GROQ_API_KEY in backend/.env"
            else:
                msg = f"I encountered an error: {groq_err}. Please check your Groq API key in backend/.env"
            return {
                "reply": msg,
                "pipeline_config": None,
                "pipeline_ready": False,
                "needs_clarification": False,
            }

    # 2. Try Gemini directly if Groq key is not set but Gemini key is
    if _use_gemini():
        try:
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]

            for msg in history:
                role = "user" if msg["role"] == "user" else "assistant"
                messages.append({"role": role, "content": msg["parts"]})

            messages.append({"role": "user", "content": new_message})

            reply = _call_gemini_api(messages, max_tokens=4096)

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
                "reply": f"Gemini encountered an error: {e}. Please check your GEMINI_API_KEY in backend/.env",
                "pipeline_config": None,
                "pipeline_ready": False,
                "needs_clarification": False,
            }

    # 3. Neither configured
    return {
        "reply": "Neither Groq nor Gemini API keys are configured. Please add GROQ_API_KEY or GEMINI_API_KEY to backend/.env",
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


def omni_agent_chat(
    role: str,
    context: str,
    history: List[Dict[str, str]],
    new_message: str,
) -> str:
    """Multi-turn conversation with the EventCraft Omni-Agent (Admin/Judge/Participant) using Groq."""
    client = _get_client()
    if client is None:
        return "Groq API key not configured. Please add GROQ_API_KEY to backend/.env (get a free key at https://console.groq.com)"

    try:
        # Build prompt based on role
        if role == "admin":
            system_prompt = f"""You are EventCraft Copilot — a powerful AI assistant for hackathon organizers.
Your tone is professional, direct, and action-oriented.

LIVE EVENT DATA:
{context}

You can answer questions about the event AND execute real actions. When asked to perform an action, ALWAYS confirm you are executing it and append EXACTLY ONE action block at the very end of your reply in this precise format:
[[[ACTION: {{"type": "<action_type>"}}]]]

Supported actions (only use the exact type strings below):
- "form_teams" → Run AI team formation for unassigned participants
- "show_scores" → Retrieve all judge scores and evaluation breakdowns
- "advance_stage" → Immediately advance the pipeline to the next stage
- "approve_formation" → Approve the currently pending team formation proposal

Recognition rules:
- "form teams", "create teams", "run team formation" → "form_teams"
- "show scores", "who scored what", "judge scores", "evaluation results", "what did judges score" → "show_scores"
- "advance stage", "next stage", "move to next stage" → "advance_stage"
- "approve teams", "approve formation" → "approve_formation"

IMPORTANT: Output the action block on its own line at the very end. Never output more than one action block. If no action is requested, just answer conversationally."""

        elif role == "judge":
            system_prompt = f"""You are the EventCraft Judge Assistant. You assist the event evaluators/judges.
Your tone is objective, helpful, and fair.

Here is the current evaluation and rubric context:
{context}

You help the judge understand evaluation rubrics, find project details, and recall their scoring notes. Keep the conversation focused strictly on the event criteria and submissions."""

        else:  # participant
            system_prompt = f"""You are the EventCraft Project Mentor — a dedicated AI guide for hackathon participants.
Your tone is encouraging, insightful, creative, and technical.

Your participant's context:
{context}

YOUR ROLE — YOU ARE ONLY A MENTOR:
- Help brainstorm features and innovative ideas for the project
- Critique pitch decks, project descriptions, and demo scripts
- Give technical advice on architecture, APIs, tools, or code
- Help align the project with the event's scoring rubric weights
- Suggest how to present the project compellingly to judges

HARD RESTRICTIONS:
- You CANNOT execute any system commands or actions
- Do NOT reveal other teams' names, projects, or scores (you don't know them)
- Do NOT reveal other judges' identities or notes
- If asked to do something administrative (like form teams or advance stages), politely decline and say only organizers can do that"""

        # Build messages array
        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": new_message})

        response = _chat_completion_with_fallback(
            client=client,
            messages=messages,
            temperature=0.7,
            max_tokens=4096,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        if _is_rate_limit_error(e):
            return "Groq rate limit hit — wait a moment and try again."
        if _is_auth_error(e):
            _reset_client()
            return "Invalid Groq API key — check GROQ_API_KEY in backend/.env"
        return f"I encountered an error: {e}."

