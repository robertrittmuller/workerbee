# WorkerBee Product Platform Roadmap

## Product promise

WorkerBee turns a plain-language request and the user's working files into a useful,
reviewable deliverable. Business users should be able to begin with the outcome they
want, understand what WorkerBee is doing, intervene when needed, and leave with an
artifact they can use immediately.

## Experience principles

1. **Lead with work, not agents.** The primary entry points are familiar jobs such as
   summarizing documents, extracting a table, creating a report, and analyzing data.
2. **One obvious next action.** Every screen should make the current state and next
   action clear without requiring knowledge of models, prompts, or execution modes.
3. **Earn trust in layers.** Show a concise progress narrative by default and keep raw
   logs, model settings, and execution details available in an advanced view.
4. **Files are first-class context.** Attaching local files should feel as natural as
   attaching a file to an email. Users control what is shared with each run.
5. **Artifacts are the product.** Outputs must be easy to preview, download, revise,
   and find again. A successful run is measured by a useful deliverable, not a green
   execution status.
6. **Web and desktop feel like one product.** Shared React UI and API contracts sit on
   top of platform adapters for local files, notifications, updates, and credentials.

## Information architecture

| Surface | Purpose | Default audience |
| --- | --- | --- |
| Home | Start a task, resume work, find recent outputs | Everyone |
| Work | Follow a task, answer questions, review outputs | Everyone |
| Files | Organize reusable source material and local folders | Everyone |
| Assistants | Create and tune reusable specialist agents | Power users |
| Activity | Audit runs, failures, cost, and detailed logs | Power users/admins |
| Settings | Models, data controls, team, desktop runtime | Admins |

The existing dashboard becomes the **Assistants** advanced surface. The new Home
surface becomes the default authenticated route.

## Runtime architecture

```text
Shared React application
        |
        +-- Browser adapter --> hosted WorkerBee API
        |
        +-- Desktop adapter --> authenticated local IPC bridge
                                  |
                                  +-- file picker / watched folders
                                  +-- OS keychain and notifications
                                  +-- bundled WorkerBee runtime sidecar
                                         |
                                         +-- local SQLite metadata
                                         +-- local artifact store
                                         +-- agent execution engine
                                         +-- optional cloud model APIs
```

### Desktop decision

Use an Electron shell for the first distributable desktop release.

- It can be distributed as a macOS ZIP/DMG, Windows per-user NSIS install, and Linux
  AppImage without requiring administrator rights.
- Chromium provides predictable rendering and file APIs across platforms.
- The larger package size is acceptable for the initial business-user release and is
  a better trade than requiring users to install WebView or container dependencies.
- The renderer remains the same React application. All privileged capabilities are
  exposed through a narrow, typed preload bridge; Node integration stays disabled.

Tauri can be reconsidered after the runtime boundary is stable and package size is a
demonstrated adoption constraint.

### Backend evolution

The current Postgres/Redis/MinIO/OpenCode Compose stack remains the development and
hosted deployment topology. Desktop must not ship Docker. Move toward these ports:

- `MetadataStore`: PostgreSQL in hosted mode, SQLite in desktop mode.
- `ArtifactStore`: object storage in hosted mode, app-data directory in desktop mode.
- `ExecutionRuntime`: remote OpenCode service in hosted mode, bundled sidecar in
  desktop mode.
- `SecretStore`: server-side encryption in hosted mode, OS keychain in desktop mode.

Keep FastAPI schemas and the frontend API client stable across both modes. The
desktop shell launches the bundled runtime on an ephemeral loopback port and passes
a one-time session secret to the renderer through the preload bridge.

## Delivery sequence

### Phase 1 — Outcome-first core

- Make Home the authenticated landing page.
- Add a single composer that accepts a request, files, and a suggested task.
- Keep Assistants and detailed execution consoles available as advanced views.
- Present recent work and generated artifacts in business language.
- Add empty, loading, failure, and recovery states that explain what to do next.

### Phase 2 — Trustworthy work loop

- Show an explicit data-sharing review with request, filenames, and model destination.
- Add user-controlled review frequency and external-processing acknowledgement.
- Store desktop provider credentials behind the OS credential-protection boundary.
- Replace raw activity-first run UI with a conversation plus a compact work plan.
- Add approval checkpoints for external writes and consequential actions.
- Add artifact preview, revision, version history, and “open in…” actions.
- Persist task threads independently from individual execution attempts.
- Add task-level cancellation, retry, and clear failure recovery.

### Phase 3 — Desktop alpha

- Package the shared UI in the Electron shell.
- Add the typed platform bridge and secure local file/folder selection.
- Add SQLite and filesystem adapters to the FastAPI runtime.
- Bundle the runtime and execution engine as signed sidecars.
- Produce no-admin macOS ZIP, Windows per-user installer, and Linux AppImage builds.

### Phase 4 — Common work packs

- Document review and executive summaries.
- Spreadsheet cleanup, analysis, and recurring reporting.
- Presentation and memo creation from source material.
- Proposal creation and repeatable project-status reporting.
- Meeting preparation and follow-up.
- Research synthesis with source traceability.

Each pack ships with a guided intake, a strong default workflow, sample inputs,
quality checks, and an artifact-specific review experience.

## Alpha evidence and next gate — July 21, 2026

The current macOS ARM64 alpha now proves the shared outcome-first task flow, native
file selection, local SQLite/artifact storage, bundled execution sidecars, document
content extraction, downloadable deliverables, explicit external-processing review,
and OS-protected OpenAI/Anthropic credential configuration. The packaged shell and a
real attached-file workflow have been exercised end to end.

The full product goal is not complete. The next release gate is:

1. Run the native packaging workflow and exercise its Windows per-user and Linux
   AppImage distributions on representative user machines.
2. Add broader automated API/task-state tests and repeatable packaged-desktop smoke
   coverage.
