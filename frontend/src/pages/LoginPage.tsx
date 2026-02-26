import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        const detail = data?.detail
        if (Array.isArray(detail)) {
          const firstMessage = detail.find((item) => typeof item?.msg === 'string')?.msg
          throw new Error(firstMessage || 'Login failed')
        }
        throw new Error(typeof detail === 'string' ? detail : 'Login failed')
      }

      const data = await response.json()
      // Store tokens in localStorage
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      
      // Redirect to dashboard
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
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
      <nav className="fixed top-0 w-full h-16 z-50 bg-bg-deep/40 flex items-center px-6 lg:px-12 justify-between backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="text-primary flex items-center justify-center border border-primary/50 p-1">
            <span className="material-symbols-outlined text-xl font-bold">grid_view</span>
          </div>
          <span className="text-xl font-mono font-extrabold tracking-tighter uppercase crt-glow">WorkerBee <span className="text-accent-tan font-normal text-xs">[AUTH-01]</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 font-mono text-[10px] uppercase tracking-[0.3em] text-accent-tan/60">
          <span className="flex items-center gap-2">// SECURE_PERIMETER_ACTIVE</span>
          <span className="flex items-center gap-2">// NODE: DC-04_CENTRAL</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="font-mono text-[10px] uppercase tracking-widest text-accent-tan hover:text-white transition-colors border border-accent-tan/20 px-3 py-1 bg-white/5">Help</button>
        </div>
      </nav>

      {/* Main Content - Centered */}
      <main className="flex-grow relative z-10 flex items-center justify-center p-6 pt-24">
        <div className="w-full max-w-lg flex flex-col items-center gap-6">
          {/* Login Form Container */}
          <div className="w-full wireframe-box bg-bg-deep/90 backdrop-blur-xl p-10 space-y-8 floating-console">
            {/* Icon Header */}
            <div className="absolute -top-12 left-0 right-0 flex justify-center">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 wireframe-box bg-bg-deep/90 flex items-center justify-center mb-2 border-primary/30">
                  <span className="material-symbols-outlined text-primary text-3xl crt-glow">shield_person</span>
                </div>
                <div className="h-12 w-[1px] bg-primary/30"></div>
              </div>
            </div>

            {/* Title Section */}
            <div className="text-center space-y-4 pt-4">
              <div className="inline-flex items-center gap-3 px-4 py-1.5 border border-interface-border bg-white/5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-tan">
                <span className="w-2 h-2 bg-primary animate-pulse inline-block"></span>
                SYSTEM_ACCESS_PORTAL // TERMINAL: PRT-99
              </div>
              <h1 className="text-3xl font-mono font-extrabold tracking-tight text-white uppercase crt-glow leading-none">
                Authorization Required
              </h1>
              <div className="flex items-center justify-center gap-4 opacity-30">
                <div className="h-[1px] w-12 bg-accent-tan"></div>
                <span className="font-mono text-[8px] uppercase tracking-[0.4em]">Identity Verification</span>
                <div className="h-[1px] w-12 bg-accent-tan"></div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <p className="text-red-400 font-mono text-xs text-center">{error}</p>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="block font-mono text-[10px] text-accent-tan uppercase tracking-[0.2em]">Email</label>
                  <span className="font-mono text-[8px] text-accent-tan/30 uppercase">ID_FIELD_ALPHA</span>
                </div>
                <div className="relative group">
                  <input 
                    className="w-full bg-bg-deep/50 border border-interface-border focus:border-primary focus:ring-1 focus:ring-primary/20 text-white font-mono text-sm px-5 py-4 outline-none transition-all placeholder:text-white/10"
                    placeholder="name@company.com"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-interface-border group-focus-within:text-primary/50 transition-colors">
                    <span className="material-symbols-outlined text-lg">person</span>
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
                      AUTHENTICATING
                    </>
                  ) : (
                    <>
                      Login <span className="material-symbols-outlined text-xl">login</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Links Section */}
            <div className="pt-6 border-t border-interface-border/50">
              <div className="flex flex-col sm:flex-row justify-between w-full gap-6 text-[10px] font-mono uppercase tracking-widest">
                <a className="text-accent-tan/70 hover:text-primary transition-colors flex items-center gap-2 group" href="#">
                  <span className="material-symbols-outlined text-[14px] group-hover:rotate-12 transition-transform">help</span> Forgot Access Key?
                </a>
                <Link to="/register" className="text-accent-tan/70 hover:text-primary transition-colors flex items-center gap-2 group">
                  <span className="material-symbols-outlined text-[14px] group-hover:scale-110 transition-transform">person_add</span> New User Registration
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
