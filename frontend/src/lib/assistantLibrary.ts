import type { Agent } from '@/lib/api'

export type AssistantFilter = 'all' | 'active' | 'paused' | 'knowledge'

export interface AssistantLibraryItem {
  agent: Agent
  templateName?: string | null
}

export function assistantResourceIds(agent: Agent): string[] {
  const resourceIds = agent.config?.resource_ids
  if (!Array.isArray(resourceIds)) return []
  return resourceIds.filter((value): value is string => typeof value === 'string' && Boolean(value))
}

export function assistantTemplateName(agent: Agent): string | null {
  const template = agent.config?.template
  if (!template || typeof template !== 'object') return null
  const name = (template as { name?: unknown }).name
  if (typeof name !== 'string' || !name.trim()) return null
  const normalized = name.trim()
  if (normalized === 'Blank Agent' || normalized === 'Blank Template') return null
  return normalized
}

export function filterAssistantItems(
  items: AssistantLibraryItem[],
  filter: AssistantFilter,
  query: string
): AssistantLibraryItem[] {
  const tokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return items.filter(({ agent, templateName }) => {
    const resourceCount = assistantResourceIds(agent).length
    if (filter === 'active' && !agent.is_active) return false
    if (filter === 'paused' && agent.is_active) return false
    if (filter === 'knowledge' && resourceCount === 0) return false
    if (!tokens.length) return true
    const haystack = [agent.name, agent.description, templateName]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
}

export function assistantCounts(items: AssistantLibraryItem[]): Record<AssistantFilter, number> {
  return {
    all: items.length,
    active: items.filter(({ agent }) => agent.is_active).length,
    paused: items.filter(({ agent }) => !agent.is_active).length,
    knowledge: items.filter(({ agent }) => assistantResourceIds(agent).length > 0).length,
  }
}

export function sortAssistantItems(items: AssistantLibraryItem[]): AssistantLibraryItem[] {
  return [...items].sort((left, right) => {
    if (left.agent.is_active !== right.agent.is_active) return left.agent.is_active ? -1 : 1
    return Date.parse(right.agent.updated_at) - Date.parse(left.agent.updated_at)
  })
}