3. Add production signing, notarization, and a secure update channel to the new
   WorkerBee application identity.
4. Add approval checkpoints and connector-backed actions for consequential external
   writes.

### Common work-pack milestone

The Home task cards are now guided work packs rather than prompt presets. Document
summary, structured extraction, and dashboard creation each provide pack-specific
intake, required-source validation, a named deliverable contract, quality checks,
server-side contract validation, and artifact-specific review. Summary outputs get a
rendered brief, CSV outputs get a tabular preview, and dashboards run in a sandboxed
HTML preview with network access blocked. The same flow has been exercised in the web
UI at desktop and mobile widths and in the rebuilt macOS packaged app.

Meeting preparation and decision memos now use the same guided contract. Meeting
briefs capture the meeting outcome, participants, emphasis, and sensitivities, then
produce `meeting-brief.md` with grounded context, decisions, questions, risks, talking
points, and follow-up capture. Decision memos capture the decision, audience, stance,
options, criteria, and length, then produce `decision-memo.md` with a recommendation,
evidence, consistent tradeoffs, mitigations, and next steps. Both packs require source
files on the server, distinguish facts from inference or assumptions, and reject a
run as incomplete unless the promised filename is actually delivered. The responsive
web UI and the rebuilt macOS packaged app both expose and open these new guided flows.

The common-work breadth now also includes proposal creation and project-status
reporting. Future packs should retain
the same server-owned intake, source-grounding, named-deliverable, and quality-review
contracts rather than relying on prompt text alone.

### Spreadsheet cleanup milestone

Spreadsheet cleanup is now a guided common task with a data-preservation-first
contract. Users identify the table, row grain, key columns, cleanup actions, duplicate
policy, and invalid-value policy before attaching a CSV, TSV, or Excel source. The run
must produce both `cleaned-data.csv` and `cleanup-report.md`; the report documents
source shape, applied rules, before-and-after counts, and unresolved issues. Server
validation now supports ordered multi-file deliverables and marks the work incomplete
when any promised filename is absent, while preserving the original single-output
metadata for existing clients and task history.

The Home gallery now shows only guided common tasks because the main composer already
provides the open-ended request path. Guided work is grouped into Data & reporting and
Briefs & decisions, which removes a duplicate entry point and makes ten workflows
easier to scan. The cleanup intake, two-file definition of done, source validation,
and responsive layout have been exercised at desktop and phone widths, and the rebuilt
macOS ARM64 app exposes the same flow from its bundled local runtime.

The next spreadsheet depth milestone is source-level reconciliation fixtures.
The next depth milestone is end-to-end execution fixtures that evaluate
generated spreadsheet row counts, lineage, transformations, and quality-report claims
against known messy inputs rather than validating filenames alone.

### Presentation creation milestone

Presentation creation now produces a real, editable `briefing-deck.pptx` plus a
reviewable `deck-outline.md`. The agent owns the communication job, narrative, claims,
and a constrained `deck-content.json` specification; WorkerBee's backend owns the
PowerPoint file format and renders the specification with its bundled presentation
library. This avoids assuming that Python, Node, Office, or another authoring tool is
installed on a desktop user's machine and keeps the no-admin runtime boundary intact.

The renderer supports title, section, content, metrics, and comparison slides; three
controlled visual styles; 16:9 output; presentation-scale typography; slide numbers;
and source-filename footers. It rejects unsupported layouts and decks outside the
2–20-slide safety bound. Execution post-processing records renderer success or a clear
diagnostic, then the existing multi-deliverable validator requires both the PowerPoint
and outline before calling the work complete. Work review previews the outline instead
of trying to decode the binary PowerPoint in the browser.

A source-grounded sample deck was rendered, reopened as a PowerPoint, checked for
overflow, and inspected slide by slide. Visual inspection caught and fixed a comparison
layout overlap that the automated overflow check did not flag. The guided intake and
two-output definition of done were exercised responsively in the web UI, and the
grouped task gallery plus presentation setup were launched from the rebuilt packaged
macOS ARM64 app.

The next presentation depth should add optional brand-template ingestion and richer
data-driven charts while preserving deterministic rendering and source traceability.
The next presentation depth remains brand-template ingestion and richer charts.

### Meeting follow-up milestone

Meeting follow-up now turns source notes, transcripts, agendas, chat exports, or
annotated presentations into three coordinated deliverables: a grounded
`meeting-follow-up.md`, an accountable `action-items.csv`, and a review-before-send
`follow-up-message.md`. The agent produces one constrained `follow-up-content.json`
specification; WorkerBee's backend owns the final file formats and renders all three
artifacts deterministically. The renderer rejects malformed or incomplete specs and
the existing ordered multi-output validator requires every promised filename.

Trust behavior is explicit. Decisions, actions, and open questions carry source
filenames or an unsupported flag. Missing owners and due dates remain blank rather
than being guessed, and the action register calls those gaps out for review. The
message is always labeled as a draft, names its intended audience, and warns the user
to review recipients and commitments before sending. Nothing in the workflow sends
email or writes to an external system.

Home now groups twelve guided tasks into Data & reporting, Briefs & decisions, Research
& analysis, and
Meetings. The meeting follow-up intake, three-output definition of done, source-file
requirement, and no-source recovery state have been exercised in the web UI. The
repackaged macOS ARM64 app exposes the same grouped gallery and guided flow through
its bundled local runtime.

The follow-up now has approval-gated email and calendar draft handoffs on both web and
desktop. The next cross-platform depth milestone is a least-privilege remote connector
for collaboration posts or managed email, with organization policy checks before any
external mutation; presentation depth still includes optional brand templates and
richer charts.

### Recurring KPI reporting milestone

