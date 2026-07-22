import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'workerbee-search-'))
const outputPath = path.join(temporaryDirectory, 'work-search.mjs')
await build({
  entryPoints: [path.resolve('src/lib/workSearch.ts')],
  outfile: outputPath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const { buildWorkSearchItems, searchWorkItems } = await import(pathToFileURL(outputPath))

test.after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

const thread = {
  id: 'thread-1',
  title: 'Atlas weekly status',
  original_prompt: 'Explain delivery progress and security risk for the steering committee.',
  agent_id: 'agent-1',
  status: 'completed',
  work_pack: { id: 'project-status-reporting' },
  resource_ids: [],
  created_at: '2026-07-20T12:00:00Z',
  updated_at: '2026-07-21T12:00:00Z',
  latest_execution_id: 'execution-1',
  latest_attempt_number: 2,
  attempt_count: 2,
  artifact_count: 3,
}

const output = {
  id: 'output-1',
  execution_id: 'execution-1',
  output_id: null,
  filename: 'status-update-message.md',
  content_type: 'text/markdown',
  file_size: 1200,
  storage_path: '/tmp/status-update-message.md',
  created_at: '2026-07-21T12:05:00Z',
  agent_id: 'agent-1',
  agent_name: 'Atlas status assistant',
  output_name: null,
  output_type: 'markdown',
  attempt_number: 2,
}

const sourceFile = {
  id: 'source-1',
  user_id: 'user-1',
  filename: 'source-1_customer-renewal-plan.xlsx',
  original_filename: 'customer-renewal-plan.xlsx',
  content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  file_size: 24576,
  storage_path: 'uploads/user-1/source-1_customer-renewal-plan.xlsx',
  file_type: 'excel',
  created_at: '2026-07-21T12:10:00Z',
}

test('indexes workflows, task history, deliverables, and source files', () => {
  const items = buildWorkSearchItems([thread], [output], [sourceFile])
  assert.ok(items.some((item) => item.id === 'thread:thread-1'))
  assert.ok(items.some((item) => item.id === 'output:output-1'))
  assert.ok(items.some((item) => item.id === 'source:source-1'))
  assert.ok(items.some((item) => item.id === 'workflow:recurring-reporting'))
})

test('matches multiple business terms across a task title and request', () => {
  const results = searchWorkItems(buildWorkSearchItems([thread], [output]), 'atlas risk')
  assert.equal(results[0].id, 'thread:thread-1')
})

test('finds workflows by their promised deliverables', () => {
  const results = searchWorkItems(buildWorkSearchItems([], []), 'stakeholder message')
  assert.ok(results.some((item) => item.id === 'workflow:project-status-reporting'))
})

test('requires every query token and returns no unrelated results', () => {
  const results = searchWorkItems(buildWorkSearchItems([thread], [output]), 'atlas invoice')
  assert.equal(results.length, 0)
})

test('finds an owned source by filename and business file type', () => {
  const results = searchWorkItems(buildWorkSearchItems([], [], [sourceFile]), 'renewal xlsx')
  assert.equal(results[0].id, 'source:source-1')
  assert.equal(results[0].fileId, 'source-1')
})
