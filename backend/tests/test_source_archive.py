from io import BytesIO
from zipfile import ZipFile

import pytest

from app.source_archive import (
    MAX_SOURCE_ARCHIVE_BYTES,
    SourceArchiveFileMissingError,
    SourceArchiveItem,
    SourceArchiveTooLargeError,
    build_source_archive,
)


def test_archive_preserves_order_and_makes_flat_duplicate_names(tmp_path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    third = tmp_path / "third"
    first.write_bytes(b"first version")
    second.write_bytes(b"second version")
    third.write_bytes(b"safe content")

    archive = build_source_archive(
        [
            SourceArchiveItem(first, "Report.final.txt", first.stat().st_size),
            SourceArchiveItem(second, "report.final.txt", second.stat().st_size),
            SourceArchiveItem(third, "../../Q3:plan?.csv", third.stat().st_size),
        ]
    )
    try:
        payload = BytesIO(archive.read())
    finally:
        archive.close()

    with ZipFile(payload) as zip_file:
        assert zip_file.namelist() == [
            "Report.final.txt",
            "report (2).final.txt",
            "Q3_plan_.csv",
        ]
        assert zip_file.read("Report.final.txt") == b"first version"
        assert zip_file.read("report (2).final.txt") == b"second version"
        assert zip_file.read("Q3_plan_.csv") == b"safe content"


def test_archive_rejects_declared_or_actual_size_over_limit(tmp_path) -> None:
    source = tmp_path / "source.txt"
    source.write_text("small")

    with pytest.raises(SourceArchiveTooLargeError):
        build_source_archive(
            [SourceArchiveItem(source, "source.txt", MAX_SOURCE_ARCHIVE_BYTES + 1)]
        )

    oversized = tmp_path / "oversized.bin"
    with oversized.open("wb") as output:
        output.truncate(MAX_SOURCE_ARCHIVE_BYTES + 1)
    with pytest.raises(SourceArchiveTooLargeError):
        build_source_archive([SourceArchiveItem(oversized, "oversized.bin", 1)])


def test_archive_rejects_missing_files_before_creating_payload(tmp_path) -> None:
    with pytest.raises(SourceArchiveFileMissingError):
        build_source_archive(
            [SourceArchiveItem(tmp_path / "missing.txt", "missing.txt", 1)]
        )
