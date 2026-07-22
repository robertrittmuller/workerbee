import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName }),
      })

      if (!response.ok) {
        const data = await response.json()
        const detail = data?.detail
        if (Array.isArray(detail)) {
          const firstMessage = detail.find((item) => typeof item?.msg === 'string')?.msg
          throw new Error(firstMessage || 'WorkerBee could not create your workspace.')
        }
        throw new Error(typeof detail === 'string' ? detail : 'WorkerBee could not create your workspace.')
      }

      navigate('/login', { state: { message: 'Your workspace is ready. Sign in to start your first task.' } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'WorkerBee could not create your workspace.')
    } finally {
      setIsLoading(false)
    }
  }

  const fieldClass = 'w-full rounded-xl border border-stone-300 bg-white py-3 pl-10 pr-3.5 text-sm font-normal text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'

  return (
    <AuthShell
      eyebrow="Create your workspace"
      title="Start with a real task"
      description="Your first guided workflow is ready as soon as you sign in. No agent setup required."
    >
      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label htmlFor="register-name" className="block text-sm font-semibold text-stone-700">
          Full name
          <span className="relative mt-2 block">
            <UserRound size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input id="register-name" type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" required className={fieldClass} />
          </span>
        </label>

        <label htmlFor="register-email" className="block text-sm font-semibold text-stone-700">
          Work email
          <span className="relative mt-2 block">
            <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required className={fieldClass} />
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="register-password" className="block text-sm font-semibold text-stone-700">
            Password
            <span className="relative mt-2 block">
              <LockKeyhole size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8+ characters" required className={`${fieldClass} pr-10`} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>
          <label htmlFor="register-confirm" className="block text-sm font-semibold text-stone-700">
            Confirm password
            <span className="relative mt-2 block">
              <LockKeyhole size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input id="register-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" required className={fieldClass} />
            </span>
          </label>
        </div>

        <p className="rounded-xl bg-stone-50 px-3.5 py-3 text-xs leading-5 text-stone-500">
          WorkerBee uses this account to keep your tasks, files, and review history together. You control what is attached to each run.
        </p>

        <button type="submit" disabled={isLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25231f] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-55">
          {isLoading ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowRight size={17} />}
          {isLoading ? 'Creating workspace…' : 'Create workspace'}
        </button>
      </form>

      <p className="mt-5 text-center text-xs leading-5 text-stone-500">By creating a workspace, you agree to use WorkerBee responsibly and review its output before relying on it.</p>
      <p className="mt-4 text-center text-sm text-stone-600">Already have a workspace? <Link to="/login" className="font-semibold text-stone-900 underline decoration-amber-400 decoration-2 underline-offset-4">Sign in</Link></p>
    </AuthShell>
  )
}
