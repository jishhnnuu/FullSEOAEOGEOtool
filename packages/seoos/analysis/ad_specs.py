"""Every placement an advert can occupy, and what it demands of an asset.

The reason this is a file rather than a lookup at upload time: a crop is
decided once and seen a hundred thousand times. Centre-cropping a square photo
to nine by sixteen puts the product behind the caption on Reels, and nobody
tells you, because the ad delivered and the impression was counted. The safe
zones below are the difference between an ad and a wasted impression, and they
are drawn on screen before anybody approves anything.

Character limits are here for the same reason. A headline truncated at thirty
characters mid-word is not a shorter headline, it is a different and worse one,
and every platform truncates silently.

Numbers are from each platform's published advertising specifications as of
September 2026. Where a platform changes them, this file is the one place.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Placement:
    """One slot an advert can appear in, and everything it insists on."""

    key: str
    platform: str
    name: str
    width: int
    height: int
    #: Fractions of the frame reserved by the platform's own interface. An
    #: element inside these is covered by a caption, a profile name or a
    #: button, at some screen sizes and not others.
    safe_top: float = 0.0
    safe_bottom: float = 0.0
    safe_left: float = 0.0
    safe_right: float = 0.0
    max_mb: float = 30.0
    formats: tuple[str, ...] = ("jpg", "png")
    video: bool = False
    #: Field name to maximum characters.
    text_limits: dict[str, int] = field(default_factory=dict)
    note: str = ""

    @property
    def ratio(self) -> float:
        return self.width / self.height

    @property
    def ratio_label(self) -> str:
        return _ratio_label(self.width, self.height)


def _ratio_label(w: int, h: int) -> str:
    from math import gcd
    g = gcd(w, h) or 1
    return f"{w // g}:{h // g}"


PLACEMENTS: list[Placement] = [
    # ------------------------------------------------------------ Meta
    Placement(
        key="meta_feed_square", platform="meta_ads", name="Facebook and Instagram feed, square",
        width=1080, height=1080, max_mb=30,
        text_limits={"primary_text": 125, "headline": 40, "description": 30},
        note="The safest single asset on Meta. If only one image is made, make this one.",
    ),
    Placement(
        key="meta_feed_portrait", platform="meta_ads", name="Feed, portrait",
        width=1080, height=1350, max_mb=30,
        text_limits={"primary_text": 125, "headline": 40, "description": 30},
        note="Takes more vertical space in the feed than square, which is most of why it performs better.",
    ),
    Placement(
        key="meta_story", platform="meta_ads", name="Stories and Reels",
        width=1080, height=1920, safe_top=0.14, safe_bottom=0.35, max_mb=30,
        text_limits={"primary_text": 72, "headline": 40},
        note="The bottom third holds the caption, the profile and the call to action. Anything placed "
             "there is covered on a real phone even though it looks fine in the preview.",
    ),
    Placement(
        key="meta_video_feed", platform="meta_ads", name="Feed video",
        width=1080, height=1080, max_mb=4096, formats=("mp4", "mov"), video=True,
        text_limits={"primary_text": 125, "headline": 40},
        note="Most of the audience watches without sound. Captions are not an accessibility extra here, "
             "they are the difference between a view and a view that understood anything.",
    ),

    # ---------------------------------------------------------- Google
    Placement(
        key="google_rsa", platform="google_ads", name="Responsive search ad",
        width=0, height=0,
        text_limits={"headline": 30, "description": 90, "path": 15},
        note="Fifteen headlines and four descriptions, assembled by Google. Three headlines minimum, but "
             "under eight the system has nothing to test and the ad strength stays poor.",
    ),
    Placement(
        key="google_display_landscape", platform="google_ads", name="Responsive display, landscape",
        width=1200, height=628, max_mb=5,
        text_limits={"short_headline": 30, "long_headline": 90, "description": 90, "business_name": 25},
    ),
    Placement(
        key="google_display_square", platform="google_ads", name="Responsive display, square",
        width=1200, height=1200, max_mb=5,
        text_limits={"short_headline": 30, "long_headline": 90, "description": 90, "business_name": 25},
    ),
    Placement(
        key="google_display_portrait", platform="google_ads", name="Responsive display, portrait",
        width=960, height=1200, max_mb=5,
        text_limits={"short_headline": 30, "long_headline": 90, "description": 90},
    ),
    Placement(
        key="google_logo_square", platform="google_ads", name="Logo, square",
        width=1200, height=1200, max_mb=5,
        note="Required. Without it Google crops your landscape image into a circle and the result is "
             "usually somebody's elbow.",
    ),
    Placement(
        key="google_logo_wide", platform="google_ads", name="Logo, wide",
        width=1200, height=300, max_mb=5,
    ),
    Placement(
        key="youtube_video", platform="google_ads", name="YouTube in-stream",
        width=1920, height=1080, max_mb=4096, formats=("mp4", "mov"), video=True,
        text_limits={"headline": 15, "long_headline": 90, "description": 70},
        note="Five seconds before the skip button. Whatever has to be understood must be understood by then.",
    ),
    Placement(
        key="youtube_short", platform="google_ads", name="YouTube Shorts",
        width=1080, height=1920, safe_top=0.10, safe_bottom=0.30, max_mb=4096,
        formats=("mp4", "mov"), video=True,
        text_limits={"headline": 15, "description": 70},
    ),

    # ---------------------------------------------------------- TikTok
    Placement(
        key="tiktok_feed", platform="tiktok_ads", name="TikTok in-feed",
        width=1080, height=1920, safe_top=0.08, safe_bottom=0.30, safe_right=0.13,
        max_mb=500, formats=("mp4", "mov"), video=True,
        text_limits={"text": 100},
        note="The right-hand strip holds the like, comment and share rail. The bottom holds the caption. "
             "Both are covered, and both look empty in an editing timeline.",
    ),

    # -------------------------------------------------------- LinkedIn
    Placement(
        key="linkedin_single", platform="linkedin_ads", name="LinkedIn single image",
        width=1200, height=627, max_mb=5,
        text_limits={"intro_text": 150, "headline": 70},
        note="Intro text truncates at about 150 characters on mobile, where most of it is read.",
    ),
    Placement(
        key="linkedin_square", platform="linkedin_ads", name="LinkedIn square",
        width=1200, height=1200, max_mb=5,
        text_limits={"intro_text": 150, "headline": 70},
    ),

    # ------------------------------------------------------- Microsoft
    Placement(
        key="microsoft_rsa", platform="microsoft_ads", name="Microsoft responsive search ad",
        width=0, height=0,
        text_limits={"headline": 30, "description": 90, "path": 15},
        note="The same shape as a Google responsive search ad, which is why an import works.",
    ),
    Placement(
        key="microsoft_image", platform="microsoft_ads", name="Microsoft multimedia ad",
        width=1200, height=628, max_mb=5,
        text_limits={"headline": 30, "description": 90},
    ),

    # ------------------------------------------------------- Pinterest
    Placement(
        key="pinterest_standard", platform="pinterest_ads", name="Pinterest standard pin",
        width=1000, height=1500, max_mb=20,
        text_limits={"title": 100, "description": 500},
        note="Two to three is the ratio Pinterest actually distributes. A square pin is shown smaller.",
    ),

    # ---------------------------------------------------------- Reddit
    Placement(
        key="reddit_image", platform="reddit_ads", name="Reddit image ad",
        width=1200, height=628, max_mb=20,
        text_limits={"headline": 300},
        note="The comments appear underneath and are public. Copy that reads as advertising is answered "
             "as advertising, in front of everyone.",
    ),

    # -------------------------------------------------------- Snapchat
    Placement(
        key="snap_single", platform="snapchat_ads", name="Snapchat single video",
        width=1080, height=1920, safe_top=0.12, safe_bottom=0.20,
        max_mb=1024, formats=("mp4", "mov"), video=True,
        text_limits={"headline": 34},
    ),
]

BY_KEY = {p.key: p for p in PLACEMENTS}


def placement(key: str) -> Placement | None:
    return BY_KEY.get(key)


def for_platform(platform_key: str) -> list[Placement]:
    return [p for p in PLACEMENTS if p.platform == platform_key]


def required_renders(platform_keys: list[str]) -> list[Placement]:
    """Every distinct image a campaign on these platforms needs.

    Distinct means distinct dimensions. One 1080 by 1920 render serves Meta
    Stories, TikTok and Shorts, so it is produced once and the tightest safe
    zone of the three is applied to it.
    """
    wanted = [p for p in PLACEMENTS if p.platform in platform_keys and not p.video and p.width > 0]
    seen: dict[tuple[int, int], Placement] = {}
    for p in wanted:
        size = (p.width, p.height)
        held = seen.get(size)
        if held is None:
            seen[size] = p
            continue
        # Keep whichever demands the most, so one render satisfies all of them.
        seen[size] = Placement(
            key=f"shared_{p.width}x{p.height}",
            platform="shared",
            name=f"{held.name}, also {p.name}",
            width=p.width, height=p.height,
            safe_top=max(held.safe_top, p.safe_top),
            safe_bottom=max(held.safe_bottom, p.safe_bottom),
            safe_left=max(held.safe_left, p.safe_left),
            safe_right=max(held.safe_right, p.safe_right),
            max_mb=min(held.max_mb, p.max_mb),
            formats=tuple(sorted(set(held.formats) & set(p.formats))) or held.formats,
            text_limits={},
            note="One render covers both, using the tighter safe zone of the two.",
        )
    return sorted(seen.values(), key=lambda p: (-p.width * p.height, p.key))


@dataclass
class SpecProblem:
    field: str
    problem: str
    fix: str
    blocking: bool


def check_copy(place: Placement, copy: dict[str, str]) -> list[SpecProblem]:
    """Character limits, checked before the platform truncates them silently."""
    out: list[SpecProblem] = []
    for name, limit in place.text_limits.items():
        value = (copy.get(name) or "").strip()
        if not value:
            continue
        if len(value) > limit:
            over = len(value) - limit
            out.append(SpecProblem(
                name,
                f"{len(value)} characters against a {limit} limit, so {over} would be cut, "
                f"leaving “{value[:limit].rstrip()}…”",
                f"Cut {over} characters. The platform will not warn you; it truncates.",
                True,
            ))
        elif len(value) > limit * 0.95:
            out.append(SpecProblem(
                name,
                f"{len(value)} of {limit} characters, which fits but leaves no room for a longer "
                "rendering on a narrow screen.",
                "Shorten it slightly, or check it on a phone preview.",
                False,
            ))
    return out


def check_asset(place: Placement, width: int, height: int, size_mb: float, fmt: str) -> list[SpecProblem]:
    """Whether an asset can be uploaded at all, checked before it is sent."""
    out: list[SpecProblem] = []
    if place.width == 0:
        return out

    if fmt.lower().lstrip(".") not in place.formats:
        out.append(SpecProblem(
            "format",
            f"{fmt} is not accepted here. This placement takes {', '.join(place.formats)}.",
            f"Convert to {place.formats[0]}.",
            True,
        ))

    if size_mb > place.max_mb:
        out.append(SpecProblem(
            "size",
            f"{size_mb:.1f} MB against a {place.max_mb:.0f} MB ceiling.",
            "Re-encode. A lower quality setting is invisible at feed size and halves the file.",
            True,
        ))

    if width <= 0 or height <= 0:
        return out

    target = place.ratio
    actual = width / height
    drift = abs(actual - target) / target
    if drift > 0.02:
        out.append(SpecProblem(
            "ratio",
            f"{_ratio_label(width, height)} against the {place.ratio_label} this placement wants.",
            "Re-crop rather than stretch. A stretched face is noticed and a cropped one is not.",
            drift > 0.15,
        ))

    if width < place.width:
        out.append(SpecProblem(
            "resolution",
            f"{width} pixels wide against a recommended {place.width}. It will be upscaled and will "
            "look soft next to competitors who supplied the right size.",
            f"Supply at least {place.width} by {place.height}.",
            width < place.width * 0.5,
        ))
    return out


def safe_box(place: Placement) -> dict[str, int]:
    """The rectangle inside a placement that is never covered by platform UI.

    Returned in pixels so it can be drawn on the preview. An advert whose
    product, price or logo sits outside this box is an advert that partially
    does not exist.
    """
    return {
        "x": round(place.width * place.safe_left),
        "y": round(place.height * place.safe_top),
        "width": round(place.width * (1 - place.safe_left - place.safe_right)),
        "height": round(place.height * (1 - place.safe_top - place.safe_bottom)),
        "covered_fraction": round(
            1 - (1 - place.safe_left - place.safe_right) * (1 - place.safe_top - place.safe_bottom), 3
        ),
    }