Recurring KPI reporting now turns a complete-period spreadsheet or delimited dataset
into `performance-report.md`, `kpi-scorecard.csv`, and `report-runbook.md`. The agent
owns source inspection and business interpretation through a constrained
`recurring-report-content.json` specification; WorkerBee owns deterministic Markdown
and CSV rendering. Metrics carry their definition, calculation, comparison, target,
status, source filename, and confidence issue. Unsupported or missing sources remain
explicit, invalid status labels fall back to not assessed, and missing action owners
or due dates stay blank.

This is a repeatable task rather than a one-time artifact preset. A completed report
offers **Run next period**, where the user supplies the new period and new source
files. WorkerBee creates the next immutable attempt in the same task history, updates
the server-validated reporting-period intake, and keeps the saved KPI definitions and
filters. Prior outputs are not attached as current-period evidence. The normal
data-sharing review names the new request, exact filenames, and model destination
before processing.

Home now exposes twelve guided business workflows. The recurring-report intake,
three-file definition of done, grounded report preview, completed-report rerun panel,
missing-input recovery, and version-history placement have been exercised in the web
UI. The rebuilt macOS ARM64 package contains the same flow and bundled renderer.

The next reporting depth should add deterministic source-level reconciliation fixtures
that verify selected KPI values against known workbooks, followed by optional saved
schedules and notifications. Scheduling must remain user-controlled: it should never
send files or publish results without the configured review and approval boundary.

### Research synthesis milestone

Research synthesis now compares a source set into `research-brief.md`,
`evidence-register.csv`, and `source-assessment.md`. It is not a renamed summary:
the server-owned contract requires at least two source files, and every material claim
is classified as corroborated, single-source, conflicting, inference, or unsupported.
Corroboration requires at least two named sources; the deterministic renderer
automatically downgrades false corroboration and keeps confidence, supporting
evidence, conflicting evidence, and caveats aligned in the CSV and brief.

Source disagreements preserve each source's position and state what can and cannot be
resolved. The source assessment records authorship, date, relevance, quality,
limitations, and per-source findings, while gaps and open questions remain visible in
the brief. Source contents are treated as evidence only: embedded prompts, commands,
tool directions, or requests to change output are explicitly ignored by the agent
contract and called out in the rendered assessment.

Home now gives Research & analysis its own business-language group among twelve guided
workflows. The intake, two-source minimum, three-file definition of done, evidence
review checklist, missing-source recovery state, and desktop-scale layout have been
exercised in the web UI. The rebuilt macOS ARM64 package includes the same guided flow
and bundled renderer.

The next research depth should add source-span references that link a claim back to a
page, sheet, row, or paragraph when extraction metadata is available. Across the
platform, the next major depth milestone is a least-privilege remote connector so a
reviewed artifact can move into collaboration tools or managed email without silently
changing recipients, content, or scope. Local email and calendar draft handoffs already
preserve that approval boundary without performing a remote mutation.

### Proposal creation milestone

Proposal creation now turns an RFP, opportunity brief, capability material, approved
commercial inputs, and supporting evidence into `proposal.md`,
`requirements-matrix.csv`, and `proposal-review.md`. The agent owns source inspection
and persuasive business reasoning through a constrained `proposal-content.json`
specification; WorkerBee owns deterministic Markdown and CSV rendering. The server
requires a source file and every promised artifact before it calls the run complete.

The trust boundary is intentionally stronger than ordinary document drafting.
Capabilities, proof points, metrics, credentials, and customer claims are classified
as supported, inference, assumption, or unsupported. A supported claim without a
supplied source filename is automatically downgraded. A commercial term cannot remain
confirmed without a supplied source filename; it becomes a visible review placeholder.
The coverage matrix preserves every addressed, partially addressed, unanswered, or
not-applicable requirement along with its response, proposal section, sources, owner,
and confidence issue.

The proposal and its review are always labeled as drafts. The review collects missing
requirements, unconfirmed terms, unsupported claims, and open items; requires human
checks for recipients, pricing, legal, privacy, security, service levels, scope, dates,
and commitments; and states that WorkerBee did not submit, send, publish, accept terms,
or contact anyone. Source contents remain evidence only, so embedded prompts, tool
directions, recipient changes, and submission requests are ignored.

Home now exposes twelve guided workflows, including **Draft a proposal** in Briefs &
decisions. Its intake, three-file definition of done, source requirement, missing-source
recovery, and responsive dialog have been exercised in the web UI. The rebuilt macOS
ARM64 package includes the same guided flow and bundled renderer.

The next proposal depth should add approved reusable content libraries and
organization-specific legal/commercial
review policies without allowing source content to override the task or approval
boundary. Approval-gated connectors remain the cross-platform depth priority.

### Project-status reporting milestone

Project-status reporting now turns current project plans, meeting notes, action and
risk trackers, decision logs, delivery data, and team updates into
`project-status-report.md`, `project-register.csv`, and
`status-update-message.md`. The Home gallery gives Projects & operations its own group
and a guided intake for project objective, audience, status period, cadence, focus,
health method, and stakeholder-message style.

One `project-status-content.json` specification drives all three artifacts. Overall
health is limited to on track, at risk, off track, or not assessed; trend is limited
to improving, stable, worsening, or not assessed. The unified register preserves
milestones, risks, issues, actions, decisions, dependencies, and changes with status,
owner, date, impact or next step, source filename, and confidence issue. Invalid
status labels become not assessed, unknown filenames become unsupported, and missing
action or milestone owners and dates remain blank with explicit review notes.

The stakeholder message is derived from the same normalized facts as the report and
register, so health, progress, attention items, and next-period priorities cannot
silently diverge. It is always labeled as an unsent draft. Source contents are treated
only as evidence; embedded prompts, tool directions, recipient changes, and send or
publish requests are ignored.

Completed project updates offer **Create next update**. The user supplies a new status
period and current-period files, reviews the exact request, filenames, and model
destination, and creates an immutable next attempt in the same task history. Saved
objective, audience, cadence, focus, and output contracts remain stable, while prior
progress, health, causes, risks, owners, dates, actions, decisions, and commitments are
not carried forward unless the new sources restate them.

