import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'workerbee-library-'))
const outputPath = path.join(temporaryDirectory, 'library-search.mjs')
await build({
  entryPoints: [path.resolve('src/lib/librarySearch.ts')],
  outfile: outputPath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const { filterLibraryOutputs, filterLibrarySources, formatFileSize } = await import(
  pathToFileURL(outputPath)
)

test.after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

const sources = [
  {
    id: 'source-1',
    user_id: 'user-1',
    filename: 'source-1.xlsx',
    original_filename: 'Quarterly Revenue.xlsx',
    content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file_size: 24000,
    storage_path: 'uploads/source-1.xlsx',
    file_type: 'excel',
    created_at: '2026-07-21T12:00:00Z',
    groupId: 'group-finance',
    groupName: 'Finance planning',
  },
  {
    id: 'source-2',
    user_id: 'user-1',
    filename: 'source-2.pdf',
    original_filename: 'Launch brief.pdf',
    content_type: 'application/pdf',
    file_size: 2400000,
    storage_path: 'uploads/source-2.pdf',
    file_type: 'pdf',
    created_at: '2026-07-21T12:00:00Z',
    groupId: 'group-marketing',
    groupName: 'Launch planning',
  },
]

const outputs = [
  {
    id: 'output-1',
    execution_id: 'execution-1',
    output_id: null,
    filename: 'board-summary.md',
    content_type: 'text/markdown',
    file_size: 1500,
    storage_path: 'outputs/board-summary.md',
    created_at: '2026-07-21T12:00:00Z',
    agent_id: 'agent-1',
    agent_name: 'Reporting assistant',
    output_name: 'Board summary',
    output_type: 'markdown',
  },
]

test('searches source names, types, and collection names', () => {
  assert.deepEqual(filterLibrarySources(sources, 'revenue').map((file) => file.id), ['source-1'])
  assert.deepEqual(filterLibrarySources(sources, 'launch planning').map((file) => file.id), ['source-2'])
  assert.deepEqual(filterLibrarySources(sources, 'excel').map((file) => file.id), ['source-1'])
})

test('combines collection and text filters', () => {
  assert.deepEqual(filterLibrarySources(sources, 'planning', 'group-finance').map((file) => file.id), ['source-1'])
  assert.deepEqual(filterLibrarySources(sources, 'brief', 'group-finance'), [])
})

test('searches deliverables by title, assistant, and output type', () => {
  assert.equal(filterLibraryOutputs(outputs, 'board').length, 1)
  assert.equal(filterLibraryOutputs(outputs, 'reporting').length, 1)
  assert.equal(filterLibraryOutputs(outputs, 'markdown').length, 1)
  assert.equal(filterLibraryOutputs(outputs, 'spreadsheet').length, 0)
})

test('formats file sizes for compact library metadata', () => {
  assert.equal(formatFileSize(500), '500 B')
  assert.equal(formatFileSize(1536), '1.5 KB')
  assert.equal(formatFileSize(2 * 1024 * 1024), '2.0 MB')
})
