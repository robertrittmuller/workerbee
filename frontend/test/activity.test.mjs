import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'workerbee-activity-'))
const outputPath = path.join(temporaryDirectory, 'activity.mjs')
await build({
  entryPoints: [path.resolve('src/lib/activity.ts')],
  outfile: outputPath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const {
  activityCounts,
  activityDateGroup,
  activityFilterForStatus,
  filterActivityItems,
  relativeActivityTime,
} = await import(pathToFileURL(outputPath))

test.after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

function thread(id, status, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    original_prompt: `Request for ${id}`,
    agent_id: null,
    status,
    work_pack: null,
    resource_ids: [],
    created_at: '2026-07-21T12:00:00Z',
    updated_at: '2026-07-21T12:00:00Z',
    latest_execution_id: `execution-${id}`,
    latest_attempt_number: 1,
    attempt_count: 1,
    artifact_count: 1,
    ...overrides,
  }
}

const items = [
  { thread: thread('running', 'running'), agentName: 'Revenue assistant', workflowName: 'Recurring KPI report' },
  { thread: thread('ready', 'completed', { title: 'Board revenue summary' }), agentName: 'Reporting assistant', workflowName: 'Project status' },
  { thread: thread('failed', 'failed', { original_prompt: 'Prepare the launch risk memo' }), agentName: 'Memo assistant', workflowName: 'Decision memo' },
  { thread: thread('stopped', 'cancelled'), agentName: null, workflowName: null },
]

test('maps execution states to business activity filters', () => {
  assert.equal(activityFilterForStatus('pending'), 'active')
  assert.equal(activityFilterForStatus('running'), 'active')
  assert.equal(activityFilterForStatus('completed'), 'ready')
  assert.equal(activityFilterForStatus('failed'), 'attention')
  assert.equal(activityFilterForStatus('cancelled'), 'stopped')
})

test('counts each activity state for filter badges and summary cards', () => {
  assert.deepEqual(activityCounts(items), {
    all: 4,
    active: 1,
    ready: 1,
    attention: 1,
    stopped: 1,
  })
})

test('filters by state and requires every search token across business metadata', () => {
  assert.deepEqual(filterActivityItems(items, 'ready', '').map((item) => item.thread.id), ['ready'])
  assert.deepEqual(filterActivityItems(items, 'all', 'board reporting').map((item) => item.thread.id), ['ready'])
  assert.deepEqual(filterActivityItems(items, 'attention', 'launch memo').map((item) => item.thread.id), ['failed'])
  assert.deepEqual(filterActivityItems(items, 'ready', 'launch'), [])
})

test('groups recent work into stable business date buckets', () => {
  const now = new Date('2026-07-21T18:00:00Z')
  assert.equal(activityDateGroup('2026-07-21T08:00:00Z', now), 'Today')
  assert.equal(activityDateGroup('2026-07-20T08:00:00Z', now), 'Yesterday')
  assert.equal(activityDateGroup('2026-07-17T08:00:00Z', now), 'This week')
  assert.equal(activityDateGroup('2026-07-01T08:00:00Z', now), 'Earlier')
})

test('formats compact relative activity times', () => {
  const now = Date.parse('2026-07-21T18:00:00Z')
  assert.equal(relativeActivityTime('2026-07-21T17:55:00Z', now), '5m ago')
  assert.equal(relativeActivityTime('2026-07-21T15:00:00Z', now), '3h ago')
  assert.equal(relativeActivityTime('2026-07-19T18:00:00Z', now), '2d ago')
})
