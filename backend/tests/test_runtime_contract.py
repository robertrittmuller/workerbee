from app.main import health_check
from app.runtime_contract import (
    DESKTOP_RUNTIME_CAPABILITIES,
    DESKTOP_RUNTIME_CONTRACT_VERSION,
    desktop_runtime_contract,
)


def test_desktop_runtime_contract_is_deterministic_and_covers_current_ui_apis() -> None:
    contract = desktop_runtime_contract()

    assert contract == {
        "contract_version": DESKTOP_RUNTIME_CONTRACT_VERSION,
        "build_id": "development",
        "capabilities": list(DESKTOP_RUNTIME_CAPABILITIES),
    }
    assert list(DESKTOP_RUNTIME_CAPABILITIES) == sorted(DESKTOP_RUNTIME_CAPABILITIES)
    assert {
        "calendar-draft-handoff",
        "desktop-session-auth",
        "file-preview",
        "resource-group-batch-assign",
        "resource-group-maintenance",
        "source-batch-download",
        "source-set-management",
        "task-thread-history",
    }.issubset(DESKTOP_RUNTIME_CAPABILITIES)


async def test_health_check_publishes_the_desktop_runtime_contract() -> None:
    health = await health_check()

    assert health["status"] == "healthy"
    assert health["desktop_runtime"] == desktop_runtime_contract()
