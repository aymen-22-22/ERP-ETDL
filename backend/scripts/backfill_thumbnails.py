"""One-time backfill: generate webp thumbnails for images uploaded before
thumbnail generation existed.

New uploads get a ``thumb_<stem>.webp`` written next to the original at upload
time (``app.shared.core.images.write_thumbnail``). Everything already on disk
has no thumbnail yet, so grids serve full-resolution originals until this has
run once. It walks the media root and writes the missing thumbnail for every
image that is stored where media is (products/categories/warehouses trees) and
has a re-encodable format; anything that fails to decode is skipped, exactly
like upload-time generation.

Usage:
    python scripts/backfill_thumbnails.py
"""

import sys
from pathlib import Path

# Same trick as seed_prod_catalog.py: make the backend root importable no
# matter how this script is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.shared.core.config import get_settings  # noqa: E402
from app.shared.core.images import thumb_path, write_thumbnail  # noqa: E402

# Media lives in per-entity trees; a nested structure like
# media/products/<tenant>/<product>/<uuid>.jpg is safe to walk fully because
# thumbnails are only ever generated for these trees.
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def main() -> None:
    media_root = get_settings().media_root_path
    generated = skipped = existing = 0
    for path in sorted(media_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in _IMAGE_EXTENSIONS:
            continue
        if path.name.startswith("thumb_"):
            continue
        if thumb_path(path).exists():
            existing += 1
            continue
        if write_thumbnail(path):
            generated += 1
        else:
            skipped += 1

    print(
        f"thumbnails: {generated} generated, {skipped} skipped (undecodable), "
        f"{existing} already present in {media_root}"
    )


if __name__ == "__main__":
    main()
