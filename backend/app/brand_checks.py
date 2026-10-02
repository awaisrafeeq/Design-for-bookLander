"""Deterministic guardrails plus a human tone/evidence review checklist."""
import re

BASE_PATTERNS = {
    "Digital formats": r"\b(?:kindle|e[- ]?readers?|digital streaming|ebooks?|e-books?)\b",
    "Corporate buzzwords": r"\b(?:synergy|disrupting)\b",
    "Unverified availability": r"\b(?:in stock|copies available|new arrivals?|available now|ships? today)\b",
}


def check_content(text: str, policy_version: int, rules: list[str]) -> dict:
    violations = [{"rule": label, "match": match.group(0)}
                  for label, pattern in BASE_PATTERNS.items()
                  if (match := re.search(pattern, text, re.IGNORECASE))]
    # Short rules and quoted phrases are literal bans; prose guidance remains a human checklist.
    for rule in rules:
        phrases = re.findall(r'["“]([^"”]+)["”]', rule)
        if len(rule.split()) <= 3:
            phrases.append(rule)
        for phrase in phrases:
            if re.search(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text, re.IGNORECASE):
                violations.append({"rule": rule, "match": phrase})
    return {"policyVersion": policy_version, "passed": not violations, "violations": violations,
            "warnings": ["Human review: witty, intellectual, cozy voice; factual evidence; political context."]}
