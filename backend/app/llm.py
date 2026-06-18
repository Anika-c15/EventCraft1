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

    # All text-out models from Google AI Studio — ordered newest-first.
    # On a 429 / rate-limit the system automatically falls through to the next model.
    gemini_models = [
        "gemini-3.5-flash",       # Gemini 3.5 Flash
        "gemini-3.1-pro",         # Gemini 3.1 Pro
        "gemini-3.1-flash-lite",  # Gemini 3.1 Flash Lite
        "gemini-3.0-flash",       # Gemini 3 Flash
        "gemini-2.5-pro",         # Gemini 2.5 Pro
        "gemini-2.5-flash",       # Gemini 2.5 Flash
        "gemini-2.5-flash-lite",  # Gemini 2.5 Flash Lite
        "gemini-2.0-flash",       # Gemini 2 Flash
        "gemini-2.0-flash-lite",  # Gemini 2 Flash Lite
    ]
    last_err = None
    for model_name in gemini_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                
                try:
                    res_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    print(f"[Gemini LLM] Model {model_name} succeeded!")
                    return res_text
                except (KeyError, IndexError):
                    raise ValueError(f"Unexpected response format from Gemini: {data}")
        except Exception as err:
            print(f"[Gemini LLM] Model {model_name} failed: {err}")
            last_err = err
            continue

    raise ValueError(f"All Gemini models failed. Last error: {last_err}")


def _call_with_provider(prompt: str, system: Optional[str] = None) -> tuple[str, str]:
    """Single-turn call, trying Groq first, with fallback to Gemini. Returns (response_text, provider_name)."""
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
            return response.choices[0].message.content.strip(), "groq"
        except Exception as groq_err:
            print(f"[LLM Fallback] Groq call failed: {groq_err}. Trying Gemini...")
            # If Groq fails, fall back to Gemini if configured
            if _use_gemini():
                try:
                    messages = []
                    if system:
                        messages.append({"role": "system", "content": system})
                    messages.append({"role": "user", "content": prompt})
                    return _call_gemini_api(messages), "gemini"
                except Exception as gemini_err:
                    return f"[Gemini Fallback Error: {gemini_err} (Groq error was: {groq_err})]", "gemini"
            
            # If Gemini not configured, handle original Groq error
            if _is_rate_limit_error(groq_err):
                return "[Groq rate limit hit — wait a moment and try again]", "groq"
            if _is_auth_error(groq_err):
                _reset_client()
                return "[Invalid Groq API key — check GROQ_API_KEY in backend/.env]", "groq"
            return f"[LLM Error: {groq_err}]", "groq"

    # If Groq client is not configured, try Gemini directly
    if _use_gemini():
        try:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
            return _call_gemini_api(messages), "gemini"
        except Exception as e:
            return f"[Gemini Error: {e}]", "gemini"

    return "[LLM not configured — add GROQ_API_KEY or GEMINI_API_KEY to backend/.env]", "none"


def _call(prompt: str, system: Optional[str] = None) -> str:
    """Single-turn call, trying Groq first, with fallback to Gemini."""
    res, _ = _call_with_provider(prompt, system)
    return res


@lru_cache(maxsize=128)
def check_stage_allows_submission(stage_name: str, stage_description: str) -> bool:
    """
    Use Groq LLM to dynamically classify if a pipeline stage allows project submissions.
    Returns False if LLM is not configured, fails, or returns a non-boolean response.
    """
    client = _get_client()
    if client is not None:
        try:
            prompt = f"""Analyze if the following event pipeline stage is a hacking, prototyping, development, or submission stage where teams actively build and submit their project details.
            Only hacking, prototyping, development, or specific submission stages allow teams to submit their project links and details.
            Stages like participant intake, registration, team formation, evaluation, judging, peer review, or final results/announcements do NOT allow project submissions.
            
            Stage Name: {stage_name}
            Stage Description: {stage_description}
            
            Respond with EXACTLY 'true' or 'false' and nothing else."""
            
            system = "You are an AI classifier. Determine if the stage allows project submissions. Respond with only 'true' or 'false'."
            res = _call(prompt, system=system).strip().lower()
            if "true" in res:
                return True
            elif "false" in res:
                return False
        except Exception as e:
            print(f"⚠️ Groq stage classification error: {e}")

    return False


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
    Returns False if LLM is not configured, fails, or returns a non-boolean response.
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
            elif "false" in res:
                return False
        except Exception as e:
            print(f"⚠️ Groq stage classification error: {e}")

    return False


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
    event_description: str = "",
    project_title: str = "",
    project_description: str = "",
    github_url: str = "",
    members: Optional[List[Dict]] = None,
) -> str:
    criteria_str = ", ".join(criteria) if criteria else "Innovation, Execution, Presentation, Impact"
    challenge_str = challenge or project_title or "General hackathon challenge"

    member_lines = ""
    if members:
        member_lines = "\n".join(
            f"- {m['name']} ({m.get('institution', 'Unknown')}, {m.get('level', 'Intermediate')}): {', '.join(m.get('skills', [])) or 'No skills listed'}"
            for m in members
        )
    else:
        member_lines = "Member details not available"

    project_ctx = ""
    if project_title:
        project_ctx += f"\nProject Title: {project_title}"
    if project_description:
        project_ctx += f"\nProject Description: {project_description[:800]}"
    if github_url:
        project_ctx += f"\nGitHub: {github_url}"

    prompt = f"""You are an expert judge advisor for a competitive event. Generate a highly specific, actionable evaluation guide for a judge assessing this team. The guide must be TAILORED to the team's actual project and members — not generic.

Event: {event_name}
{f'Event Description: {event_description}' if event_description else ''}
Team: {team_name}
Challenge/Focus: {challenge_str}
{project_ctx}

Team Members:
{member_lines}

Evaluation Criteria: {criteria_str}

Generate a structured guide with these exact sections:

1. PROJECT OVERVIEW
2-3 sentences summarizing what this team built based on their description.

2. WHAT TO LOOK FOR
For each criterion, 1-2 specific things to assess based on THIS project:
{chr(10).join(f'- {c}: what specifically to evaluate for this project' for c in criteria)}

3. SAMPLE QUESTIONS TO ASK
5-7 specific questions about their actual project — reference their tech stack, project description, or specific choices they made. Make them probing and technical.

4. SCORING GUIDE
Brief calibration: what 9-10 looks like vs 6-7 vs 3-4 for this specific project type.

5. RED FLAGS TO WATCH
2-3 things that would indicate a weak submission for this type of project.

Be specific. Reference the actual project title, description, and team skills. Do NOT give generic hackathon advice."""

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


