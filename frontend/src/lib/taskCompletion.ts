export type WatchedExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type WatchedExecution = {
  id: string
  status: WatchedExecutionStatus
  started_at?: string | null
}

export type TaskCompletionTransition = {
  executionId: string
  status: 'completed' | 'failed'
}

const ACTIVE_STATUSES = new Set<WatchedExecutionStatus>(['pending', 'running'])
const NOTIFIABLE_STATUSES = new Set<WatchedExecutionStatus>(['completed', 'failed'])

export function executionStatusSnapshot(executions: WatchedExecution[]): Record<string, WatchedExecutionStatus> {
  return Object.fromEntries(executions.map((execution) => [execution.id, execution.status]))
}

export function taskCompletionTransitions(
  previous: Record<string, WatchedExecutionStatus>,
  current: WatchedExecution[]
): TaskCompletionTransition[] {
  return current.flatMap((execution) => {
    const previousStatus = previous[execution.id]
    if (!previousStatus || !ACTIVE_STATUSES.has(previousStatus) || !NOTIFIABLE_STATUSES.has(execution.status)) {
      return []
    }
    return [{ executionId: execution.id, status: execution.status as 'completed' | 'failed' }]
  })
}

export function newlyFinishedTasks(
  previous: Record<string, WatchedExecutionStatus>,
  current: WatchedExecution[],
  notBefore: number
): TaskCompletionTransition[] {
  return current.flatMap((execution) => {
    if (execution.id in previous || !NOTIFIABLE_STATUSES.has(execution.status)) return []
    const startedAt = execution.started_at ? Date.parse(execution.started_at) : Number.NaN
    if (!Number.isFinite(startedAt) || startedAt < notBefore) return []
    return [{ executionId: execution.id, status: execution.status as 'completed' | 'failed' }]
  })
}
