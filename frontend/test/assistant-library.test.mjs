import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'workerbee-assistants-'))
const outputPath = path.join(temporaryDirectory, 'assistant-library.mjs')
await build({
  entryPoints: [path.resolve('src/lib/assistantLibrary.ts')],
  outfile: outputPath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const { assistantCounts, assistantTemplateName, filterAssistantItems, sortAssistantItems } =
  await import(pathToFileURL(outputPath))

test.after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

function agent(id, overrides = {}) {
  return {
    id,
    user_id: 'user-1',
    agent_type_id: null,
    name: `Assistant ${id}`,
    description: `Helps with ${id}`,
    config: { resource_ids: [] },
    llm_settings: null,
    is_active: true,
    created_at: '2026-07-20T12:00:00Z',
    updated_at: '2026-07-20T12:00:00Z',
    ...overrides,
  }
}

const items = [
  {
    agent: agent('reporting', {
      name: 'Revenue reporting partner',
      description: 'Explains quarterly performance and regional drivers.',
      config: { resource_ids: ['file-1', 'file-2'], template: { name: 'Recurring KPI Report' } },
      updated_at: '2026-07-21T12:00:00Z',
    }),
    templateName: 'Recurring KPI Report',
  },
  {
    agent: agent('research', {
      name: 'Research partner',
      description: 'Synthesizes sources and evidence gaps.',
      is_active: false,
      updated_at: '2026-07-22T12:00:00Z',
    }),
    templateName: null,
  },
]

test('extracts meaningful template names and hides the blank starter label', () => {
  assert.equal(assistantTemplateName(items[0].agent), 'Recurring KPI Report')
  assert.equal(
    assistantTemplateName(agent('blank', { config: { template: { name: 'Blank Agent' } } })),
    null
  )
  assert.equal(
    assistantTemplateName(agent('starter', { config: { template: { name: 'Blank Template' } } })),
    null
  )
  assert.equal(assistantTemplateName(agent('none')), null)
})

test('counts active, paused, and knowledge-connected assistants', () => {
  assert.deepEqual(assistantCounts(items), { all: 2, active: 1, paused: 1, knowledge: 1 })
})

test('filters assistants by state, knowledge, and multi-term business search', () => {
  assert.deepEqual(filterAssistantItems(items, 'active', '').map((item) => item.agent.id), ['reporting'])
  assert.deepEqual(filterAssistantItems(items, 'paused', '').map((item) => item.agent.id), ['research'])
  assert.deepEqual(filterAssistantItems(items, 'knowledge', '').map((item) => item.agent.id), ['reporting'])
  assert.deepEqual(filterAssistantItems(items, 'all', 'quarterly regional').map((item) => item.agent.id), ['reporting'])
  assert.deepEqual(filterAssistantItems(items, 'all', 'research evidence').map((item) => item.agent.id), ['research'])
})

test('sorts active assistants before paused assistants and then by recency', () => {
  assert.deepEqual(sortAssistantItems(items).map((item) => item.agent.id), ['reporting', 'research'])
  const activeItems = [
    items[0],
    { agent: agent('newer', { updated_at: '2026-07-23T12:00:00Z' }), templateName: null },
  ]
  assert.deepEqual(sortAssistantItems(activeItems).map((item) => item.agent.id), ['newer', 'reporting'])
})