def classify_is_resume(
    text: str,
    event_name: str = "",
    event_description: str = "",
    event_type: str = "",
) -> tuple[bool, str]:
    """
    Use LLM to determine if the uploaded document is a resume/CV suitable for this event.
    Works for any domain — tech, design, business, arts, sports, etc.
    Returns (is_resume, rejection_reason).
    """
    event_ctx = ""
    if event_name or event_description or event_type:
        event_ctx = f"""
Event Context:
- Event Name: {event_name}
- Event Type: {event_type or 'Hackathon/Competition'}
- Event Description: {event_description}

Consider what a valid participant profile document looks like for THIS specific event.
For example, a design competition may accept portfolios; a business case competition may accept project summaries.
"""

    prompt = f"""You are a document classifier for an event registration system. Determine if the uploaded document is a valid participant profile document (resume, CV, or equivalent) for this event.

{event_ctx}
A valid document for registration is one where a person presents their:
- Personal information (name, contact details)
- Education or academic background  
- Work experience, projects, or relevant activities
- Skills, competencies, or achievements
- Any combination relevant to participating in this event

Documents that should be REJECTED include:
- Offer letters or appointment letters
- Award certificates or completion certificates
- Mark sheets or grade transcripts  
- Invoices, receipts, or financial documents
- Legal contracts or agreements
- Recommendation or reference letters
- College admission letters
- Any official letter FROM an organization TO the candidate

Document to classify:
---
{text}
---

Respond with ONLY valid JSON, no other text:
{{"is_resume": true}} if it is a valid participant profile document
{{"is_resume": false, "reason": "brief explanation of what the document is"}} if it should be rejected"""

    system = "You are a strict document classifier for event registration. Respond only with valid JSON."
    response = _call(prompt, system=system).strip()

    parsed = _extract_json(response)
    if isinstance(parsed, dict):
        if parsed.get("is_resume") is True:
            return True, ""
        reason = parsed.get("reason", "This file doesn't appear to be a resume or CV.")
        return False, f"Invalid document: {reason}. Please upload your resume or CV."

    # Fallback — if LLM fails, allow through rather than blocking a valid resume
    return True, ""


