"""Stable capability handshake for WorkerBee desktop runtime consumers."""

import os

DESKTOP_RUNTIME_CONTRACT_VERSION = 1

# Keep these names stable once shipped. Capabilities may be added within a contract
# version; removing or changing semantics requires a contract-version increment.
DESKTOP_RUNTIME_CAPABILITIES = (
    "calendar-draft-handoff",
    "desktop-session-auth",
    "external-action-audit",
    "file-preview",
    "guided-work-packs",
    "resource-group-batch-assign",
    "resource-group-maintenance",
    "source-batch-download",
    "source-set-management",
    "task-thread-history",
)


def desktop_runtime_contract() -> dict[str, object]:
    """Return the public, deterministic desktop runtime compatibility contract."""
    return {
        "contract_version": DESKTOP_RUNTIME_CONTRACT_VERSION,
        "build_id": os.environ.get("WORKERBEE_BUNDLED_BUILD_ID", "development"),
        "capabilities": list(DESKTOP_RUNTIME_CAPABILITIES),
    }