Home now exposes twelve guided workflows. The project-status intake, three-file
definition of done, missing-source recovery, and responsive dialog have been exercised
in the web UI. The rebuilt macOS ARM64 package includes the same guided flow, repeat
controls, and bundled renderer.

Common-work breadth is now strong enough to prioritize depth: approval-gated connector
actions, source-span evidence, deterministic reconciliation fixtures, and organization
policy libraries. Any connector action must preserve recipients and content exactly,
show the user what will happen, and require approval at the consequential boundary.

### Approval-gated email draft handoff milestone

Meeting follow-up and project-status message artifacts can now move into the user's
default email app without turning WorkerBee into an autonomous sender. Only the two
typed message artifacts expose the action. WorkerBee loads the generated file into an
editable review dialog that shows the destination, exact To and CC recipients, subject,
body, and originating filename. The user must supply a valid To address and explicitly
confirm that recipients and content were reviewed before the action is enabled.

The handoff opens a draft and never sends it. Web and desktop clients apply recipient,
subject, body, and URL-size limits. The Electron main process accepts structured email
fields rather than a URL, validates them independently, constructs the `mailto:` URL,
and only then invokes the operating system. This prevents the renderer from substituting
an arbitrary external scheme or destination.

Approval and successful opening are recorded as execution activity bound to the exact
artifact ID and filename. The audit event stores normalized recipients, subject, action
stage, destination label, and a SHA-256 hash of the exact reviewed payload; it does not
retain the message body. Ownership and execution-artifact binding are enforced by the
server. If the final opened event cannot be recorded, the UI still reports truthfully
that the email app opened while surfacing the audit limitation.

The next email depth should add an optional managed-email connector with
least-privilege scopes, idempotency keys, and organization policy checks before any
remote mutation. The local handoff must remain available as the no-connector path.

### Approval-gated calendar draft handoff milestone

The exact `meeting-follow-up.md` artifact can now become a reviewed tentative calendar
draft without WorkerBee adding an event or sending invitations. The action appears only
for that typed deliverable. Its approval dialog names the source and destination and
lets the user review the title, event date, start time, duration, timezone, optional
attendees, location, and notes. The action remains disabled until the schedule is valid
and the user confirms the complete draft.

WorkerBee produces deterministic RFC 5545 content with a stable artifact-bound UID,
the exact local start and timezone, a bounded duration, normalized attendee addresses,
and `STATUS:TENTATIVE`. The browser downloads the `.ics` file for review. The installed
app independently validates the structured fields in its main process, writes a
mode-`0600` temporary file, and asks the operating system to open it in the default
calendar app. The file remains available for that WorkerBee session and is deleted on
a clean quit. Neither path accepts an arbitrary URL or performs a calendar mutation.

Approval and successful download or opening are recorded against the exact execution,
artifact ID, filename, schedule, recipients, destination, and SHA-256 hash of the
reviewed payload. Notes are intentionally excluded from audit data. Frontend, native,
and server validation enforce title, notes, location, attendee-count, date/time,
timezone, and duration limits. Live packaged-app QA verified the exact `.ics` contents,
restrictive permissions, approved/opened audit stages, truthful UI notice, and cleanup
after quit.

The next calendar depth should add an optional connector-specific preview and remote
create action only behind least-privilege scopes, an explicit final approval,
idempotency enforcement, and organization policy checks. The current local draft path
should remain the safe default.

### Durable task-history milestone

New work now creates an explicit task thread rather than relying on an assistant as
an accidental grouping key. Retries and requested improvements become ordered,
immutable attempts; every attempt keeps its prompt, status, artifacts, and revision
note. Home shows the latest thread state, while Work can navigate and download every
prior version. Creating a revision reuses both the original sources and the selected
prior artifact, and the external-processing review names the exact revision request,
files, and destination before a new version starts. New ledger tables are additive,
so existing desktop SQLite workspaces upgrade without column rewrites. The packaged
macOS app has been exercised against an existing workspace through task completion
and revision review.

### Cross-platform release-readiness milestone

WorkerBee now has a unified application identity across the native bundle and shared
web UI, with source PNG, macOS ICNS, Windows ICO, and Linux PNG assets. Desktop builds
are target-aware and fail before packaging when the requested operating system does
not match the host. A second Electron Builder hook independently checks that both the
FastAPI and OpenCode sidecars match the installer operating system and CPU
architecture and are executable where required.

The native packaging workflow runs tests and builds macOS ZIP/DMG, Windows per-user
NSIS/portable, and Linux AppImage artifacts on matching GitHub-hosted operating
systems. The Windows installer contract explicitly disables per-machine installation,
elevation, and the elevation helper; AppImage and macOS ZIP/DMG remain usable without
an administrator install. The rebuilt macOS ARM64 bundle has been inspected and
launched from its release directory with both bundled sidecars and the local workspace
ready. Windows and Linux are configured and guarded but still require their first
native CI artifacts and hands-on smoke tests before support can be called exercised.

### Business-first onboarding milestone

The web entry experience now matches the signed-in product instead of presenting an
unrelated technical "swarm terminal" identity. The landing page leads with the real
product contract: a business request plus working files becomes reviewable work while
the user keeps judgment and approval. It demonstrates actual task packs, promised
artifact sets, review gates, immutable improvement loops, and the web/local choice.
Unverifiable customer-count claims, fake documentation links, root-access language,
and autonomous-action promises have been removed.

Sign-in and registration share the same calm visual system and business language as
Home and Work. Forms now have visible labels, browser autocomplete semantics, password
visibility controls, accessible status and error regions, plain-language validation,
and a successful registration handoff that explains the next step. Registration no
longer requires accepting nonexistent linked policies. The supporting panel explains
the real data and approval model rather than simulated encryption status.

