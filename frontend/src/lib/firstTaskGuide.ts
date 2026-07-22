import type { WorkPackId } from '@/lib/workPacks'

export type FirstTaskOutcomeId = 'understand' | 'data' | 'move-work' | 'decide'

export type FirstTaskOutcome = {
  id: FirstTaskOutcomeId
  label: string
  title: string
  description: string
  reassurance: string
  workPackIds: WorkPackId[]
}

export const FIRST_TASK_OUTCOMES: FirstTaskOutcome[] = [
  {
    id: 'understand',
    label: 'Understand information',
    title: 'Turn source material into a clear brief',
    description: 'Make long documents, competing sources, or meeting context easier to act on.',
    reassurance: 'Best when the information exists but the answer is buried.',
    workPackIds: ['document-summarization', 'research-synthesis', 'meeting-preparation'],
  },
  {
    id: 'data',
    label: 'Work with data',
    title: 'Clean, structure, or explain business data',
    description: 'Start with a spreadsheet or repeated records and leave with something reviewable.',
    reassurance: 'WorkerBee preserves row-level issues and calls out what it cannot safely infer.',
    workPackIds: ['spreadsheet-cleanup', 'html5-dashboard-generator', 'recurring-reporting'],
  },
  {
    id: 'move-work',
    label: 'Move work forward',
    title: 'Turn project and meeting evidence into accountable follow-through',
    description: 'Clarify progress, decisions, owners, risks, and the next conversation.',
    reassurance: 'Unknown owners and dates stay visible instead of being guessed.',
    workPackIds: ['project-status-reporting', 'meeting-follow-up', 'meeting-preparation'],
  },
  {
    id: 'decide',
    label: 'Decide or persuade',
    title: 'Build a decision-ready recommendation or draft',
    description: 'Shape evidence into a memo, proposal, or presentation people can review.',
    reassurance: 'Claims and commitments remain drafts until a person approves them.',
    workPackIds: ['decision-memo', 'proposal-creation', 'presentation-creation'],
  },
]

export function getFirstTaskOutcome(id: string | null | undefined): FirstTaskOutcome | null {
  return FIRST_TASK_OUTCOMES.find((outcome) => outcome.id === id) ?? null
}

export function uniqueRecommendedWorkPackIds(): WorkPackId[] {
  return Array.from(new Set(FIRST_TASK_OUTCOMES.flatMap((outcome) => outcome.workPackIds)))
}
