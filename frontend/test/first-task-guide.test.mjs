import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'workerbee-first-task-'))
const outputPath = path.join(temporaryDirectory, 'first-task-guide.mjs')
await build({
  entryPoints: [path.resolve('src/lib/firstTaskGuide.ts')],
  outfile: outputPath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const { FIRST_TASK_OUTCOMES, getFirstTaskOutcome, uniqueRecommendedWorkPackIds } =
  await import(pathToFileURL(outputPath))

test.after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

test('offers four distinct business outcomes with three ranked recommendations each', () => {
  assert.equal(FIRST_TASK_OUTCOMES.length, 4)
  assert.equal(new Set(FIRST_TASK_OUTCOMES.map((outcome) => outcome.id)).size, 4)
  for (const outcome of FIRST_TASK_OUTCOMES) {
    assert.equal(outcome.workPackIds.length, 3)
    assert.equal(new Set(outcome.workPackIds).size, 3)
    assert.ok(outcome.reassurance.length > 20)
  }
})

test('keeps the strongest starting workflow first for each outcome', () => {
  assert.equal(getFirstTaskOutcome('understand').workPackIds[0], 'document-summarization')
  assert.equal(getFirstTaskOutcome('data').workPackIds[0], 'spreadsheet-cleanup')
  assert.equal(getFirstTaskOutcome('move-work').workPackIds[0], 'project-status-reporting')
  assert.equal(getFirstTaskOutcome('decide').workPackIds[0], 'decision-memo')
})

test('returns no recommendation for unknown outcomes', () => {
  assert.equal(getFirstTaskOutcome('unknown'), null)
  assert.equal(getFirstTaskOutcome(null), null)
})

test('covers the broad first-session workflow set without duplicate output', () => {
  const ids = uniqueRecommendedWorkPackIds()
  assert.equal(ids.length, new Set(ids).size)
  assert.ok(ids.includes('research-synthesis'))
  assert.ok(ids.includes('recurring-reporting'))
  assert.ok(ids.includes('presentation-creation'))
})