The public route, section anchors, registration validation, successful registration,
failed sign-in, successful sign-in, and first workspace entry have been exercised in
the web UI. Product analytics for the success measures below and organization-ready SSO
remain future depth once the authentication, consent, and policy requirements are defined.

### First-task activation milestone

A genuinely empty workspace now leads with **Your first useful result** instead of
asking a new user to scan twelve workflow cards. Four business outcomes—understanding
information, working with data, moving work forward, and deciding or persuading—each
rank three existing guided workflows. The recommendation explains why it fits, names
the deliverables it will create, preserves the setup-time expectation, and opens the
same server-backed guided contract used everywhere else.

The journey makes the full trust path visible before a task starts: choose an outcome,
add files, and review the result. Each outcome includes a relevant reassurance about
grounding, data preservation, unknown owners and dates, or draft commitments. The open
request composer remains available above the guide, and **Browse all 12 guided tasks**
reveals the complete catalog for users who already know the workflow they need.

The guide appears only after task threads, executions, and outputs all confirm that the
workspace is empty. Returning users continue to see the compact common-task catalog,
recent work, and latest outputs without onboarding friction. Focused tests cover outcome
uniqueness, ranked first recommendations, unknown outcomes, and broad workflow coverage.
A disposable web account and a clean packaged-app profile have both exercised outcome
selection, recommendation disclosure, full-catalog recovery, and handoff into the real
guided setup dialog.

The next activation depth should measure the first-session funnel only after an explicit
privacy-safe analytics contract exists, add optional sample inputs without mixing them
into real workspaces, and test recommendation language with representative business
roles. No activation experiment should record source filenames, prompts, or file content
by default.

### Unified work search milestone

The Home search affordance is now a real command palette rather than decorative UI.
`Command-K` on macOS and `Control-K` elsewhere opens one keyboard-navigable surface
across guided workflows, durable task threads, generated artifacts, and reusable source
files. Search indexes task titles and original requests, artifact filenames and producing
assistants, source filenames, stored file types and content types, workflow descriptions
and business categories, source hints, and promised deliverable names.

Default results prioritize recent work and outputs while keeping common tasks close at
hand. Multi-term search requires every term to match and boosts exact, prefix, and title
matches. Arrow keys move the active option, Enter opens it, and Escape closes the
palette. Selecting task history or an artifact opens the exact producing execution;
selecting a workflow opens its existing guided setup instead of creating a parallel
task path. Selecting a source opens its exact Library preview, where the user can inspect
the bounded private copy and continue into **Use in a task** without uploading it again.
The preview route resolves only through the signed-in file API; stale or unavailable
source links clear themselves and explain that the file is no longer in the workspace.
A dedicated mobile trigger exposes the same capability where the full search bar is hidden.

The search index has focused tests covering all four object types, multi-term business
queries, source filename and type discovery, workflow discovery through promised
deliverables, and unrelated-result rejection. Preview-link helpers cover context
preservation and close behavior. The web UI has exercised source search, exact private
preview, unavailable-source recovery, and task handoff in addition to the global
shortcut, direct trigger, empty state, keyboard selection, task navigation, artifact
navigation, workflow setup, and dismissal. A clean packaged macOS profile has exercised
the same local source-search, preview, and exact-file task route against its bundled
SQLite and filesystem runtime.

The next search depth should move indexing server-side when workspace scale requires it,
add collection names and saved source sets to ranking, and preserve ranking telemetry
without recording sensitive query contents by default.

### Files and outputs library milestone

**Files & outputs** is now a first-class business-user workspace rather than a link to
the advanced management console. One searchable library brings together reusable source
files and generated deliverables while keeping their different trust and lifecycle
semantics clear. Sources show type, size, date, and collection; deliverables show the
producing assistant, output type, size, date, download action, and a direct link back to
the exact producing task and immutable version history.

Users can upload one or more supported business files, create named collections, move
sources between collections, download them, and delete them only after an explicit
confirmation. Collection counts and summary cards make the state legible without
opening an administrative screen. Search covers source filenames, types, MIME metadata,
and collection names as well as deliverable titles, filenames, assistants, and output
types. In the combined view, unmatched sections collapse so the useful results remain
above the fold. `Command-K` or `Control-K` focuses library search without competing with
the Home command palette.

Home and Library now share one responsive navigation component, preventing web and
desktop routes from drifting. The browser labels the surface as a private workspace;
the packaged app explicitly says the library is saved on this computer and opens the
native macOS file picker for uploads. Focused search/filter tests, frontend lint and
production builds, web interaction QA, producing-task handoff, collection mutation,
native shortcut behavior, and packaged-app file-picker launch have all been exercised.

The next library depth should add pagination or server-side indexing for large workspaces
and collection-level export without weakening the current bounded source-selection
contract.

### Source preview and task handoff milestone

Stored source files are now useful before a task starts. **Preview** opens a polished,
read-only workspace dialog for CSV and TSV tables, text and JSON, extracted PDF text,
DOCX content, XLSX sheets, PPTX slide text, and supported images. Table previews keep
headers visible and allow workbook sheet switching. The dialog explains format-specific
limits so extracted text is not mistaken for exact layout, formulas, comments, charts,
notes, or scanned content.

Preview processing is bounded by file size, characters, rows, columns, sheets, pages,
slides, and expanded Office archive size. Oversized, damaged, legacy, and unsupported
formats fail closed with a useful fallback instead of attempting unsafe or unbounded
rendering. HTML and other textual sources are displayed as plain text; images load only
through the authenticated file route. Previewing never sends content to a model, executes
source code, or changes the original file.

**Use in a task** now makes the library genuinely reusable. It carries the exact owned
file ID into Home without another upload, displays a removable **Library** attachment,
counts that source toward guided workflow requirements, deduplicates it against connected
assistant knowledge, and includes the exact filename and size in the existing
data-sharing review. An unavailable or unauthorized handoff cannot silently degrade into
a fileless task.

