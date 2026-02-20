import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export default function Dashboard() {
  // Mock data for workflows
  const workflows = [
    { id: '1', name: 'Document Summary Workflow', status: 'active', lastRun: '2 hours ago' },
    { id: '2', name: 'Data Extraction Pipeline', status: 'draft', lastRun: 'Never' },
    { id: '3', name: 'Report Generator', status: 'active', lastRun: '1 day ago' },
  ]

  return (
    <div className="min-h-screen bg-bg-dark">
      {/* Top Navigation */}
      <nav className="fixed top-0 w-full h-16 z-50 bg-bg-sidebar border-b border-interface-border flex items-center px-6 lg:px-12 justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="text-primary flex items-center justify-center border-2 border-primary p-1">
            <span className="material-symbols-outlined text-2xl font-bold">grid_view</span>
          </div>
          <span className="text-xl font-mono font-extrabold tracking-tighter uppercase crt-glow">WorkerBee <span className="text-accent-tan font-normal text-xs">[DH-01]</span></span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-interface-border">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-mono font-medium text-accent-tan uppercase tracking-wider">System Ready</span>
          </div>
          <Button variant="icon">
            <span className="material-symbols-outlined">help</span>
          </Button>
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-bg-deep font-mono font-bold text-sm">
            U
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 px-6 pb-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-mono font-bold text-2xl text-white mb-1">MY_WORKFLOWS</h1>
              <p className="text-accent-tan text-sm font-mono text-xs">// Create and manage your automation workflows</p>
            </div>
            <Link to="/workflows/new">
              <Button variant="primary">
                <span className="material-symbols-outlined">add</span>
                New Workflow
              </Button>
            </Link>
          </div>

          {/* Workflow Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* New Workflow Card */}
            <Link 
              to="/workflows/new"
              className="wireframe-box bg-bg-sidebar p-6 flex flex-col items-center justify-center min-h-[200px] hover:bg-bg-sidebar/80 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-interface-border flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <span className="material-symbols-outlined text-accent-tan group-hover:text-primary transition-colors">add</span>
              </div>
              <span className="font-mono font-bold text-sm text-accent-tan group-hover:text-white transition-colors">
                Create New Workflow
              </span>
            </Link>

            {/* Workflow Cards */}
            {workflows.map((workflow) => (
              <Link
                key={workflow.id}
                to={`/workflows/${workflow.id}`}
                className="wireframe-box bg-bg-sidebar p-6 hover:bg-bg-sidebar/80 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded bg-interface-border flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">account_tree</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${workflow.status === 'active' ? 'bg-primary' : 'bg-accent-tan/30'}`} />
                    <span className="text-xs font-mono text-accent-tan uppercase">{workflow.status}</span>
                  </div>
                </div>
                <h3 className="font-mono font-bold text-base text-white mb-2 group-hover:text-primary transition-colors">
                  {workflow.name}
                </h3>
                <p className="text-xs text-accent-tan font-mono">
                  Last run: {workflow.lastRun}
                </p>
              </Link>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="mt-12">
            <h2 className="font-mono font-bold text-lg text-white mb-4">// RECENT_ACTIVITY</h2>
            <div className="wireframe-box bg-bg-sidebar overflow-hidden">
              <div className="divide-y divide-interface-border">
                <div className="p-4 flex items-center gap-4 hover:bg-interface-border/30 transition-colors">
                  <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-lg">check</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Document Summary Workflow completed successfully</p>
                    <p className="text-xs text-accent-tan font-mono">2 hours ago // Generated 3 outputs</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4 hover:bg-interface-border/30 transition-colors">
                  <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-lg">play_arrow</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Report Generator started</p>
                    <p className="text-xs text-accent-tan font-mono">1 day ago // Processing 5 inputs</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4 hover:bg-interface-border/30 transition-colors">
                  <div className="w-8 h-8 rounded bg-signal-red/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-signal-red text-lg">error</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Data Extraction Pipeline failed</p>
                    <p className="text-xs text-accent-tan font-mono">2 days ago // API timeout error</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
