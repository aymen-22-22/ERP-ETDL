"""Thumbnail generation for uploaded media.

Originals are stored byte-for-byte as uploaded (up to the 5 MB cap) because
that is the file the user sees in detail views. But every grid — the till,
kanban cards, dashboard — only ever shows a small rendition, so shipping the
full 5 MB original to a 40-120px tile is what makes photo pages feel slow.

Each original therefore gets a ~512px webp written next to it at upload time,
named `thumb_<stem>.webp`. The URL is derived on the client by rewriting the
filename segment, so the database keeps storing only the original's URL and
nothing about thumbnails leaks into sync/cache machinery. A missing thumbnail
(a corrupt original, or an image uploaded before this existed) simply 404s
and the client falls back to the original.
"""

from pathlib import Path

from PIL import Image

THUMB_MAX_EDGE = 512
THUMB_QUALITY = 82


def thumb_filename(filename: str) -> str:
    """Name of the webp thumbnail written next to `filename`."""
    return f"thumb_{filename.rsplit('.', 1)[0]}.webp"


def thumb_path(original: Path) -> Path:
    """The thumbnail path next to `original`, mirroring `thumb_filename`."""
    return original.with_name(thumb_filename(original.name))


def write_thumbnail(original: Path) -> bool:
    """Downscale `original` to a webp thumbnail next to it.

    Returns False without raising when the file cannot be decoded — a corrupt
    or exotic upload must never fail the whole upload request; the original is
    still stored and the client's fallback covers the missing thumbnail.
    """
    try:
        with Image.open(original) as opened:
            image = opened.convert("RGBA") if opened.mode not in ("RGB", "RGBA") else opened
            image.thumbnail((THUMB_MAX_EDGE, THUMB_MAX_EDGE), Image.Resampling.LANCZOS)
            image.save(thumb_path(original), "WEBP", quality=THUMB_QUALITY)
        return True
    except Exception:
        return False


def delete_thumbnail(original: Path) -> None:
    """Remove the thumbnail that `write_thumbnail` produced for `original`."""
    thumb_path(original).unlink(missing_ok=True)
