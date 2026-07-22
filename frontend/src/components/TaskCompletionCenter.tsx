import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, X } from 'lucide-react'
import { executionsApi, type Execution } from '@/lib/api'
import { platform } from '@/lib/platform'
import {
  executionStatusSnapshot,
  newlyFinishedTasks,
  taskCompletionTransitions,
  type WatchedExecutionStatus,
} from '@/lib/taskCompletion'
import {
  loadTaskNotificationSettings,
  TASK_NOTIFICATION_SETTINGS_EVENT,
  type TaskNotificationSettings,
} from '@/lib/taskNotificationSettings'

type CompletionNotice = {
  executionId: string
  status: 'completed' | 'failed'
}

const PUBLIC_ROUTES = new Set(['/', '/login', '/register'])

export default function TaskCompletionCenter() {
  const navigate = useNavigate()
  const location = useLocation()
  const previousStatuses = useRef<Record<string, WatchedExecutionStatus> | null>(null)
  const watchStartedAt = useRef(Date.now())
  const [notices, setNotices] = useState<CompletionNotice[]>([])
  const [settings, setSettings] = useState<TaskNotificationSettings>(() => loadTaskNotificationSettings())
  const token = localStorage.getItem('access_token')
  const enabled = Boolean(token) && !PUBLIC_ROUTES.has(location.pathname)

  const executionsQuery = useQuery({
    queryKey: ['global-completion-watcher'],
    queryFn: async () => (await executionsApi.list({ limit: 100 })).data,
    enabled,
    staleTime: 0,
    refetchInterval: (query) => {
      const executions = query.state.data as Execution[] | undefined
      return executions?.some((execution) => execution.status === 'pending' || execution.status === 'running')
        ? 2500
        : 12_000
    },
  })

  useEffect(() => {
    const refresh = () => setSettings(loadTaskNotificationSettings())
    window.addEventListener(TASK_NOTIFICATION_SETTINGS_EVENT, refresh)
    return () => window.removeEventListener(TASK_NOTIFICATION_SETTINGS_EVENT, refresh)
  }, [])

  useEffect(() => platform.onOpenTaskNotification((executionId) => {
    navigate(`/work/${executionId}`)
    setNotices((current) => current.filter((notice) => notice.executionId !== executionId))
  }), [navigate])

  useEffect(() => {
    if (!enabled) {
      previousStatuses.current = null
      watchStartedAt.current = Date.now()
      setNotices([])
    }
  }, [enabled])

  useEffect(() => {
    const executions = executionsQuery.data
    if (!enabled || !executions) return
    const nextSnapshot = executionStatusSnapshot(executions)
    if (!previousStatuses.current) {
      previousStatuses.current = nextSnapshot
      return
    }

    const transitions = [
      ...taskCompletionTransitions(previousStatuses.current, executions),
      ...newlyFinishedTasks(previousStatuses.current, executions, watchStartedAt.current),
    ].filter((transition, index, all) => (
      all.findIndex((candidate) => candidate.executionId === transition.executionId) === index
    ))
    previousStatuses.current = nextSnapshot
    if (!transitions.length) return

    setNotices((current) => {
      const seen = new Set(current.map((notice) => notice.executionId))
      const added = transitions.filter((notice) => !seen.has(notice.executionId))
      return [...current, ...added].slice(-3)
    })

    if (platform.isDesktop && settings.desktopNotifications && !document.hasFocus()) {
      for (const transition of transitions) void platform.showTaskNotification(transition)
    }
  }, [enabled, executionsQuery.data, settings.desktopNotifications])

  if (!enabled || !notices.length) return null

  return (
    <aside className="fixed bottom-5 right-5 z-[120] flex w-[min(390px,calc(100vw-2.5rem))] flex-col gap-3" aria-label="Task notifications" aria-live="polite">
      {notices.map((notice) => {
        const completed = notice.status === 'completed'
        return (
          <div key={notice.executionId} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_18px_55px_rgba(37,35,31,0.18)]">
            <div className="flex items-start gap-3 p-4">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${completed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {completed ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-900">{completed ? 'Your task is ready' : 'This task needs attention'}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">{completed ? 'Review the result, quality checks, and deliverables.' : 'Open the task to see what happened and the available recovery step.'}</p>
              </div>
              <button type="button" onClick={() => setNotices((current) => current.filter((item) => item.executionId !== notice.executionId))} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Dismiss task notification"><X size={15} /></button>
            </div>
            <button
              type="button"
              onClick={() => {
                navigate(`/work/${notice.executionId}`)
                setNotices((current) => current.filter((item) => item.executionId !== notice.executionId))
              }}
              className="flex w-full items-center justify-between border-t border-stone-100 px-4 py-3 text-xs font-semibold text-[#765719] transition hover:bg-stone-50"
            >
              {completed ? 'Review result' : 'Open recovery'} <ArrowRight size={14} />
            </button>
          </div>
        )
      })}
    </aside>
  )
}