def extract_profile_from_resume(text: str, event_context: Optional[dict] = None) -> dict:
    """
    Use LLM to parse a resume and score candidate fit against the specific event.
    """
    # Build event-specific scoring instructions
    event_name = event_context.get("event_name", "Hackathon") if event_context else "Hackathon"
    event_desc = event_context.get("description", "") if event_context else ""
    criteria = event_context.get("evaluation_criteria", []) if event_context else []
    event_type = event_context.get("event_type", "") if event_context else ""
    criteria_str = ", ".join(criteria) if criteria else "Innovation, Execution, Presentation, Impact"

    event_ctx_str = f"""
EVENT CONTEXT (use this to calibrate fit scoring):
- Event Name: {event_name}
- Event Type: {event_type or "Hackathon"}
- Event Description: {event_desc or "A competitive hackathon for developers and engineers"}
- Evaluation Criteria: {criteria_str}

SCORING CALIBRATION RULES:
1. Score technical_depth based on how well the candidate's skills match the event type.
   - For AI/ML events: Python, TensorFlow, PyTorch, NLP, CV, data science skills score high
   - For web/product events: React, Node.js, design, UX, APIs score high
   - For general hackathons: breadth of tech stack matters
2. Score project_experience based on ACTUAL projects, internships, research in the resume — not just listed skills
3. Score collaboration based on team projects, open source contributions, GitHub activity, group work mentioned
4. Score innovation based on research papers, novel projects, patents, creative solutions described
5. strengths MUST reference specific things from the resume (e.g. "Built a CNN classifier for medical imaging" not "Good at ML")
6. flags MUST be specific gaps relevant to THIS event (e.g. "No Python experience for an AI hackathon" not generic "limited experience")
7. Be STRICT — a fresh graduate with no projects should score 30-45, not 70+
8. Be ACCURATE — do not hallucinate skills or projects not present in the resume
"""

    prompt = f"""You are a rigorous technical screener for a competitive hackathon. Your job is to ACCURATELY assess a candidate's fit for a specific event based ONLY on what is written in their resume. Do NOT assume or invent skills or experience not explicitly mentioned.

{event_ctx_str}

Return ONLY a valid JSON object. No markdown, no explanation, no extra text.

JSON structure:
{{
  "name": "candidate's full name from resume",
  "email": "email address found in resume, or empty string",
  "institution": "university or college name, or empty string",
  "level": "one of: Beginner, Intermediate, Advanced, Expert",
  "skills": "comma-separated technical skills ONLY as listed in the resume",
  "summary": "one specific sentence about this candidate's strongest skill and how it relates to {event_name}",
  "fit_score": <integer 0-100, sum of fit_breakdown>,
  "fit_breakdown": {{
    "technical_depth": <0-25, based on depth and relevance of skills to this specific event>,
    "project_experience": <0-25, based on actual projects/internships/research explicitly mentioned>,
    "collaboration": <0-25, based on team work, open source, group projects mentioned>,
    "innovation": <0-25, based on novel/creative work, research, or original contributions>
  }},
  "strengths": [
    "specific strength from resume relevant to {event_name} (cite actual project/skill)",
    "second specific strength",
    "third specific strength"
  ],
  "flags": [
    "specific gap or concern for {event_name} based on resume (or empty list if strong fit)"
  ]
}}

EXPERIENCE LEVEL GUIDE:
- Beginner: student with no internships, <1yr experience, mostly coursework
- Intermediate: 1-2yr or 1 internship, some personal projects
- Advanced: 2-4yr or multiple internships, strong project portfolio
- Expert: 4+yr or research publications, significant open source, industry leadership

FIT SCORE GUIDE:
- 85-100: Exceptional fit, directly relevant skills and proven project experience for this event
- 65-84: Good fit, solid relevant skills with minor gaps
- 45-64: Moderate fit, some relevant skills but missing key areas
- 25-44: Weak fit, limited relevant experience for this event type
- 0-24: Poor fit, missing most required skills/experience

Resume to analyze:
---
{text[:5000]}
---"""

    system = "You are a strict, accurate technical resume screener for hackathon registration. Output only valid raw JSON. Do not hallucinate. Only report what is explicitly in the resume."
    response_text = _call(prompt, system=system).strip()
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

When the user describes their event, you MUST collect ALL of the following before generating any configuration:
1. Event type and format (hackathon, case competition, coding contest, etc.)
2. Number of participants and event duration
3. Team structure — individual or team-based; if teams, exact team size
4. Pipeline stages appropriate for this event type
5. Evaluation criteria (what judges will score on)
6. Scoring balance weights — MANDATORY: exact percentages for Expert Judges, Peer Reviews, and Social Scraping that sum to 100%
7. Team formation rules:
   - Enable skill balancing? (match technical and non-technical profiles)
   - Enforce institutional diversity? (max participants per school/company per team)
   - How to group experience levels? (mixed / similar / none)
8. Anomaly threshold — at what score deviation (in points) should a judge's score be flagged as anomalous?
9. Scoring criteria weights — should all evaluation criteria be weighted equally or prioritized differently?

YOUR CONVERSATION APPROACH:
- When a user gives you a description, acknowledge what you understood and ask ONLY about what is missing.
- Be specific in your questions — reference the event details they gave you (e.g., "Since you have 60 participants in teams of 3, that gives 20 teams — do you want skill balancing enabled?")
- Ask questions in a numbered list for clarity.
- Do NOT generate the configuration until ALL 9 items above are confirmed by the user.
- Do NOT assume defaults for scoring weights, anomaly threshold, or team formation rules — always ask.
- NEVER output JSON in your conversational replies. The JSON block is generated silently after the summary.

WHEN YOU ARE READY TO GENERATE (all 9 items confirmed):
1. Write a detailed summary (10-15 lines) covering every decision made.
2. Silently append the JSON config block at the very end with NO label or introduction.

