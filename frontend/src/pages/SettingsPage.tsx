import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BellRing,
  Check,
  ChevronRight,
  Cloud,
  Database,
  ExternalLink,
  Eye,
  FileLock2,
  KeyRound,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { WorkerBeeMark } from '@/components/WorkerBeeMark'
import { authApi } from '@/lib/api'
import {
  DEFAULT_DATA_CONTROLS,
  loadDataControls,
  saveDataControls,
  type DataControls,
} from '@/lib/dataControls'
import { platform, type ModelConnectionInput } from '@/lib/platform'
import {
  DEFAULT_TASK_NOTIFICATION_SETTINGS,
  loadTaskNotificationSettings,
  saveTaskNotificationSettings,
  type TaskNotificationSettings,
} from '@/lib/taskNotificationSettings'

const PROVIDERS = {
  openai: { label: 'OpenAI', defaultModel: 'openai/gpt-5' },
  anthropic: { label: 'Anthropic', defaultModel: 'anthropic/claude-sonnet-4-5' },
} as const

type ProviderId = 'included' | keyof typeof PROVIDERS

export default function SettingsPage() {
  const navigate = useNavigate()
  const token = localStorage.getItem('access_token')
  const [dataControls, setDataControls] = useState<DataControls>(DEFAULT_DATA_CONTROLS)
  const [provider, setProvider] = useState<ProviderId>('included')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [restartMessage, setRestartMessage] = useState<string | null>(null)
  const [taskNotificationSettings, setTaskNotificationSettings] = useState<TaskNotificationSettings>(
    DEFAULT_TASK_NOTIFICATION_SETTINGS
  )

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await authApi.me()).data,
    enabled: Boolean(token),
  })
  const runtimeQuery = useQuery({
    queryKey: ['desktop-runtime'],
    queryFn: () => platform.getRuntimeStatus(),
    staleTime: 10_000,
  })
  const modelConnectionQuery = useQuery({
    queryKey: ['model-connection'],
    queryFn: () => platform.getModelConnection(),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
    setDataControls(loadDataControls())
    setTaskNotificationSettings(loadTaskNotificationSettings())
  }, [navigate, token])

  useEffect(() => {
    const connection = modelConnectionQuery.data
    if (!connection) return
    const nextProvider = connection.provider in PROVIDERS
      ? (connection.provider as keyof typeof PROVIDERS)
      : 'included'
    setProvider(nextProvider)
    setModel(connection.model || (nextProvider === 'included' ? '' : PROVIDERS[nextProvider].defaultModel))
  }, [modelConnectionQuery.data])

  const canConfigureModel = platform.isDesktop && runtimeQuery.data?.mode === 'local'
  const modelService = runtimeQuery.data?.modelService || modelConnectionQuery.data?.providerLabel || 'Model service'
  const firstName = meQuery.data?.full_name?.trim().split(/\s+/)[0] || 'there'

  const acknowledgementLabel = useMemo(() => {
    if (!dataControls.externalProcessingAcknowledgedAt) return 'Not yet acknowledged'
    const date = new Date(dataControls.externalProcessingAcknowledgedAt)
    return Number.isFinite(date.getTime())
      ? `Acknowledged ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'Acknowledged'
  }, [dataControls.externalProcessingAcknowledgedAt])

  if (!token) return null

  const updateDataControls = (next: DataControls) => {
    setDataControls(saveDataControls(next))
  }

  const chooseProvider = (nextProvider: ProviderId) => {
    setProvider(nextProvider)
    setApiKey('')
    setSaveError(null)
    setModel(nextProvider === 'included' ? '' : PROVIDERS[nextProvider].defaultModel)
  }

  const handleModelSave = async (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    setSaveError(null)
    try {
      const input: ModelConnectionInput = { provider }
      if (provider !== 'included') {
        input.model = model.trim()
        input.apiKey = apiKey.trim()
      }
      await platform.saveModelConnection(input)
      setRestartMessage('Connection saved. WorkerBee is restarting…')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The model connection could not be saved.')
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#25231f]">
      <header className="sticky top-0 z-30 border-b border-[#e4e0d9] bg-[#f6f5f2]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-5 sm:px-8">
          <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-3">
            <WorkerBeeMark size={40} />
            <span className="font-bold tracking-[-0.03em]">WorkerBee</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-stone-600 hover:bg-white"
          >
            <ArrowLeft size={16} />
            Back to work
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-stone-500">Settings for {firstName}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Trust, data, and models</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
            Control what WorkerBee reviews before a task starts and understand where your work is stored and processed.
          </p>
        </div>

        <section className="mt-9 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
          <div className="rounded-3xl border border-[#dfdcd5] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                {platform.isDesktop ? <Laptop size={21} /> : <Database size={21} />}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Stored here</span>
            </div>
            <h2 className="mt-5 text-lg font-semibold">Your WorkerBee workspace</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {platform.isDesktop
                ? 'Your file library, task history, and generated outputs stay in this computer’s WorkerBee data folder.'
                : 'Your file library, task history, and generated outputs are stored in your organization’s WorkerBee service.'}
            </p>
          </div>

          <div className="hidden items-center text-stone-300 md:flex"><ChevronRight size={24} /></div>

          <div className="rounded-3xl border border-[#dfdcd5] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-700"><Cloud size={21} /></span>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Processes each task</span>
            </div>
            <h2 className="mt-5 text-lg font-semibold">{modelService}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              The request and content of files selected for a task are sent to this external model service to produce the result.
            </p>
            {runtimeQuery.data?.model && (
              <p className="mt-3 font-mono text-xs text-stone-500">{runtimeQuery.data.model}</p>
            )}
          </div>
        </section>

        <div className="mt-8 grid gap-7 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-3xl border border-[#dfdcd5] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f5efe3] text-[#765719]"><Eye size={21} /></span>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em]">Review before sending</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">See the request, file names, and destination before work begins.</p>
              </div>
            </div>

            <div className="mt-7 flex items-center justify-between gap-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div>
                <p className="text-sm font-semibold">Show a review for every task</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">Recommended when working with confidential material.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={dataControls.reviewBeforeSending}
                onClick={() => updateDataControls({ ...dataControls, reviewBeforeSending: !dataControls.reviewBeforeSending })}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${dataControls.reviewBeforeSending ? 'bg-[#25231f]' : 'bg-stone-300'}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${dataControls.reviewBeforeSending ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} className={dataControls.externalProcessingAcknowledgedAt ? 'text-emerald-600' : 'text-stone-400'} />
                <div>
                  <p className="text-sm font-semibold">External processing acknowledgement</p>
                  <p className="mt-0.5 text-xs text-stone-500">{acknowledgementLabel}</p>
                </div>
              </div>
              {dataControls.externalProcessingAcknowledgedAt && (
                <button
                  type="button"
                  onClick={() => updateDataControls({ ...dataControls, externalProcessingAcknowledgedAt: null })}
                  className="text-xs font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4"
                >
                  Reset
                </button>
              )}
            </div>

            {platform.isDesktop && (
              <div className="mt-4 flex items-center justify-between gap-6 rounded-2xl border border-stone-200 p-4">
                <div className="flex items-start gap-3">
                  <BellRing size={18} className="mt-0.5 shrink-0 text-[#765719]" />
                  <div>
                    <p className="text-sm font-semibold">Notify me when background work finishes</p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">Native notifications use generic wording and never include prompts, filenames, or task titles.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Desktop task notifications"
                  aria-checked={taskNotificationSettings.desktopNotifications}
                  onClick={() => setTaskNotificationSettings(saveTaskNotificationSettings({
                    desktopNotifications: !taskNotificationSettings.desktopNotifications,
                  }))}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${taskNotificationSettings.desktopNotifications ? 'bg-[#25231f]' : 'bg-stone-300'}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${taskNotificationSettings.desktopNotifications ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            )}

            <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <FileLock2 size={19} className="mt-0.5 shrink-0" />
              WorkerBee includes only files you explicitly attach to a task. Removing a file before you start keeps it out of that request.
            </div>
          </section>

          <section className="rounded-3xl border border-[#dfdcd5] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700"><KeyRound size={21} /></span>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em]">Model connection</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {canConfigureModel ? 'Use included access or your own provider account.' : 'Managed by your WorkerBee service.'}
                </p>
              </div>
            </div>

            {modelConnectionQuery.isLoading ? (
              <div className="mt-8 flex items-center gap-2 text-sm text-stone-500"><LoaderCircle size={16} className="animate-spin" /> Loading connection…</div>
            ) : canConfigureModel ? (
              <form onSubmit={handleModelSave} className="mt-7 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {(['included', 'openai', 'anthropic'] as ProviderId[]).map((providerId) => (
                    <button
                      key={providerId}
                      type="button"
                      onClick={() => chooseProvider(providerId)}
                      className={`rounded-xl border px-3 py-3 text-xs font-semibold transition ${provider === providerId ? 'border-[#25231f] bg-[#25231f] text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'}`}
                    >
                      {providerId === 'included' ? 'Included' : PROVIDERS[providerId].label}
                    </button>
                  ))}
                </div>

                {provider === 'included' ? (
                  <div className="rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">
                    WorkerBee selects an available managed model. Usage terms and availability are determined by that service.
                  </div>
                ) : (
                  <>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Model ID</span>
                      <input
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 font-mono text-sm text-stone-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">API key</span>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={modelConnectionQuery.data?.provider === provider && modelConnectionQuery.data.keyLast4 ? `Keep saved key ending ${modelConnectionQuery.data.keyLast4}` : 'Paste a provider API key'}
                        autoComplete="off"
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm text-stone-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                      />
                    </label>
                    <div className="flex items-center gap-2 text-xs text-emerald-700">
                      <LockKeyhole size={14} />
                      Encrypted using this computer’s secure credential storage
                    </div>
                  </>
                )}

                {saveError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">{saveError}</p>}
                {restartMessage && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">{restartMessage}</p>}

                <button
                  type="submit"
                  disabled={isSaving || (provider !== 'included' && !modelConnectionQuery.data?.secureStorageAvailable)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25231f] px-4 py-3 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {provider === 'included' ? 'Use included access and restart' : 'Save securely and restart'}
                </button>
              </form>
            ) : (
              <div className="mt-7 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Check size={16} className="text-emerald-600" /> {modelService}</div>
                <p className="mt-2 text-xs leading-5 text-stone-500">Contact your administrator to change providers, models, retention, or billing settings.</p>
              </div>
            )}

            <a
              href="https://opencode.ai/docs/providers/"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900"
            >
              Provider setup details <ExternalLink size={13} />
            </a>
          </section>
        </div>

        <section className="mt-7 rounded-3xl border border-[#dfdcd5] bg-[#25231f] p-6 text-white shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-amber-300"><Settings2 size={21} /></span>
              <div>
                <h2 className="text-lg font-semibold">A simple rule for sensitive work</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-300">Attach only what the task needs. Use the review screen to verify filenames and destination, and remove confidential material you do not want processed by the model service.</p>
              </div>
            </div>
            <button type="button" onClick={() => navigate('/dashboard')} className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-100">Start a task</button>
          </div>
        </section>
      </main>
    </div>
  )
}