Seven focused backend tests cover JSON, bounded CSV, multi-sheet XLSX, DOCX, PPTX,
authenticated image handoff shape, legacy formats, and the large-file boundary. Two
frontend tests cover source counting and exact resource-ID deduplication. A disposable
web workspace has exercised CSV upload, visual table preview, first-session guided
spreadsheet setup, and sharing review. A clean packaged-app profile has exercised the
same local table preview and exact-file Home handoff against its bundled SQLite and
filesystem runtime.

The next preview depth should add page-faithful PDF rendering, richer Office layout
previews, and accessible row/column virtualization for very wide datasets while
preserving the same local-only preview boundary.

### Multi-source library handoff milestone

Research, comparison, proposal, and planning work can now begin from an exact source set
instead of one file at a time. Every visible Library source has an accessible selection
control, **Select visible** builds a bounded set, and a persistent action bar keeps the
selected filenames and the **Use in a task** handoff visible. Starting from an open
preview respects the rest of the selection rather than discarding it.

The handoff uses stable, repeated `source` parameters in selection order, preserves
unrelated task context such as a chosen assistant, deduplicates IDs, and accepts at most
20 files. Home resolves every owned source independently, shows a removable **Library**
attachment for each file, and blocks the start if any requested source is unavailable or
the URL exceeds the boundary. It does not silently submit a partial source set. Guided
workflow requirements, connected-knowledge deduplication, the task request, and the
data-sharing review all use the same exact resolved set.

Five focused frontend tests cover unique source counting, exact resource-set
deduplication, stable ID normalization, repeated-parameter context preservation, and the
20-file boundary. A disposable web workspace exercised a three-source selection through
the two-step research-synthesis setup and verified all filenames and sizes in the final
sharing review. A clean packaged macOS profile exercised the same three-file selection
and exact local task route against the bundled SQLite and filesystem runtime.

The next source-set depth should add scalable selection across paginated or server-indexed
libraries without weakening ownership, export, or partial-handoff protections.

### Guided source-set shortcuts milestone

The Library now turns a selected source set into an obvious business outcome instead of
sending every user back through the full task chooser. One selected file recommends
**Summarize**; two or more recommend **Compare sources**. **Choose task** remains beside
the recommendation for users who need a different workflow, so the shortcut accelerates
the common path without hiding the complete catalog.

The recommendation carries the exact bounded source IDs plus a typed guided-workflow ID
to Home. Home resolves the files first, validates that the requested workflow still
exists and is guided, consumes the workflow parameter so refresh cannot reopen it, and
opens the normal server-backed setup dialog with default answers. Unknown workflow IDs
are removed with a clear recovery message while valid source attachments remain. The
normal required-file checks, definition of done, request generation, data-sharing review,
and task ledger remain unchanged.

A focused helper test covers source order, deduplication, workflow replacement, and
unrelated context preservation. A disposable web workspace exercised the single-source
Summarize recommendation, the two-source Compare recommendation, research-synthesis
setup with both exact files satisfying its two-source minimum, and invalid-workflow
recovery. A clean packaged macOS profile exercised the same two-file local selection and
direct guided comparison against its bundled SQLite and filesystem runtime.

### File-aware quick-start milestone

Quick starts now use source count plus stored file metadata to recommend the strongest
high-confidence workflow. A single CSV or Excel source recommends **Clean spreadsheet**;
a single non-tabular source recommends **Summarize**; and any multi-source selection
recommends **Compare sources**. The selected filenames remain visible, and the action bar
explains why the recommendation fits—for example, that spreadsheet cleanup preserves rows
and reports every transformation.

The rule is deterministic and local. It reads only file count, stored file type, and MIME
type; it never opens or analyzes source content, calls a model, or starts work. **Choose
task** always remains available. Every recommendation still opens the ordinary guided
setup, required-source checks, definition of done, and sharing review before execution.

Three focused tests cover Excel and MIME-based tabular detection, the single-document
fallback, multi-source comparison, and empty selection. A disposable web workspace
exercised a CSV recommendation through both spreadsheet-cleanup setup steps with the
exact Library file and two-output contract. A clean packaged macOS profile exercised the
same local CSV recommendation and direct guided launch against its bundled SQLite and
filesystem runtime.

The next quick-start depth should consider additional rules only where metadata makes
the outcome genuinely high-confidence, such as an explicitly named meeting agenda. Any
new rule must remain explainable, reversible through **Choose task**, and unable to inspect
file contents or bypass setup and sharing review.

### Collection maintenance milestone

Collections now support the maintenance work that appears as soon as a library becomes
useful. A user can select up to 20 visible sources, open **Move**, choose one owned
collection, and move the complete set in one operation. The backend deduplicates repeated
IDs and validates ownership of the target collection and every source before changing any
link, so an invalid or foreign ID cannot leave a partial move behind. The same bounded set
size is used by task handoff and batch organization.

User-created collections can be renamed inline. Names are trimmed, case-insensitive
duplicates are rejected, and the reserved Default collection cannot be renamed or deleted.
Deletion remains intentionally conservative: the action is disabled while a collection has
files, explains that they must be moved first, and requires an explicit confirmation after
the collection is empty. The server independently enforces the same empty-only rule.

Five focused backend tests cover count-preserving rename, protected defaults, duplicate
names, deduplicated batch movement, ownership prevalidation before mutation, and empty-only
deletion. A disposable web workspace exercised a two-file move, rename, nonempty guard,
reverse move, and delete confirmation. Packaged-app QA caught a stale embedded backend
binary during the first run; after rebuilding the runtime, the macOS app passed batch move,
count updates, the nonempty guard, rename, and visual layout review against local SQLite.

The next collection depth should add scalable selection across pagination and optional
collection-level export. Bulk actions must keep the same bounded ownership checks and
must never silently skip unavailable items.

### Packaged runtime compatibility milestone

