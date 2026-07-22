const assert = require('node:assert/strict')
const test = require('node:test')

const { taskNotificationCopy, validateTaskNotification } = require('../src/task-notification.cjs')

test('accepts only a bounded execution ID and notifiable status', () => {
  assert.deepEqual(
    validateTaskNotification({ executionId: 'f231e277-e03d-455e-925e-44da43194312', status: 'completed' }),
    { executionId: 'f231e277-e03d-455e-925e-44da43194312', status: 'completed' }
  )
  assert.throws(() => validateTaskNotification({ executionId: '../private', status: 'completed' }), /valid execution ID/)
  assert.throws(() => validateTaskNotification({ executionId: 'task-1', status: 'cancelled' }), /completed or failed/)
})

test('uses generic notification copy without task content', () => {
  assert.deepEqual(taskNotificationCopy('completed'), {
    title: 'Your WorkerBee task is ready',
    body: 'Open WorkerBee to review the result and deliverables.',
  })
  assert.deepEqual(taskNotificationCopy('failed'), {
    title: 'WorkerBee needs your attention',
    body: 'Open WorkerBee to review the issue and recovery options.',
  })
  for (const status of ['completed', 'failed']) {
    const copy = taskNotificationCopy(status)
    assert.ok(!copy.title.includes('filename'))
    assert.ok(!copy.body.includes('prompt'))
  }
})