NEVER output:
- "Here is the JSON configuration"
- "Here is the configuration"  
- Raw JSON in the middle of your response
- Assumptions about scoring weights, anomaly threshold, or formation rules

When ready to generate, output the JSON block silently at the end with no label. The JSON must follow this structure:

```json
{
  "pipeline_ready": true,
  "description": "concise 1-2 sentence event description",
  "stages": [{"name": "...", "description": "...", "tasks": [], "allows_submission": false, "is_evaluation": false, "portal_description": "..."}],
  "formation_rules": {"team_size": 3, "allow_incomplete_teams": false, "skill_balance": true, "institution_diversity": true, "max_per_institution": 1, "experience_level_grouping": "mixed", "max_teams": 20},
  "evaluation_criteria": ["Innovation", "Execution", "Presentation", "Impact"],
  "scoring_weights": {"Innovation": 0.25, "Execution": 0.25, "Presentation": 0.25, "Impact": 0.25},
  "scoring_balance": {"judge": 0.70, "peer": 0.15, "social": 0.15},
  "anomaly_threshold": 2.5,
  "communication_stages": [{"stage": "Participant Intake", "recipient_type": "all_participants"}]
}
```"""


def _extract_json(reply: str) -> Optional[Dict[str, Any]]:
    # Try markdown code block first
    json_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", reply)
    if json_match:
        try:
            return json.loads(json_match.group(1).strip())
        except Exception:
            pass
    # Fallback: find first '{' and last '}'
    start = reply.find('{')
    end = reply.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(reply[start:end+1].strip())
        except Exception:
            pass
    return None


def _agent_chat_inner(
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

            config = _extract_json(reply)
            if config and config.get("pipeline_ready"):
                pipeline_config = config
                pipeline_ready = True

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

                    config = _extract_json(reply)
                    if config and config.get("pipeline_ready"):
                        pipeline_config = config
                        pipeline_ready = True

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

            config = _extract_json(reply)
            if config and config.get("pipeline_ready"):
                pipeline_config = config
                pipeline_ready = True

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


def _user_has_specified_scoring(history: List[Dict[str, str]], new_message: str) -> bool:
    user_msgs = [m["parts"] for m in history if m["role"] == "user"] + [new_message]
    combined_text = "\n".join(user_msgs).lower()
    
    # 1. Look for percentage numbers (e.g., 90%, 80 %, 100%)
    if re.search(r"\d+\s*%", combined_text):
        return True
        
    # 2. Look for ratios (e.g., 80/20, 70/15/15, 90/10)
    if re.search(r"\d+/\d+", combined_text):
        return True
        
    # 3. Look for explicit scoring configuration keywords (excluding general "judged")
    keywords = [
        "scoring weights", "scoring weight", "scoring balance",
        "judge weight", "peer weight", "social weight",
        "expert weight", "distribution of weights", "percentage of judge",
        "percentage of peer", "percentage of social",
        "default scoring", "default weights", "default balance",
        "default scoring weights"
    ]
    for kw in keywords:
        if kw in combined_text:
            return True
            
    return False


def agent_chat(
    history: List[Dict[str, str]],
    new_message: str,
) -> Dict[str, Any]:
    """Wraps inner agent chat, enforcing ALL preferences are asked before generating."""
    res = _agent_chat_inner(history, new_message)

    if res.get("reply"):
        # ── Strip ALL JSON from reply — never show raw JSON to user ──────────
        reply_text = res["reply"]
        # Remove ```json ... ``` blocks
        reply_text = re.sub(r"```json[\s\S]*?```", "", reply_text).strip()
        # Remove ``` ... ``` blocks
        reply_text = re.sub(r"```[\s\S]*?```", "", reply_text).strip()
        # Remove any raw JSON object that starts with { — everything from first { onwards
        brace_start = reply_text.find('{')
        if brace_start != -1:
            reply_text = reply_text[:brace_start].strip()
        # Clean trailing intro phrases
        reply_text = re.sub(
            r"\s*(here is the |here's the |here is a |here's a |json configuration|json config|configuration|summary)[:\s]*$",
            "",
            reply_text,
            flags=re.IGNORECASE
        ).strip()
        res["reply"] = reply_text

    # ── Hard enforcement: ALL preferences must be specified before generating ──
    if res.get("pipeline_ready") and res.get("pipeline_config"):
        combined = " ".join(
            [m.get("parts", "") for m in history] + [new_message]
        ).lower()

        missing = []

        # 1. Team size / participant count
        has_team_info = any(kw in combined for kw in [
            "team of", "teams of", "team size", "participants", "people", "students",
            "individual", "solo", "per team", "members per", "group of", "team size"
        ])
        if not has_team_info:
            missing.append("**Team size or participant count** — How many participants? Individual or team-based? If teams, what size?")

        # 2. Event duration
        has_duration = any(kw in combined for kw in [
            "day", "hour", "week", "48", "24", "72", "duration", "long", "weekend", "month"
        ])
        if not has_duration:
            missing.append("**Event duration** — How long is the event?")

        # 3. Evaluation criteria
        has_criteria = any(kw in combined for kw in [
            "judg", "evaluat", "criteria", "scor", "innovat", "execut", "present", "impact",
            "criterion", "metric", "parameter"
        ])
        if not has_criteria:
            missing.append("**Evaluation criteria** — What will judges evaluate? (e.g. Innovation, Execution, Presentation, Impact)")

        # 4. Scoring balance weights (judge vs peer vs social)
        if not _user_has_specified_scoring(history, new_message):
            missing.append("**Scoring balance weights** — How should the final score be calculated? (e.g. 100% Expert Judge, or 70% Judge / 15% Peer / 15% Social Scraping)")

        # 5. Team formation rules
        has_formation = any(kw in combined for kw in [
            "skill balance", "institution diversity", "experience", "mixed", "similar",
            "formation rule", "team rule", "diversity", "skill mix", "max per institution",
            "institutional", "diverse"
        ])
        if not has_formation:
            missing.append("**Team formation preferences** — Should teams be skill-balanced? Enforce institutional diversity? How should experience levels be grouped? (mixed / similar)")

        # 6. Anomaly threshold
        has_anomaly = any(kw in combined for kw in [
            "anomaly", "threshold", "divergence", "deviation", "flag", "outlier"
        ])
        if not has_anomaly:
            missing.append("**Anomaly threshold** — What score deviation should flag a judge's score as anomalous? (e.g. 2.0 or 2.5 points)")

        if missing:
            res["pipeline_ready"] = False
            res["pipeline_config"] = None
            res["needs_clarification"] = True
            # Keep the LLM's reply if it's already asking questions naturally
            current_reply = res.get("reply", "")
            is_already_asking = len(current_reply) > 80 and any(
                q in current_reply.lower() for q in ["?", "please", "specify", "would you", "how", "what", "provide"]
            )
            if is_already_asking:
                # LLM gave a good clarifying response — only append anything it missed
                extra = []
                for m in missing:
                    # Check if the key topic of this missing item is mentioned in the reply
                    topic_words = m.replace("**", "").split("—")[0].strip().lower().split()[:4]
                    if not any(w in current_reply.lower() for w in topic_words if len(w) > 3):
                        extra.append(m.replace("**", ""))
                if extra:
                    res["reply"] = current_reply + "\n\nAlso, please clarify:\n" + "\n".join(f"- {m}" for m in extra)
            else:
                res["reply"] = (
                    "Before I generate the full configuration, I need your preferences on the following:\n\n" +
                    "\n".join(f"{i+1}. {m}" for i, m in enumerate(missing)) +
                    "\n\nPlease answer the above and I'll configure the complete pipeline for you."
                )

    return res


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
- "generate_polls" → Generate social media poll drafts for all teams and platforms
- "post_polls" → Bulk post all social media poll drafts
- "fetch_poll_results" → Fetch all completed social media poll results
- "calculate_social_scores" → Aggregate and calculate social scores for all teams
- "social_status" → Retrieve a report of the social voting campaign status

Recognition rules:
- "form teams", "create teams", "run team formation" → "form_teams"
- "show scores", "who scored what", "judge scores", "evaluation results", "what did judges score" → "show_scores"
- "advance stage", "next stage", "move to next stage" → "advance_stage"
- "approve teams", "approve formation" → "approve_formation"
- "generate polls", "create polls", "make social polls" → "generate_polls"
- "post polls", "publish polls", "share social polls" → "post_polls"
- "fetch results", "get votes", "retrieve poll results" → "fetch_poll_results"
- "calculate social", "aggregate social scores", "compute social score" → "calculate_social_scores"
- "social status", "poll status", "campaign status" → "social_status"

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


# ── Social Scraping Poll Generation & Scoring ────────────────────────────────

def generate_poll_content(
    teams: List[Dict[str, Any]],
    platform: str,
    poll_type: str,
    event_name: str,
) -> Dict[str, Any]:
    """
    Generates poll content (questions, commentary, options, and team mappings) for all teams.
    To respect the LLM free-tier rate limits, all teams are processed in a single batched call.
    """
    # Define platform constraints
    # X/Twitter: 4 options, 25 chars max per option. Question max 280.
    # LinkedIn: 4 options, 30 chars max per option. Question max 140. Commentary max 3000.
    # Instagram: 2 options, 24 chars max.
    
    teams_json = json.dumps([{"id": t["id"], "name": t["name"], "challenge": t.get("challenge", "")} for t in teams], indent=2)
    
    prompt = f"""You are EventCraft's AI Social Media coordinator.
