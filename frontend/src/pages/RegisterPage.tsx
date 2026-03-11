import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicHeader } from '@/components/PublicHeader'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Registration failed')
      }

      // Registration successful, redirect to login
      navigate('/login', { state: { message: 'Registration successful! Please sign in.' } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col font-sans text-white">
      {/* Immersive Background */}
      <div className="immersive-bg">
        <div className="data-grid-3d"></div>
        <div className="wireframe-landscape"></div>
        <div className="data-pathways"></div>
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-1/4 left-0 w-full h-[1px] bg-primary/30"></div>
          <div className="absolute top-3/4 left-0 w-full h-[1px] bg-primary/30"></div>
          <div className="absolute left-1/4 top-0 h-full w-[1px] bg-primary/30"></div>
          <div className="absolute left-3/4 top-0 h-full w-[1px] bg-primary/30"></div>
        </div>
      </div>

      {/* Navigation */}
      <PublicHeader code="[AUTH-02]" />

      {/* Main Content - Centered */}
      <main className="flex-grow relative z-10 flex items-center justify-center p-6 pt-24">
        <div className="w-full max-w-lg flex flex-col items-center gap-6">
          {/* Register Form Container */}
          <div className="w-full wireframe-box bg-bg-deep/90 backdrop-blur-xl p-10 space-y-8 floating-console">
            {/* Icon Header */}
            <div className="absolute -top-12 left-0 right-0 flex justify-center">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 wireframe-box bg-bg-deep/90 flex items-center justify-center mb-2 border-primary/30">
                  <span className="material-symbols-outlined text-primary text-3xl crt-glow">person_add</span>
                </div>
                <div className="h-12 w-[1px] bg-primary/30"></div>
              </div>
            </div>

            {/* Title Section */}
            <div className="text-center space-y-4 pt-4">
              <div className="inline-flex items-center gap-3 px-4 py-1.5 border border-interface-border bg-white/5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-tan">
                <span className="w-2 h-2 bg-primary animate-pulse inline-block"></span>
                NEW_USER_REGISTRATION // TERMINAL: PRT-99
              </div>
              <h1 className="text-3xl font-mono font-extrabold tracking-tight text-white uppercase crt-glow leading-none">
                Join the Hive
              </h1>
              <div className="flex items-center justify-center gap-4 opacity-30">
                <div className="h-[1px] w-12 bg-accent-tan"></div>
                <span className="font-mono text-[8px] uppercase tracking-[0.4em]">Identity Creation</span>
                <div className="h-[1px] w-12 bg-accent-tan"></div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <p className="text-red-400 font-mono text-xs text-center">{error}</p>
              </div>
            )}

            {/* Register Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full Name Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="block font-mono text-[10px] text-accent-tan uppercase tracking-[0.2em]">Full Name</label>
                  <span className="font-mono text-[8px] text-accent-tan/30 uppercase">ID_FIELD_NAME</span>
                </div>
                <div className="relative group">
                  <input 
                    className="w-full bg-bg-deep/50 border border-interface-border focus:border-primary focus:ring-1 focus:ring-primary/20 text-white font-mono text-sm px-5 py-4 outline-none transition-all placeholder:text-white/10"
                    placeholder="USER_FULL_NAME"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-interface-border group-focus-within:text-primary/50 transition-colors">
                    <span className="material-symbols-outlined text-lg">badge</span>
                  </div>
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="block font-mono text-[10px] text-accent-tan uppercase tracking-[0.2em]">Email</label>
                  <span className="font-mono text-[8px] text-accent-tan/30 uppercase">ID_FIELD_EMAIL</span>
                </div>
                <div className="relative group">
                  <input 
                    className="w-full bg-bg-deep/50 border border-interface-border focus:border-primary focus:ring-1 focus:ring-primary/20 text-white font-mono text-sm px-5 py-4 outline-none transition-all placeholder:text-white/10"
                    placeholder="USER@DOMAIN.COM"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-interface-border group-focus-within:text-primary/50 transition-colors">
                    <span className="material-symbols-outlined text-lg">email</span>
                  </div>
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="block font-mono text-[10px] text-accent-tan uppercase tracking-[0.2em]">Password</label>
                  <span className="font-mono text-[8px] text-accent-tan/30 uppercase">KEY_FIELD_SECURE</span>
                </div>
                <div className="relative group">
                  <input 
                    className="w-full bg-bg-deep/50 border border-interface-border focus:border-primary focus:ring-1 focus:ring-primary/20 text-white font-mono text-sm px-5 py-4 outline-none transition-all placeholder:text-white/10"
                    placeholder="••••••••••••"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-interface-border group-focus-within:text-primary/50 transition-colors">
                    <span className="material-symbols-outlined text-lg">key</span>
                  </div>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="block font-mono text-[10px] text-accent-tan uppercase tracking-[0.2em]">Confirm Password</label>
                  <span className="font-mono text-[8px] text-accent-tan/30 uppercase">KEY_FIELD_VERIFY</span>
                </div>
                <div className="relative group">
                  <input 
                    className="w-full bg-bg-deep/50 border border-interface-border focus:border-primary focus:ring-1 focus:ring-primary/20 text-white font-mono text-sm px-5 py-4 outline-none transition-all placeholder:text-white/10"
                    placeholder="••••••••••••"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-interface-border group-focus-within:text-primary/50 transition-colors">
                    <span className="material-symbols-outlined text-lg">lock</span>
                  </div>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start gap-3 pt-2">
                <input
                  type="checkbox"
                  id="terms"
                  className="mt-1 w-4 h-4 rounded border-interface-border bg-bg-deep/50 text-primary focus:ring-primary/20 focus:ring-offset-0 cursor-pointer"
                  required
                />
                <label htmlFor="terms" className="text-xs text-accent-tan/70 font-mono uppercase tracking-wide">
                  I agree to the{' '}
                  <a href="#" className="text-primary hover:underline">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="#" className="text-primary hover:underline">
                    Privacy Protocol
                  </a>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button 
                  className="w-full bg-primary text-bg-deep px-8 py-4 font-mono font-extrabold text-sm uppercase crt-button-glow flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="material-symbols-outlined text-xl animate-spin">sync</span>
                      PROCESSING
                    </>
                  ) : (
                    <>
                      Create Account <span className="material-symbols-outlined text-xl">arrow_forward</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Links Section */}
            <div className="pt-6 border-t border-interface-border/50">
              <div className="flex justify-center gap-6 text-[10px] font-mono uppercase tracking-widest">
                <Link to="/login" className="text-accent-tan/70 hover:text-primary transition-colors flex items-center gap-2 group">
                  <span className="material-symbols-outlined text-[14px] group-hover:-translate-x-1 transition-transform">login</span> Existing User Login
                </Link>
              </div>
            </div>
          </div>

          {/* Footer Status */}
          <div className="w-full flex justify-between items-center font-mono text-[9px] text-accent-tan uppercase tracking-[0.3em] opacity-40">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[10px]">sensors</span>
              Secure_Connection: Established
            </div>
            <div className="flex items-center gap-2">
              Enc_Status: AES_256_ACTIVE
              <span className="material-symbols-outlined text-[10px]">verified_user</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 px-6 lg:px-12 border-t border-white/5 font-mono text-xs bg-bg-deep/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-accent-tan/40 text-[9px] uppercase tracking-[0.2em]">
          <div className="flex items-center gap-4">
            <p>© 2024 WorkerBee Technologies Inc. [SYSTEM_INTERFACE_STABLE]</p>
            <span className="h-3 w-[1px] bg-white/10 hidden md:block"></span>
            <p className="hidden md:block">LOC: SUB-LEVEL_09</p>
          </div>
          <div className="flex gap-8">
            <a className="hover:text-white transition-colors" href="#">Terms of Service</a>
            <a className="hover:text-white transition-colors" href="#">Privacy Protocol</a>
            <a className="hover:text-white transition-colors" href="#">Security Audit</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
