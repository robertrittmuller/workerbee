import type { TaskThread } from '@/lib/api'

export type ActivityFilter = 'all' | 'active' | 'ready' | 'attention' | 'stopped'

export interface ActivityItem {
  thread: TaskThread
  agentName?: string | null
  workflowName?: string | null
}

export function activityFilterForStatus(status: TaskThread['status']): ActivityFilter {
  if (status === 'pending' || status === 'running') return 'active'
  if (status === 'completed') return 'ready'
  if (status === 'failed') return 'attention'
  return 'stopped'
}

export function filterActivityItems(
  items: ActivityItem[],
  filter: ActivityFilter,
  query: string
): ActivityItem[] {
  const tokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return items.filter((item) => {
    if (filter !== 'all' && activityFilterForStatus(item.thread.status) !== filter) return false
    if (!tokens.length) return true
    const haystack = [
      item.thread.title,
      item.thread.original_prompt,
      item.agentName,
      item.workflowName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
}

export function activityCounts(items: ActivityItem[]): Record<ActivityFilter, number> {
  const counts: Record<ActivityFilter, number> = {
    all: items.length,
    active: 0,
    ready: 0,
    attention: 0,
    stopped: 0,
  }
  for (const item of items) counts[activityFilterForStatus(item.thread.status)] += 1
  return counts
}

export function activityDateGroup(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return 'Earlier'
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDifference = Math.round((startToday.getTime() - startDate.getTime()) / 86_400_000)
  if (dayDifference <= 0) return 'Today'
  if (dayDifference === 1) return 'Yesterday'
  if (dayDifference < 7) return 'This week'
  return 'Earlier'
}

export function relativeActivityTime(timestamp: string, now = Date.now()): string {
  const milliseconds = now - Date.parse(timestamp)
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Just now'
  const minutes = Math.max(1, Math.floor(milliseconds / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
