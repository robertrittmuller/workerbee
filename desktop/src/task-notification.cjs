const EXECUTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/
const COPY = {
  completed: {
    title: 'Your WorkerBee task is ready',
    body: 'Open WorkerBee to review the result and deliverables.',
  },
  failed: {
    title: 'WorkerBee needs your attention',
    body: 'Open WorkerBee to review the issue and recovery options.',
  },
}

function validateTaskNotification(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Task notification details are required.')
  }
  if (typeof input.executionId !== 'string' || !EXECUTION_ID_PATTERN.test(input.executionId)) {
    throw new Error('A valid execution ID is required.')
  }
  if (typeof input.status !== 'string' || !(input.status in COPY)) {
    throw new Error('Only completed or failed tasks can notify.')
  }
  return { executionId: input.executionId, status: input.status }
}

function taskNotificationCopy(status) {
  if (typeof status !== 'string' || !(status in COPY)) throw new Error('Unsupported task notification status.')
  return COPY[status]
}

module.exports = { taskNotificationCopy, validateTaskNotification }