Generate social media poll configurations for the hackathon event '{event_name}' on the platform '{platform}'.
The poll type is '{poll_type}'.

Here is the list of teams competing:
{teams_json}

Platform Constraints for '{platform}':
"""
    if platform == "twitter":
        prompt += """- Create one or more posts. 
- If rating: generate 1 poll config per team (options must represent a rating scale e.g. "⭐ Amazing!", "👍 Good", "👎 Needs Work").
- If comparative: generate 1 comparative poll listing up to 4 teams. Option texts must be the team name.
- Options: max 4 options. Max 25 characters per option text! If team names are long, truncate them.
- Commentary/Tweet text: max 280 characters.
"""
    elif platform == "linkedin":
        prompt += """- If rating: generate 1 poll config per team (options must represent a rating scale e.g. "⭐ Amazing!", "👍 Good", "👎 Needs Work").
- If comparative: generate 1 comparative poll listing up to 4 teams. Option texts must be the team name.
- Options: max 4 options. Max 30 characters per option text!
- Question text: max 140 characters.
- Commentary: max 3000 characters.
"""
    elif platform == "instagram":
        prompt += """- For Instagram, we can only do Story Poll stickers, which allow exactly 2 options.
- If rating: generate 1 poll config per team. Options must be exactly 2 choices (e.g. "⭐ Amazing!", "👍 Decent").
- If comparative: generate comparative polls pitting 2 teams against each other.
- Options: max 2 choices. Max 24 characters per option text.
- Commentary/Caption text: short and catchy.
"""
    else:  # mock
        prompt += "- Generate mock poll details. Up to 4 options.\n"

    prompt += """