The installable app now proves that its embedded backend matches the UI before declaring
the local workspace ready or producing an installer. FastAPI publishes a versioned desktop
runtime contract plus stable capability names for session authentication, work packs,
task history, previews, collection maintenance, batch moves, source-set management,
batch download, external-action audit, and calendar-draft handoff.
The Electron consumer requires the same contract at startup, so an old sidecar produces a
clear compatibility error instead of a misleading ready state followed by endpoint failures.

The native packager goes further: its existing operating-system and CPU checks now launch
the exact `workerbee-backend` binary against a disposable SQLite database, read `/health`,
and fail before packaging if the contract is missing, the version differs, or any required
capability is absent. A native-build hook also embeds a SHA-256 ID over the backend
application source, desktop entry point, project metadata, and locked dependencies. The
packager recomputes that ID and rejects a capability-compatible binary built from older
source. The probe binds only to loopback, uses disposable credentials and storage, does
not start a model task, terminates the process, and removes its temporary database after
verification. The compatibility helper itself is included in the Electron bundle so the
same contract validation runs on every local startup.

Focused tests cover a compatible response, a pre-contract stale backend, an incompatible
contract version, a missing build ID, deterministic source fingerprinting, fingerprint
changes after source edits, and diagnostic reporting of missing capabilities. The release
gate was exercised against the previously bundled stale binary and rejected it by name;
after the backend was rebuilt, the same packager reported contract 1, all ten
capabilities, and the current build ID. The resulting packaged macOS app then reached
**Ready to work** on a clean local profile.

The next runtime-reliability depth should add a small post-install smoke executable for the
Windows and Linux CI artifacts, signed-candidate startup checks, and controlled compatibility
policy for rolling updates. Capability removal or semantic changes must increment the
contract version rather than silently reusing an existing name.

### Batch source export milestone

Selected working files can now leave the Library as one exact ZIP instead of requiring a
series of individual downloads. Selecting two to 20 sources exposes **Download** beside
the existing move and task actions. The browser starts a normal download; the installed
app sends the same response through the shared native **Save a copy** adapter, remembers
the user's chosen destination, and offers **Show in folder** after a successful save.
Selection remains intact so the same evidence set can still be moved or used in a task.

The server deduplicates IDs in stable request order and validates ownership of the entire
set before opening any source or creating archive bytes. A foreign or unavailable item
fails the complete request rather than producing a partial ZIP. Both declared and actual
source bytes are bounded to 250 MB. Archive members are flat, strip traversal and unsafe
cross-platform filename characters, and resolve case-insensitive duplicates
deterministically. ZIP creation runs away from the request event loop and uses a spooled
temporary file so small exports remain in memory while larger allowed exports can stream
without an unbounded allocation. The desktop runtime contract now requires the
`source-batch-download` capability, preventing a UI with this action from shipping beside
an older sidecar.

Five focused backend tests cover exact streamed contents and order, repeated IDs,
case-insensitive filename collisions, traversal sanitization, declared-size and
missing-file bounds, and ownership prevalidation before archive construction. Live web QA
exercised selection, the new action, and its completion notice against two disposable
uploaded sources; an independent API check verified both response members byte for byte.
The freshly packaged macOS app opened the native save dialog with the expected filename,
saved to an explicit disposable path, kept both sources selected, showed **Show in
folder**, and produced an archive whose members byte-matched the originals. The current
packaging gate reports contract 1, ten capabilities, and the exact rebuilt backend
fingerprint.

The next export depth should add optional collection-level export, pagination-safe
selection, and Windows and Linux native-dialog smoke coverage.
These must preserve all-or-nothing ownership validation and deterministic archive naming.

### Saved source sets milestone

Recurring work can now preserve its exact evidence as a named saved source set without
moving or duplicating files. A user can save one to 20 selected sources, restore the same
stable order later, rename the set inline, replace its complete membership from the
current selection, download it through the existing bounded ZIP flow, or carry it into a
new task. Saved sets intentionally overlap collections: collections remain the primary
place a file lives, while several reusable sets can reference the same source for
different reviews, reports, and decisions.

The backend trims names, rejects case-insensitive duplicates per user, deduplicates file
IDs in request order, and validates ownership of every requested source before creating
or changing anything. Membership replacement is all-or-nothing, so a missing or foreign
file cannot leave a partially updated set. Deleting a set removes only its references and
never deletes the underlying sources. The Library applies the same exactness rule when a
saved set is selected, downloaded, or used in a task: if any member is unavailable, the
whole action stops with a clear recovery message instead of silently using the remainder.
The desktop runtime contract now requires `source-set-management` so the packaged UI
cannot ship beside an older local sidecar.

Four focused backend tests cover stable deduplicated order, create-time ownership
prevalidation, atomic replacement, duplicate-name rejection, and source-preserving
deletion. A focused frontend test covers exact restoration and missing-member reporting.
A disposable web workspace exercised create, clear and restore, exact two-file task
handoff, ZIP download, inline rename, and source-preserving deletion. A freshly packaged
macOS app created the same kind of set against its local SQLite and filesystem runtime,
survived a full application restart, restored both exact Library attachments, and passed
visual layout review at the normal desktop window size.

The next saved-set depth should add server-indexed discovery and pagination-safe editing
for very large libraries, optional set duplication, and organization sharing only after a
clear permission model exists. Every extension must preserve stable ordering,
all-or-nothing ownership checks, and source-preserving deletion.

### Native deliverable export milestone

The installed app now returns finished work to the user's filesystem through a native
**Save a copy** workflow instead of relying on Chromium's browser-download behavior.
Home, Work, Files & outputs, and the advanced assistant surfaces all use the same shared
delivery adapter: the web continues to start a normal download, while desktop opens the
operating system save dialog with the real filename and an explicit destination.

