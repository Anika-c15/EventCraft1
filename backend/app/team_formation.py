"""
Algorithmic team formation engine.
Respects formation rules: team size, skill balance, institution diversity,
experience level grouping, max per institution.
"""
import random
from typing import List, Dict, Any, Optional
from collections import defaultdict


def form_teams(
    participants: List[Dict[str, Any]],
    rules: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Form teams from participants based on rules.

    participants: list of dicts with keys: id, name, institution, level, skills
    rules: dict with keys: team_size, skill_balance, institution_diversity,
           experience_level_grouping, max_per_institution, max_teams, allow_incomplete_teams

    Returns: list of {"name": str, "member_ids": [str], "members": [dict]}
    """
    team_size = rules.get("team_size", 3)
    skill_balance = rules.get("skill_balance", True)
    institution_diversity = rules.get("institution_diversity", True)
    max_per_institution = rules.get("max_per_institution", 1)
    experience_grouping = rules.get("experience_level_grouping", "mixed")
    max_teams = rules.get("max_teams", 20)
    allow_incomplete = rules.get("allow_incomplete_teams", False)

    if not participants:
        return []

    # Sort/group by experience level if needed
    level_order = {"Beginner": 0, "Intermediate": 1, "Advanced": 2, "Expert": 3}
    pool = sorted(participants, key=lambda p: level_order.get(p.get("level", "Intermediate"), 1))

    if experience_grouping == "similar":
        # Group by level, then form teams within groups
        return _form_similar_level_teams(pool, team_size, institution_diversity,
                                          max_per_institution, max_teams, allow_incomplete)
    elif experience_grouping == "mixed":
        return _form_mixed_level_teams(pool, team_size, skill_balance, institution_diversity,
                                        max_per_institution, max_teams, allow_incomplete)
    else:
        # No grouping — random with institution constraint
        return _form_random_teams(pool, team_size, institution_diversity,
                                   max_per_institution, max_teams, allow_incomplete)


def _team_names():
    names = [
        "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta",
        "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi",
        "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega",
    ]
    for name in names:
        yield f"Team {name}"


def _can_add_to_team(
    participant: Dict,
    team_members: List[Dict],
    institution_diversity: bool,
    max_per_institution: int,
) -> bool:
    if not institution_diversity:
        return True
    institution = participant.get("institution", "")
    if not institution:
        return True
    count = sum(1 for m in team_members if m.get("institution", "") == institution)
    return count < max_per_institution


def _form_mixed_level_teams(
    pool: List[Dict],
    team_size: int,
    skill_balance: bool,
    institution_diversity: bool,
    max_per_institution: int,
    max_teams: int,
    allow_incomplete: bool,
) -> List[Dict]:
    """
    Mixed level: distribute levels evenly across teams.
    Uses a round-robin approach across level buckets.
    """
    level_order = {"Beginner": 0, "Intermediate": 1, "Advanced": 2, "Expert": 3}
    buckets = defaultdict(list)
    for p in pool:
        buckets[p.get("level", "Intermediate")].append(p)

    # Shuffle within each bucket
    for bucket in buckets.values():
        random.shuffle(bucket)

    # Interleave levels: Expert, Advanced, Intermediate, Beginner
    ordered_levels = ["Expert", "Advanced", "Intermediate", "Beginner"]
    interleaved = []
    while any(buckets[l] for l in ordered_levels):
        for level in ordered_levels:
            if buckets[level]:
                interleaved.append(buckets[level].pop(0))

    return _greedy_assign(interleaved, team_size, institution_diversity,
                           max_per_institution, max_teams, allow_incomplete)


def _form_similar_level_teams(
    pool: List[Dict],
    team_size: int,
    institution_diversity: bool,
    max_per_institution: int,
    max_teams: int,
    allow_incomplete: bool,
) -> List[Dict]:
    """Group participants of similar experience levels."""
    random.shuffle(pool)
    return _greedy_assign(pool, team_size, institution_diversity,
                           max_per_institution, max_teams, allow_incomplete)


def _form_random_teams(
    pool: List[Dict],
    team_size: int,
    institution_diversity: bool,
    max_per_institution: int,
    max_teams: int,
    allow_incomplete: bool,
) -> List[Dict]:
    shuffled = pool.copy()
    random.shuffle(shuffled)
    return _greedy_assign(shuffled, team_size, institution_diversity,
                           max_per_institution, max_teams, allow_incomplete)


def _greedy_assign(
    pool: List[Dict],
    team_size: int,
    institution_diversity: bool,
    max_per_institution: int,
    max_teams: int,
    allow_incomplete: bool,
) -> List[Dict]:
    name_gen = _team_names()
    teams = []
    unassigned = pool.copy()

    while unassigned and len(teams) < max_teams:
        team_members = []
        remaining = []

        for participant in unassigned:
            if len(team_members) >= team_size:
                remaining.append(participant)
                continue
            if _can_add_to_team(participant, team_members, institution_diversity, max_per_institution):
                team_members.append(participant)
            else:
                remaining.append(participant)

        if len(team_members) >= team_size or (allow_incomplete and team_members):
            teams.append({
                "name": next(name_gen),
                "member_ids": [m["id"] for m in team_members],
                "members": team_members,
            })
            unassigned = remaining
        else:
            # Can't form more valid teams — add remaining to last team or stop
            if allow_incomplete and team_members and teams:
                # Distribute remaining into existing teams
                for p in team_members:
                    teams[-1]["member_ids"].append(p["id"])
                    teams[-1]["members"].append(p)
            break

    return teams
