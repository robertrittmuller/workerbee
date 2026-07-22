"""Bounded, deterministic ZIP archives for source-file handoff."""

from dataclasses import dataclass
from pathlib import Path
from tempfile import SpooledTemporaryFile
from typing import BinaryIO
from zipfile import ZIP_DEFLATED, ZipFile

MAX_SOURCE_ARCHIVE_BYTES = 250 * 1024 * 1024
SOURCE_ARCHIVE_SPOOL_BYTES = 8 * 1024 * 1024


class SourceArchiveError(Exception):
    """Base error for source archive validation failures."""


class SourceArchiveTooLargeError(SourceArchiveError):
    """Raised when a requested archive exceeds the bounded byte budget."""


class SourceArchiveFileMissingError(SourceArchiveError):
    """Raised when an owned source no longer exists on disk."""


@dataclass(frozen=True)
class SourceArchiveItem:
    path: Path
    original_filename: str
    declared_size: int


def _safe_member_name(filename: str) -> str:
    """Return a flat, cross-platform-safe ZIP member name."""
    basename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    basename = "".join(character for character in basename if 31 < ord(character) != 127)
    basename = "".join("_" if character in '<>:"/\\|?*' else character for character in basename)
    basename = basename.strip().rstrip(". ")
    return basename if basename not in {"", ".", ".."} else "source"


def _unique_member_name(filename: str, used_names: set[str]) -> str:
    candidate = _safe_member_name(filename)
    key = candidate.casefold()
    if key not in used_names:
        used_names.add(key)
        return candidate

    path = Path(candidate)
    suffix = "".join(path.suffixes)
    stem = candidate[: -len(suffix)] if suffix else candidate
    index = 2
    while True:
        numbered = f"{stem} ({index}){suffix}"
        key = numbered.casefold()
        if key not in used_names:
            used_names.add(key)
            return numbered
        index += 1


def build_source_archive(items: list[SourceArchiveItem]) -> BinaryIO:
    """Build a bounded ZIP after validating all selected source paths and sizes."""
    declared_total = sum(max(item.declared_size, 0) for item in items)
    if declared_total > MAX_SOURCE_ARCHIVE_BYTES:
        raise SourceArchiveTooLargeError

    actual_total = 0
    for item in items:
        if not item.path.is_file():
            raise SourceArchiveFileMissingError
        actual_total += item.path.stat().st_size
        if actual_total > MAX_SOURCE_ARCHIVE_BYTES:
            raise SourceArchiveTooLargeError

    archive = SpooledTemporaryFile(  # noqa: SIM115 - ownership passes to StreamingResponse
        max_size=SOURCE_ARCHIVE_SPOOL_BYTES,
        mode="w+b",
    )
    used_names: set[str] = set()
    try:
        with ZipFile(archive, mode="w", compression=ZIP_DEFLATED, allowZip64=True) as zip_file:
            for item in items:
                zip_file.write(item.path, arcname=_unique_member_name(item.original_filename, used_names))
        archive.seek(0)
        return archive
    except FileNotFoundError as error:
        archive.close()
        raise SourceArchiveFileMissingError from error
    except Exception:
        archive.close()
        raise