Output format requirements:
Return ONLY a JSON object containing a "polls" list.
For comparative polls, map option positions to team IDs via the "option_team_mapping" object.
For rating polls, "option_team_mapping" is not needed, but "team_id" must specify which team the poll evaluates.

JSON Structure:
{
  "polls": [
    {
      "team_id": "team-uuid or null for comparative",
      "question_text": "The poll question",
      "commentary": "Catchy social media post body/commentary text",
      "options": [
        {"text": "Option text (respecting char limit)", "position": 1},
        {"text": "Option text (respecting char limit)", "position": 2}
      ],
      "option_team_mapping": {
        "position_1": "team-uuid-1",
        "position_2": "team-uuid-2"
      }
    }
  ]
}

Return ONLY valid JSON in a ```json block. Respect all char limits strictly!
"""
    system = "You are an AI social media manager. Generate poll contents complying with strict platform char limits. Return only JSON."
    
    # Simple pacing sleep before the call to avoid hitting the 15 RPM limit
    import time
    time.sleep(2.0)
    
    try:
        result, provider = _call_with_provider(prompt, system=system)
        parsed = _extract_json(result)
        if isinstance(parsed, dict) and parsed.get("polls"):
            parsed["llm_provider_used"] = provider
            return parsed
    except Exception as e:
        print(f"[LLM Error] Social poll generation failed, activating local fallback: {e}")
        provider = "local_fallback"
        
    # Programmatic fail-safe local fallback structure
    fallback_polls = []
    if poll_type == "comparative":
        max_opt_len = 25 if platform == "twitter" else (24 if platform == "instagram" else 30)
        max_options = 2 if platform == "instagram" else 4
        
        limited_teams = teams[:max_options]
        options = []
        option_team_mapping = {}
        for idx, t in enumerate(limited_teams):
            pos = idx + 1
            opt_text = t["name"]
            if len(opt_text) > max_opt_len:
                opt_text = opt_text[:max_opt_len - 2] + ".."
            options.append({"text": opt_text, "position": pos})
            option_team_mapping[f"position_{pos}"] = t["id"]
            
        fallback_polls.append({
            "team_id": None,
            "question_text": f"Which team has the best project at {event_name}?",
            "commentary": f"Cast your vote for the best project at {event_name} on {platform}!",
            "options": options,
            "option_team_mapping": option_team_mapping
        })
    else:
        max_opt_len = 25 if platform == "twitter" else (24 if platform == "instagram" else 30)
        for t in teams:
            if platform == "instagram":
                options = [
                    {"text": "⭐ Amazing!", "position": 1},
                    {"text": "👍 Good", "position": 2}
                ]
            else:
                options = [
                    {"text": "⭐ Amazing!", "position": 1},
                    {"text": "👍 Good", "position": 2},
                    {"text": "👌 Okay", "position": 3},
                    {"text": "👎 Needs Work", "position": 4}
                ]
            
            for opt in options:
                if len(opt["text"]) > max_opt_len:
                    opt["text"] = opt["text"][:max_opt_len - 2] + ".."
                    
            fallback_polls.append({
                "team_id": t["id"],
                "question_text": f"Rate the project of {t['name']}!",
                "commentary": f"How do you like the project built by {t['name']} at {event_name}? Vote now!",
                "options": options,
                "option_team_mapping": None
            })
            
    return {"polls": fallback_polls, "llm_provider_used": "local_fallback"}


def normalize_poll_votes(
    votes: Dict[str, int],
    options: List[Dict[str, Any]],
    poll_type: str,
    velocity_data: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Evaluates the vote results of a poll and calculates a normalized score from 0.0 to 10.0.
    Considers vote distribution and velocity anomalies.
    """
    votes_json = json.dumps(votes)
    options_json = json.dumps(options)
    velocity_json = json.dumps(velocity_data) if velocity_data else "None"
    
    prompt = f"""You are EventCraft's Score Normalization Engine.
Evaluate these social poll vote results and compute a final normalized score on a scale of 0.0 to 10.0.

Poll Type: {poll_type}
Options Configured: {options_json}
Final Votes Count: {votes_json}
Velocity Snapshots: {velocity_json}

Scoring Rules:
- For rating polls: Options reflect ratings (e.g. ⭐, Good, OK). Compute a weighted score based on options' positive/negative sentiment.
- For comparative polls: Calculate score based on vote share. If a team receives most of the votes, they get a high score.
- Anomaly penalty: If velocity snapshots show unnatural spikes (e.g. 50% of votes in a 5-minute window), apply a warning and reduce confidence score.

Return a JSON object with:
- "normalized_score": float (between 0.0 and 10.0)
- "rationale": str (brief explanation of the score calculation)

Output ONLY valid JSON:
```json
{{"normalized_score": 7.5, "rationale": "Explanation..."}}
```
"""
    system = "You are a score normalization engine. Compute a 0-10 score from poll votes. Return only JSON."
    
    import time
    time.sleep(1.0)
    
    result = _call(prompt, system=system)
    parsed = _extract_json(result)
    if isinstance(parsed, dict) and "normalized_score" in parsed:
        return parsed
    
    # Fallback calculation
    total = sum(votes.values())
    score = 5.0
    if total > 0:
        if poll_type in ("comparative", "twitter_text_fallback", "linkedin_text_fallback"):
            # For comparative polls, use a base score of 8.0 representing active engagement
            score = 8.0
        else:
            # Calculate a weighted score based on option sentiment or position
            weighted_sum = 0.0
            total_v = 0
            for opt_text, count in votes.items():
                opt_lower = opt_text.lower()
                
                # Check sentiment keywords or emojis
                if any(x in opt_lower for x in ["amazing", "great", "excellent", "awesome", "⭐", "5 star", "perfect", "love", "best"]):
                    weight = 10.0
                elif any(x in opt_lower for x in ["good", "like", "well done", "4 star", "fine", "👍"]):
                    weight = 7.5
                elif any(x in opt_lower for x in ["ok", "okay", "average", "decent", "neutral", "3 star", "👌"]):
                    weight = 5.0
                elif any(x in opt_lower for x in ["needs work", "bad", "poor", "dislike", "1 star", "2 star", "worst", "👎"]):
                    weight = 2.0
                else:
                    # Match by option position
                    opt_obj = next((o for o in options if o["text"] == opt_text), None)
                    if opt_obj:
                        pos = opt_obj.get("position", 1)
                        if pos == 1:
                            weight = 10.0
                        elif pos == 2:
                            weight = 7.5
                        elif pos == 3:
                            weight = 5.0
                        else:
                            weight = 2.0
                    else:
                        weight = 5.0
                        
                weighted_sum += weight * count
                total_v += count
            if total_v > 0:
                score = round(weighted_sum / total_v, 2)
    else:
        score = 0.0

    return {
        "normalized_score": score,
        "rationale": "Calculated local weighted fallback score."
    }


def aggregate_cross_platform_scores(polls_for_team: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregates scores from multiple social media platforms for a single team.
    """
    polls_json = json.dumps(polls_for_team, indent=2)
    prompt = f"""Aggregate the following social media poll scores from different platforms for a single team into a unified score on a 0.0 to 10.0 scale.

Polls Data:
{polls_json}

Calculate a vote-weighted average score:
- Platforms with more votes should carry higher weight.
- Flagged polls (e.g. vote manipulation, low vote count) should be penalized or discarded from calculation.

Return a JSON object with:
- "aggregate_score": float (between 0.0 and 10.0)
- "explanation": str (brief aggregate breakdown)

Output ONLY valid JSON:
```json
{{"aggregate_score": 8.2, "explanation": "..."}}
```
"""
    system = "You are a score aggregation assistant. Return JSON only."
    
    import time
    time.sleep(1.0)
    
    result = _call(prompt, system=system)
    parsed = _extract_json(result)
    if isinstance(parsed, dict) and "aggregate_score" in parsed:
        return parsed
        
    # Fallback
    total_votes = 0
    weighted_sum = 0.0
    valid_count = 0
    raw_sum = 0.0
    for p in polls_for_team:
        score = p.get("normalized_score")
        if score is None or p.get("flagged"):
            continue
        
        raw_sum += score
        valid_count += 1
        
        # Try to use team_votes, otherwise total_votes, default to 1
        votes_weight = p.get("team_votes")
        if votes_weight is None:
            votes_weight = p.get("total_votes", 0)
        if votes_weight <= 0:
            votes_weight = 1
            
        weighted_sum += score * votes_weight
        total_votes += votes_weight
        
    if total_votes > 0:
        agg_score = weighted_sum / total_votes
    elif valid_count > 0:
        agg_score = raw_sum / valid_count
    else:
        agg_score = 0.0
        
    return {
            "aggregate_score": round(agg_score, 2),
        "explanation": "Calculated vote-weighted average of valid platform scores."
    }


def _build_local_summary(all_polls: List[Dict[str, Any]], teams: List[Dict[str, Any]]) -> str:
    """
    Generates a simple markdown summary from raw data without calling any LLM.
    Used as a fallback when all AI providers are rate-limited or unavailable.
    """
    total_posts = len(all_polls)
    total_votes = sum(p.get("total_votes", 0) for p in all_polls)
    avg_votes = round(total_votes / total_posts, 1) if total_posts else 0
    flagged = [p for p in all_polls if p.get("flagged")]
    verified = [p for p in all_polls if p.get("status") == "verified"]

    # Platform breakdown
    platform_counts: dict = {}
    for p in all_polls:
        plat = p.get("platform", "Unknown")
        platform_counts[plat] = platform_counts.get(plat, 0) + 1

    platform_lines = "\n".join(
        f"- **{plat}**: {cnt} post(s)" for plat, cnt in sorted(platform_counts.items())
    )

    # Team leaderboard
    sorted_teams = sorted(teams, key=lambda t: t.get("social_vote_score") or 0, reverse=True)
    leaderboard_lines = []
    for i, t in enumerate(sorted_teams, 1):
        score = round(t.get("social_vote_score") or 0, 2)
        leaderboard_lines.append(f"{i}. **{t.get('name', 'Unknown')}** — Score: `{score}`")
    leaderboard = "\n".join(leaderboard_lines) if leaderboard_lines else "_No team data available._"

    return f"""## 📊 Social Campaign Summary

> ⚠️ *AI summary unavailable right now — all AI providers are busy. Showing a data-driven summary instead.*

---

### Executive Summary
- **Total Posts Submitted:** {total_posts}
- **Verified Posts:** {len(verified)}
- **Total Engagement (Likes + Shares):** {total_votes}
- **Average Engagement per Post:** {avg_votes}
- **Flagged / Failed Verification:** {len(flagged)}

---

### Platform Breakdown
{platform_lines if platform_lines else "_No posts yet._"}

---

### Team Performance Leaderboard
{leaderboard}

---


"""


def generate_social_campaign_summary(all_polls: List[Dict[str, Any]], teams: List[Dict[str, Any]]) -> tuple[str, str]:
    """
    Generates a rich, Markdown-formatted summary report of the social media scraping campaign.
    """
    polls_json = json.dumps(all_polls, indent=2)
    teams_json = json.dumps(teams, indent=2)
    
    prompt = f"""Generate a detailed social media voting campaign summary report for the hackathon.

Teams List:
{teams_json}

Polls Activity & Votes:
{polls_json}

Format the report using Markdown. Include:
1. Executive Summary (total votes across platforms, avg engagement)
2. Platform breakdown (Twitter, LinkedIn, Instagram engagement levels)
3. Highlights & Flags (any vote manipulation alerts, low votes)
4. Team Performance Leaderboard (social vote scores and aggregate highlights)
"""
    system = "You are a professional social media campaign analyst. Return a rich markdown summary."
    
    import time
    time.sleep(1.0)
    
    # Try Groq first
    groq_client = _get_client()
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
            return response.choices[0].message.content.strip(), "groq"
        except Exception as groq_err:
            print(f"[Campaign Summary] Groq failed: {groq_err}. Trying Gemini...")
            # Fall back to Gemini if configured
            if _use_gemini():
                try:
                    messages = []
                    if system:
                        messages.append({"role": "system", "content": system})
                    messages.append({"role": "user", "content": prompt})
                    return _call_gemini_api(messages), "gemini"
                except Exception as gemini_err:
                    print(f"[Campaign Summary] Gemini also failed: {gemini_err}. Using local fallback.")
                    return _build_local_summary(all_polls, teams), "local_fallback"
            
            # Gemini not configured
            print(f"[Campaign Summary] Groq failed and Gemini not configured. Using local fallback.")
            return _build_local_summary(all_polls, teams), "local_fallback"

    # If Groq client is not configured, try Gemini directly
    if _use_gemini():
        try:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
            return _call_gemini_api(messages), "gemini"
        except Exception as e:
            print(f"[Campaign Summary] Gemini failed: {e}. Using local fallback.")
            return _build_local_summary(all_polls, teams), "local_fallback"

    # Nothing configured — local data fallback
    return _build_local_summary(all_polls, teams), "local_fallback"


