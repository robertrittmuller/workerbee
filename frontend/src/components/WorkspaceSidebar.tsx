import { Bot, Clock3, FolderOpen, Home, LogOut, Settings, ShieldCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WorkerBeeMark } from '@/components/WorkerBeeMark'
import { platform } from '@/lib/platform'

export type WorkspaceSection = 'home' | 'assistants' | 'library' | 'activity' | 'settings'

interface WorkspaceSidebarProps {
  active: WorkspaceSection
  mobileOpen: boolean
  onClose: () => void
}

export default function WorkspaceSidebar({ active, mobileOpen, onClose }: WorkspaceSidebarProps) {
  const navigate = useNavigate()

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('auth-storage')
    navigate('/login')
  }

  const navItems = [
    { id: 'home', label: 'Home', icon: Home, path: '/dashboard' },
    { id: 'assistants', label: 'Assistants', icon: Bot, path: '/assistants' },
    { id: 'library', label: 'Files & outputs', icon: FolderOpen, path: '/library' },
    { id: 'activity', label: 'Activity', icon: Clock3, path: '/activity' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ] as const

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[276px] border-r border-[#e5e2dc] bg-[#fbfaf8] p-5 transition-transform lg:static lg:w-auto lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-2">
            <button type="button" onClick={() => go('/dashboard')} className="flex items-center gap-3">
              <WorkerBeeMark size={40} className="shadow-sm" />
              <span className="text-lg font-bold tracking-[-0.03em]">WorkerBee</span>
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 lg:hidden"
              onClick={onClose}
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="mt-9 space-y-1" aria-label="Workspace navigation">
            {navItems.map(({ id, label, icon: Icon, path }) => (
              <button
                key={id}
                type="button"
                onClick={() => go(path)}
                aria-current={active === id ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active === id
                    ? 'bg-[#eee9df] text-[#25231f]'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-[#e6dfd1] bg-[#f5efe3] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#765719]">
              <ShieldCheck size={15} />
              Local workspace
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-600">
              {platform.isDesktop
                ? 'Your library stays on this computer. Task content needed for a run is sent to the selected model service.'
                : 'WorkerBee sends only the request and files you attach to the selected model service.'}
            </p>
            <button
              type="button"
              onClick={() => go('/settings')}
              className="mt-3 text-xs font-semibold text-[#765719] underline decoration-[#c9b483] underline-offset-4"
            >
              Review data settings
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-label="Close navigation"
        />
      )}
    </>
  )
}
