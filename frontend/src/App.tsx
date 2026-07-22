import { useEffect, useState, type ReactNode } from 'react'
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Dashboard from './pages/Dashboard'
import AgentRunPage from './pages/AgentRunPage'
import WorkspacePage from './pages/WorkspacePage'
import WorkPage from './pages/WorkPage'
import SettingsPage from './pages/SettingsPage'
import LibraryPage from './pages/LibraryPage'
import ActivityPage from './pages/ActivityPage'
import AssistantsPage from './pages/AssistantsPage'
import TaskCompletionCenter from './components/TaskCompletionCenter'
import { platform } from './lib/platform'
import { authApi, storeTokens } from './lib/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
})

function DesktopSessionGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'starting' | 'ready' | 'error'>(
    platform.isDesktop && platform.desktopSessionSecret ? 'starting' : 'ready'
  )

  useEffect(() => {
    if (!platform.isDesktop || !platform.desktopSessionSecret) {
      setState('ready')
      return
    }

    let cancelled = false
    setState('starting')
    authApi
      .desktopSession(platform.desktopSessionSecret)
      .then(({ data }) => {
        if (cancelled) return
        storeTokens(data.access_token, data.refresh_token)
        setState('ready')
        if (['/', '/login', '/register'].includes(location.pathname)) {
          navigate('/dashboard', { replace: true })
        }
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [attempt, location.pathname, navigate])

  if (state === 'starting') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f5f2] px-6 text-[#1f2933]">
        <section className="w-full max-w-md rounded-3xl border border-[#ddd9d0] bg-white p-10 text-center shadow-[0_18px_55px_rgba(52,48,42,0.10)]">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f7bd32] text-2xl shadow-sm">
            🐝
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Opening your workspace</h1>
          <p className="mt-3 text-sm leading-6 text-[#68727d]">
            WorkerBee is preparing your private local files and recent work.
          </p>
          <div className="mx-auto mt-7 h-1.5 w-36 overflow-hidden rounded-full bg-[#ece9e2]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#d89b12]" />
          </div>
        </section>
      </main>
    )
  }

  if (state === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f5f2] px-6 text-[#1f2933]">
        <section className="w-full max-w-md rounded-3xl border border-[#ddd9d0] bg-white p-10 text-center shadow-[0_18px_55px_rgba(52,48,42,0.10)]">
          <h1 className="text-2xl font-semibold tracking-tight">Workspace needs another moment</h1>
          <p className="mt-3 text-sm leading-6 text-[#68727d]">
            The private local service is running, but the workspace session could not be opened.
          </p>
          <button
            className="mt-7 rounded-xl bg-[#263238] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#11191d]"
            onClick={() => setAttempt((value) => value + 1)}
            type="button"
          >
            Try again
          </button>
        </section>
      </main>
    )
  }

  return children
}

function App() {
  const Router = platform.isDesktop ? HashRouter : BrowserRouter

  return (
    <QueryClientProvider client={queryClient}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DesktopSessionGate>
          <TaskCompletionCenter />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={<WorkspacePage />} />
            <Route path="/work/:executionId" element={<WorkPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/assistants" element={<AssistantsPage />} />
            <Route path="/manage" element={<Dashboard />} />
            <Route path="/agents/:agentId/run" element={<AgentRunPage />} />
            <Route path="/workflows/new" element={<Navigate to="/manage" replace />} />
            <Route path="/workflows/:id" element={<Navigate to="/manage" replace />} />
            <Route path="/workflow/:id" element={<Navigate to="/manage" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DesktopSessionGate>
      </Router>
    </QueryClientProvider>
  )
}

export default App