The Electron renderer can only submit a filename and binary bytes through a narrow IPC
contract. The main process removes traversal and unsafe filename characters, rejects
empty or non-binary payloads, enforces a 250 MB boundary, waits for the user to choose a
destination, and writes only that chosen path. A successful save returns a calm in-app
confirmation with **Show in folder**; canceling the dialog creates no file and reports
no false success.

Focused desktop tests cover normal filenames, traversal attempts, unsafe characters,
binary isolation, empty content, malformed content, and the size limit. The web library
flow has exercised its unchanged download fallback. The rebuilt macOS package has saved
a real versioned deliverable to a disposable location, verified the exact file content,
shown the success state, and opened the containing folder from WorkerBee.

The next export depth should add optional format-specific “Open with” actions, overwrite
and extension-mismatch guidance, and organization policies for restricted destinations.
Any future direct-open action must preserve the same explicit local path boundary and
must never execute generated files automatically.

### Business activity timeline milestone

**Activity** is now a dedicated work-history surface rather than another route into the
advanced assistant console. It uses the durable task ledger as its source of truth and
translates execution states into plain business language: Starting, Working, Ready,
Needs attention, and Stopped. Summary cards show active work, review-ready tasks,
failures requiring attention, and the total deliverables created across the visible
ledger.

The timeline groups tasks into Today, Yesterday, This week, and Earlier. Each item keeps
the original request visible, identifies the guided workflow and producing assistant
when known, shows version and deliverable counts, explains the current state, and offers
the appropriate next action: follow progress, review the result, or open the existing
recovery flow. Running work refreshes automatically while a manual refresh remains
available. Unknown historical workflow IDs remain unlabeled rather than being assigned
an incorrect modern pack name.

Status filters, counts, and multi-term search across titles, requests, assistants, and
workflow names have focused tests. The web UI has been exercised with running,
completed, failed, and cancelled tasks across multiple dates, including filter recovery
and a failed-task retry handoff. The rebuilt local Mac app labels the route as live local
activity, filters its existing SQLite ledger, and opens a completed task's review and
version history. Raw execution details remain available as an explicit advanced path
instead of dominating the default view.

The next Activity depth should add pagination for large histories, task-level bulk
archival, and a compact organization view for administrators. Archival must be
reversible without deleting task history or deliverables.

### Task completion notifications milestone

Task completion is now visible outside the Activity page. A global signed-in watcher
turns real execution transitions into calm, actionable in-app alerts on every business
surface. Ready work links directly to review; failures link to the existing recovery
flow. The watcher establishes a silent baseline on sign-in, ignores historical results
and cancellations, does not repeat alerts, and also catches very fast tasks that finish
between polls without replaying older work.

The installed app adds an opt-out desktop notification path for work that finishes while
WorkerBee is in the background. Native notification content is deliberately generic: it
contains no request text, filenames, task titles, or generated content. Clicking a native
notification restores WorkerBee and routes to the exact task. The renderer can request
only a bounded execution ID and a completed or failed status; the Electron main process
validates both, refuses foreground notifications, and owns the operating-system API.

Focused transition tests cover completion, failure, cancellation, history suppression,
deduplication, fast completion, invalid timestamps, and snapshot state. Desktop tests
cover the narrow request contract and privacy-safe copy. The web UI has exercised a
background completion alert from the Files & outputs route through direct result review.
A clean packaged-app profile has exercised the default-on preference, opt-out and opt-in,
and success and failure transitions while the app was hidden. The unsigned alpha package
did not produce a visually observable macOS banner, so operating-system presentation and
click-through remain release-gated on a signed and notarized candidate even though the
native bridge is implemented and covered. No analytics or remote notification service is
used.

The next notification depth should add signed macOS smoke coverage, Windows and Linux
native delivery checks, optional sound and quiet-hours controls, and organization policy.
Any future notification analytics must remain content-free and explicitly governed.

### Business assistants milestone

**Assistants** is now a dedicated specialist library for recurring business work rather
than a shortcut into the advanced management console. Users can find specialists by
name, role, or specialty; filter active, paused, and knowledge-connected assistants;
and understand workspace coverage through clear summary counts. Cards foreground the
specialist's purpose and connected-knowledge count while keeping activation reversible.

Guided creation starts with business presets for reporting and analysis, research and
synthesis, project operations, and proposals and writing. A user can name the role,
refine its working instructions, and optionally connect existing knowledge collections
without choosing models or configuring runtime mechanics. Creating a specialist from a
blank backend template no longer leaks implementation labels into the interface.

The primary **Use assistant** action now returns to the trusted Home composer with the
selected specialist and connected-file count visible. The pre-run sharing review names
the exact connected files alongside any newly uploaded sources before work starts, and
the resulting execution continues through the normal task, review, and version-history
flow. The technical run console remains available only through an explicit advanced
settings path.

Focused tests cover template naming, counts, filters, multi-term search, and sorting.
The web flow has exercised guided creation with a knowledge collection, search,
pause/reactivate, specialist handoff, and exact-file sharing review. The rebuilt local
Mac app has exercised the native specialist library, search, and the same Home handoff
with locally connected knowledge.

The next Assistants depth should add organization-shared specialists with explicit
permissions, usage and outcome history, safe editing with versioned instructions, and
clear ownership and review states. Sharing must never silently broaden access to an
assistant's connected knowledge.

## Success measures

- Median time from sign-in to first submitted task.
- Percentage of new users who produce and download or open an artifact in session one.
- Task completion and successful retry rates by work pack.
- Percentage of runs requiring users to inspect raw logs.
- Artifact revision rate and repeat weekly active usage.
- Desktop install success without elevated privileges.

## Near-term engineering guardrails

- Do not expose model choice in the primary task path unless the outcome requires it.
- Do not duplicate business logic in Electron; privileged desktop code stays a thin
  platform adapter.
- Do not let desktop renderer code access arbitrary Node APIs.
- Keep advanced power-user capabilities, but move them out of the default path.
- Add tests around API contracts and task state before expanding workflow complexity.
