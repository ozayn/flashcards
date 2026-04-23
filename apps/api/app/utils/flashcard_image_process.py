"""
Resize and compress user-uploaded flashcard images to WebP (storage/bandwidth friendly).
"""
from __future__ import annotations

import io
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError

# Allow large decoded intermediate images; uploads are still capped in bytes and downscaled.
Image.MAX_IMAGE_PIXELS = 50_000_000

_MAX_PIXELS = 25_000_000  # reject decompression of absurd dimensions before resize
_MAX_SIDE = 16_000  # reject pathological width/height
# Longest side after processing (v1: balance quality vs storage/bandwidth)
_MAX_OUTPUT_DIM = 1600
_WEBP_QUALITY = 82
_WEBP_METHOD = 4  # speed/quality tradeoff; 0–6


@dataclass(frozen=True, slots=True)
class ProcessedImageMeta:
    width: int
    height: int
    byte_size: int
    max_dimension: int
    file_format: str = "webp"
    quality: int = _WEBP_QUALITY

    def as_public_dict(self) -> dict[str, Any]:
        return {
            "width": self.width,
            "height": self.height,
            "byte_size": self.byte_size,
            "max_dimension": self.max_dimension,
            "file_format": self.file_format,
            "quality": self.quality,
        }


def _resample() -> int:
    try:
        return Image.Resampling.LANCZOS
    except AttributeError:
        return Image.LANCZOS  # type: ignore[attr-defined]


def _to_web_saveable(im: Image.Image) -> Image.Image:
    """Convert to RGB or RGBA for WebP output."""
    if im.mode in ("RGB", "RGBA"):
        return im
    if im.mode == "P" and "transparency" in im.info:
        return im.convert("RGBA")
    if im.mode == "P":
        return im.convert("RGB")
    if im.mode in ("LA", "PA"):
        return im.convert("RGBA")
    if im.mode in ("1", "L", "I", "F"):
        return im.convert("RGB")
    if im.mode == "CMYK":
        return im.convert("RGB")
    return im.convert("RGB")


def _process_pil_image(im: Image.Image) -> tuple[Image.Image, int]:
    """EXIF-rotate, bounds-check, resize. Returns (image, max_dim setting)."""
    im = ImageOps.exif_transpose(im)
    w, h = im.size
    if w <= 0 or h <= 0:
        raise ValueError("Invalid image size")
    if w * h > _MAX_PIXELS or max(w, h) > _MAX_SIDE:
        raise ValueError("Image dimensions are too large")
    im = _to_web_saveable(im)
    max_dim = _MAX_OUTPUT_DIM
    if max(im.size) > max_dim:
        try:
            im.thumbnail((max_dim, max_dim), _resample(), reducing_gap=1.0)
        except TypeError:
            im.thumbnail((max_dim, max_dim), _resample())
    return im, max_dim


def _encode_webp(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(
        buf,
        format="WEBP",
        quality=_WEBP_QUALITY,
        method=_WEBP_METHOD,
    )
    return buf.getvalue()


def process_upload_to_webp(
    content: bytes,
) -> tuple[bytes, dict[str, Any], ProcessedImageMeta]:
    """
    Decode, resize, and compress to WebP.

    Returns (bytes, public_meta_dict, meta) or raises ValueError with a user-safe message.
    """
    if not content or len(content) < 3:
        raise ValueError("Empty or invalid file")

    try:
        im = Image.open(io.BytesIO(content))
        im.load()
    except UnidentifiedImageError as e:
        raise ValueError("Unrecognized or unsupported image format") from e
    except OSError as e:
        if e.__class__.__name__ == "DecompressionBombError":
            raise ValueError(
                "This image is too large to process safely. Try a smaller or simpler file."
            ) from e
        raise ValueError("Could not read this image. Try a different file.") from e
    except ValueError as e:
        raise ValueError("Could not read this image. Try a different file.") from e
    # Multi-frame: first frame only (e.g. animated GIF/WebP)
    try:
        n_frames = getattr(im, "n_frames", 1) or 1
        if n_frames > 1:
            im.seek(0)
        if n_frames > 1:
            im = im.copy()
    except (OSError, ValueError) as e:
        raise ValueError("Could not read this image. Try a different file.") from e

    try:
        im, max_dim_applied = _process_pil_image(im)
    except (ValueError, OSError) as e:
        if isinstance(e, ValueError) and "too large" in str(e).lower():
            raise
        raise ValueError("Could not process this image. Try a different file.") from e

    try:
        out = _encode_webp(im)
    except OSError as e:
        raise ValueError("Could not compress this image. Try a different file.") from e

    w, h = im.size
    pm = ProcessedImageMeta(
        width=w,
        height=h,
        byte_size=len(out),
        max_dimension=max_dim_applied,
        file_format="webp",
        quality=_WEBP_QUALITY,
    )
    return out, pm.as_public_dict(), pm


def write_sidecar_meta_json(upload_dir: str | Path, stem: str, meta: ProcessedImageMeta) -> None:
    """Write flashcard-images/{uuid}.meta.json for ops/admin (not web-served as image)."""
    p = Path(upload_dir) / f"{stem}.meta.json"
    payload: dict[str, Any] = {
        "width": meta.width,
        "height": meta.height,
        "byte_size": meta.byte_size,
        "max_dimension": meta.max_dimension,
        "file_format": meta.file_format,
        "quality": meta.quality,
    }
    p.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
