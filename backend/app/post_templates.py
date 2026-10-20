"""BookLender-owned creative styles used with the existing generation providers."""

TEXT_TEMPLATES = {
    "standard": ("Standard", "Follow the saved brand voice and format guidance."),
    "story": ("Mini story", "Open with a concrete reader moment, develop one clear idea, and finish with a short invitation. Do not invent book events."),
    "question": ("Conversation starter", "Lead with a specific question related to the verified topic, add useful context, and end with an easy question for readers."),
    "tips": ("Quick tips", "Use two or three brief actionable points based only on supplied facts, then a concise closing line."),
    "editorial": ("Editorial", "Use a polished, concise editorial tone with a clear opening, one focused observation, and a restrained call to action."),
}

VIDEO_TEMPLATES = {
    "editorial": ("Editorial b-roll", "Use three elegant shots: wide establishing view, tactile close detail with action, then a calm closing shot."),
    "hands": ("Hands and pages", "Show hands interacting with a generic book and relevant topic props across three distinct camera angles. Keep covers unbranded."),
    "object_story": ("Object story", "Build a visual progression around two or three objects tied to the topic, moving from setup through detail to a final reveal."),
}


def template_options():
    return {"text": [{"id": key, "name": label} for key, (label, _) in TEXT_TEMPLATES.items()],
            "video": [{"id": key, "name": label} for key, (label, _) in VIDEO_TEMPLATES.items()]}
