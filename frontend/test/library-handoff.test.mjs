import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/lib/libraryHandoff.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { module, exports: module.exports, Set, Array, Math, URLSearchParams })

const {
  MAX_LIBRARY_TASK_SOURCES,
  attachedSourceCount,
  libraryPreviewSearch,
  libraryPreviewSourceId,
  libraryQuickStart,
  resolveLibrarySourceSet,
  librarySourceSearch,
  libraryTaskSearch,
  taskResourceIds,
  uniqueLibrarySourceIds,
} = module.exports

test('counts unique library sources alongside newly attached files', () => {
  assert.equal(attachedSourceCount(0, []), 0)
  assert.equal(attachedSourceCount(2, []), 2)
  assert.equal(attachedSourceCount(2, ['library-a', 'library-b', 'library-a']), 4)
})

test('includes the exact library source set without duplicating connected knowledge', () => {
  assert.deepEqual(
    Array.from(taskResourceIds(['connected-a', 'shared-id'], ['shared-id', 'library-b'], ['upload-c'])),
    ['connected-a', 'shared-id', 'library-b', 'upload-c']
  )
})

test('normalizes source IDs in stable selection order', () => {
  assert.deepEqual(Array.from(uniqueLibrarySourceIds([' a ', '', 'b', 'a', ' c '])), ['a', 'b', 'c'])
})

test('resolves saved source sets exactly and reports unavailable members without partial handoff', () => {
  const resolution = resolveLibrarySourceSet(
    ['file-b', 'file-a', 'file-b', 'missing'],
    ['file-a', 'file-b', 'other']
  )
  assert.deepEqual(Array.from(resolution.fileIds), ['file-b', 'file-a'])
  assert.deepEqual(Array.from(resolution.missingIds), ['missing'])
})

test('writes repeated source parameters without losing unrelated handoff context', () => {
  const search = librarySourceSearch('assistant=helper&source=old', ['file-a', 'file-b', 'file-a'])
  const params = new URLSearchParams(search)
  assert.equal(params.get('assistant'), 'helper')
  assert.deepEqual(params.getAll('source'), ['file-a', 'file-b'])
})

test('bounds a task handoff to the visible twenty-file selection contract', () => {
  const ids = Array.from({ length: MAX_LIBRARY_TASK_SOURCES + 3 }, (_, index) => `file-${index}`)
  const params = new URLSearchParams(librarySourceSearch('', ids))
  assert.equal(params.getAll('source').length, MAX_LIBRARY_TASK_SOURCES)
  assert.equal(params.getAll('source').at(-1), `file-${MAX_LIBRARY_TASK_SOURCES - 1}`)
})

test('writes and reads a source preview without losing other library context', () => {
  const search = libraryPreviewSearch('view=sources&preview=old', ' file-a ')
  assert.equal(libraryPreviewSourceId(search), 'file-a')
  assert.equal(new URLSearchParams(search).get('view'), 'sources')
})

test('clears only the source preview parameter when the dialog closes', () => {
  const search = libraryPreviewSearch('preview=file-a&collection=finance')
  const params = new URLSearchParams(search)
  assert.equal(params.has('preview'), false)
  assert.equal(params.get('collection'), 'finance')
})

test('carries an exact source set into one guided workflow without losing other context', () => {
  const search = libraryTaskSearch(
    'assistant=specialist&workflow=old',
    [' file-a ', 'file-b', 'file-a'],
    'research-synthesis'
  )
  const params = new URLSearchParams(search)
  assert.deepEqual(params.getAll('source'), ['file-a', 'file-b'])
  assert.equal(params.get('workflow'), 'research-synthesis')
  assert.equal(params.get('assistant'), 'specialist')
})

test('recommends spreadsheet cleanup for one tabular source', () => {
  assert.deepEqual(
    { ...libraryQuickStart([{ file_type: 'excel', content_type: 'application/octet-stream' }]) },
    {
      workflowId: 'spreadsheet-cleanup',
      label: 'Clean spreadsheet',
      reason: 'One tabular source · preserve rows and explain every cleanup',
    }
  )
  assert.equal(
    libraryQuickStart([{ file_type: 'unknown', content_type: 'text/csv' }]).workflowId,
    'spreadsheet-cleanup'
  )
})

test('recommends a grounded summary for one non-tabular source', () => {
  const recommendation = libraryQuickStart([{ file_type: 'pdf', content_type: 'application/pdf' }])
  assert.equal(recommendation.workflowId, 'document-summarization')
  assert.equal(recommendation.label, 'Summarize')
})

test('recommends research comparison for any multi-source set and nothing for an empty set', () => {
  assert.equal(libraryQuickStart([]), null)
  const recommendation = libraryQuickStart([
    { file_type: 'csv', content_type: 'text/csv' },
    { file_type: 'text', content_type: 'text/plain' },
  ])
  assert.equal(recommendation.workflowId, 'research-synthesis')
  assert.equal(recommendation.label, 'Compare sources')
  assert.match(recommendation.reason, /^2 sources/)
})
