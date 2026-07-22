import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const routeMessage = (location.state as { message?: string } | null)?.message

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        const detail = data?.detail
        if (Array.isArray(detail)) {
          const firstMessage = detail.find((item) => typeof item?.msg === 'string')?.msg
          throw new Error(firstMessage || 'Check your email and password, then try again.')
        }
        throw new Error(
          typeof detail === 'string' && !/incorrect email or password/i.test(detail)
            ? detail
            : 'Check your email and password, then try again.'
        )
      }

      const data = await response.json()
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      navigate('/dashboard')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'WorkerBee could not sign you in.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your workspace"
      description="Pick up your tasks, files, deliverables, and review history."
    >
      {routeMessage && (
        <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
          {routeMessage}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <label htmlFor="login-email" className="block text-sm font-semibold text-stone-700">
          Work email
          <span className="relative mt-2 block">
            <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
              className="w-full rounded-xl border border-stone-300 bg-white py-3 pl-10 pr-3.5 text-sm font-normal text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </span>
        </label>

        <label htmlFor="login-password" className="block text-sm font-semibold text-stone-700">
          Password
          <span className="relative mt-2 block">
            <LockKeyhole size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              className="w-full rounded-xl border border-stone-300 bg-white py-3 pl-10 pr-11 text-sm font-normal text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25231f] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isLoading ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowRight size={17} />}
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        New to WorkerBee?{' '}
        <Link to="/register" className="font-semibold text-stone-900 underline decoration-amber-400 decoration-2 underline-offset-4">
          Create a workspace
        </Link>
      </p>
    </AuthShell>
  )
}
