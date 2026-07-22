import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'workerbee-completion-'))
const outputPath = path.join(temporaryDirectory, 'task-completion.mjs')
await build({
  entryPoints: [path.resolve('src/lib/taskCompletion.ts')],
  outfile: outputPath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const { executionStatusSnapshot, newlyFinishedTasks, taskCompletionTransitions } = await import(pathToFileURL(outputPath))

test.after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

test('detects pending or running tasks that become ready', () => {
  const previous = { one: 'pending', two: 'running' }
  assert.deepEqual(
    taskCompletionTransitions(previous, [
      { id: 'one', status: 'completed' },
      { id: 'two', status: 'completed' },
    ]),
    [
      { executionId: 'one', status: 'completed' },
      { executionId: 'two', status: 'completed' },
    ]
  )
})

test('detects active tasks that fail and ignores user-cancelled work', () => {
  assert.deepEqual(
    taskCompletionTransitions({ one: 'running', two: 'running' }, [
      { id: 'one', status: 'failed' },
      { id: 'two', status: 'cancelled' },
    ]),
    [{ executionId: 'one', status: 'failed' }]
  )
})

test('does not notify for terminal history loaded on startup', () => {
  assert.deepEqual(
    taskCompletionTransitions({}, [
      { id: 'old-ready', status: 'completed' },
      { id: 'old-failure', status: 'failed' },
    ]),
    []
  )
})

test('does not repeat a terminal notification or infer unsupported transitions', () => {
  assert.deepEqual(
    taskCompletionTransitions({ ready: 'completed', stopped: 'cancelled' }, [
      { id: 'ready', status: 'completed' },
      { id: 'stopped', status: 'failed' },
    ]),
    []
  )
})

test('detects a fast task first discovered after it already finished', () => {
  const notBefore = Date.parse('2026-07-21T12:00:00Z')
  assert.deepEqual(
    newlyFinishedTasks({ old: 'completed' }, [
      { id: 'old', status: 'completed', started_at: '2026-07-21T11:00:00Z' },
      { id: 'new', status: 'completed', started_at: '2026-07-21T12:00:01Z' },
      { id: 'older-unknown', status: 'failed', started_at: '2026-07-20T12:00:00Z' },
    ], notBefore),
    [{ executionId: 'new', status: 'completed' }]
  )
})

test('does not infer a fast-task notification without a trustworthy start time', () => {
  assert.deepEqual(
    newlyFinishedTasks({}, [
      { id: 'missing', status: 'completed', started_at: null },
      { id: 'invalid', status: 'failed', started_at: 'not-a-date' },
    ], Date.now()),
    []
  )
})

test('builds a compact status snapshot for the next poll', () => {
  assert.deepEqual(
    executionStatusSnapshot([
      { id: 'a', status: 'running' },
      { id: 'b', status: 'completed' },
    ]),
    { a: 'running', b: 'completed' }
  )
})
