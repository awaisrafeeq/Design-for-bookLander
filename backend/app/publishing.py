"""BookLender's supported Zernio posting targets and their required options."""

from fastapi import HTTPException


PLATFORMS = {
    "Instagram": "instagram",
    "Facebook": "facebook",
    "LinkedIn": "linkedin",
    "Pinterest": "pinterest",
    "X": "twitter",
    "YouTube": "youtube",
    "TikTok": "tiktok",
}


def require_media(media, platform, image_mimes, video_mimes, image_limit, video_limit):
    for item in media:
        kind = item.get("type")
        mime = str(item.get("mime") or "").lower()
        size = int(item.get("size") or 0)
        allowed = image_mimes if kind == "image" else video_mimes if kind == "video" else set()
        limit = image_limit if kind == "image" else video_limit
        if mime not in allowed or size > limit:
            raise HTTPException(422, f"{platform} cannot use this media format or file size. Choose a compatible attachment.")


def validate_targets(post, names, options):
    if not isinstance(names, list) or not names or len(names) != len(set(names)) or any(name not in PLATFORMS for name in names):
        raise HTTPException(422, "Choose one or more supported publishing platforms.")
    if not isinstance(options, dict):
        raise HTTPException(422, "Platform options are invalid.")
    media = post.payload.get("media") or []
    kinds = [item.get("type") for item in media]
    content = f"{post.payload.get('caption', '')}\n\n{post.payload.get('tags', '')}".strip()
    if "Instagram" in names and (not media or len(media) > 10 or ("video" in kinds and kinds != ["video"])):
        raise HTTPException(422, "Instagram needs one video or up to ten images.")
    if "LinkedIn" in names and (len(media) > 20 or ("video" in kinds and kinds != ["video"])):
        raise HTTPException(422, "LinkedIn needs one video or up to twenty images.")
    if "LinkedIn" in names:
        require_media(media, "LinkedIn", {"image/jpeg", "image/png", "image/gif"},
                      {"video/mp4", "video/quicktime", "video/x-msvideo"}, 8 * 1024**2, 5 * 1024**3)
    if "X" in names and len(content) > 280:
        raise HTTPException(422, "X posts must be 280 characters or fewer, including hashtags.")
    if "X" in names and (len(media) > 4 or ("video" in kinds and kinds != ["video"])):
        raise HTTPException(422, "X needs one video or up to four images.")
    if "X" in names:
        require_media(media, "X", {"image/jpeg", "image/png", "image/webp"},
                      {"video/mp4", "video/quicktime"}, 5 * 1024**2, 512 * 1024**2)
    if "LinkedIn" in names and len(content) > 3000:
        raise HTTPException(422, "LinkedIn posts must be 3,000 characters or fewer.")
    if "Pinterest" in names:
        pin = options.get("Pinterest") or {}
        if len(media) != 1 or kinds[0] not in {"image", "video"}:
            raise HTTPException(422, "Pinterest needs exactly one image or video. Choose a single-media post.")
        if not isinstance(pin, dict) or not str(pin.get("boardId") or "").strip():
            raise HTTPException(422, "Choose a Pinterest board before scheduling.")
        if len(content) > 800:
            raise HTTPException(422, "Pinterest descriptions must be 800 characters or fewer, including hashtags.")
        require_media(media, "Pinterest", {"image/jpeg", "image/png", "image/webp", "image/gif"},
                      {"video/mp4", "video/quicktime"}, 32 * 1024**2, 2 * 1024**3)
    if "YouTube" in names:
        if kinds != ["video"]:
            raise HTTPException(422, "YouTube needs exactly one video. Choose a video post.")
        youtube = options.get("YouTube") or {}
        if not isinstance(youtube, dict) or youtube.get("visibility", "public") not in {"public", "private", "unlisted"}:
            raise HTTPException(422, "Choose a valid YouTube visibility.")
        title = str(youtube.get("title") or post.payload.get("title") or "").strip()
        if not title or len(title) > 100:
            raise HTTPException(422, "Enter a YouTube title of 100 characters or fewer.")
        if len(content) > 5000:
            raise HTTPException(422, "YouTube descriptions must be 5,000 characters or fewer, including hashtags.")
        if any(key in youtube and not isinstance(youtube[key], bool) for key in ("madeForKids", "containsSyntheticMedia")):
            raise HTTPException(422, "Choose valid YouTube audience and synthetic media settings.")
        require_media(media, "YouTube", set(), {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"},
                      0, 256 * 1024**3)
    if "TikTok" in names:
        tik = options.get("TikTok") or {}
        if not kinds or (kinds != ["video"] and (len(kinds) > 35 or any(kind != "image" for kind in kinds))):
            raise HTTPException(422, "TikTok needs one video or 1–35 images of the same type.")
        if not isinstance(tik, dict) or tik.get("consent") is not True or not tik.get("privacyLevel"):
            raise HTTPException(422, "Choose TikTok privacy and confirm the preview and posting consent.")
        if tik["privacyLevel"] not in {"PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"}:
            raise HTTPException(422, "Choose a valid TikTok privacy level.")
        if len(content) > (2200 if kinds == ["video"] else 4000):
            raise HTTPException(422, "The TikTok caption is too long for this media type.")
        if tik.get("commercialContentType", "none") not in {"none", "brand_organic", "brand_content"}:
            raise HTTPException(422, "Choose a valid TikTok commercial disclosure.")
        require_media(media, "TikTok", {"image/jpeg", "image/png", "image/webp"},
                      {"video/mp4", "video/quicktime", "video/webm"}, 20 * 1024**2, 4 * 1024**3)
