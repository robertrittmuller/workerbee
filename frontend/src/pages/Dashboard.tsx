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
    <div className="min-h-screen bg-ceramic">
      {/* Top Navigation */}
      <nav className="h-16 bg-plastic/80 backdrop-blur-sm border-b border-[#D6D1CC] flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-espresso rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-ceramic text-xl">hive</span>
          </div>
          <span className="font-display font-bold text-lg text-espresso">WorkerBee</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-ceramic rounded-full border border-[#D6D1CC]">
            <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
            <span className="text-xs font-mono font-medium text-tungsten uppercase tracking-wider">System Ready</span>
          </div>
          <Button variant="icon">
            <span className="material-symbols-outlined">help</span>
          </Button>
          <div className="w-8 h-8 rounded-full bg-amber flex items-center justify-center text-espresso-dark font-display font-bold text-sm">
            U
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display font-bold text-2xl text-espresso mb-1">My Workflows</h1>
              <p className="text-tungsten text-sm">Create and manage your automation workflows</p>
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
              className="bg-plastic rounded-xl border-2 border-dashed border-[#D6D1CC] p-6 flex flex-col items-center justify-center min-h-[200px] hover:border-amber transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-ceramic flex items-center justify-center mb-4 group-hover:bg-amber/20 transition-colors">
                <span className="material-symbols-outlined text-tungsten group-hover:text-amber transition-colors">add</span>
              </div>
              <span className="font-display font-bold text-sm text-tungsten group-hover:text-espresso transition-colors">
                Create New Workflow
              </span>
            </Link>

            {/* Workflow Cards */}
            {workflows.map((workflow) => (
              <Link
                key={workflow.id}
                to={`/workflows/${workflow.id}`}
                className="bg-plastic rounded-xl border border-[#D6D1CC] p-6 hover:border-amber hover:shadow-lift transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-ceramic flex items-center justify-center">
                    <span className="material-symbols-outlined text-espresso">account_tree</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${workflow.status === 'active' ? 'bg-signal-green' : 'bg-tungsten/30'}`} />
                    <span className="text-xs font-mono text-tungsten uppercase">{workflow.status}</span>
                  </div>
                </div>
                <h3 className="font-display font-bold text-base text-espresso mb-2 group-hover:text-amber transition-colors">
                  {workflow.name}
                </h3>
                <p className="text-xs text-tungsten">
                  Last run: {workflow.lastRun}
                </p>
              </Link>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="mt-12">
            <h2 className="font-display font-bold text-lg text-espresso mb-4">Recent Activity</h2>
            <div className="bg-plastic rounded-xl border border-[#D6D1CC] overflow-hidden">
              <div className="divide-y divide-[#D6D1CC]">
                <div className="p-4 flex items-center gap-4 hover:bg-ceramic/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-signal-green/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-signal-green text-lg">check</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-espresso">Document Summary Workflow completed successfully</p>
                    <p className="text-xs text-tungsten">2 hours ago • Generated 3 outputs</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4 hover:bg-ceramic/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber text-lg">play_arrow</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-espresso">Report Generator started</p>
                    <p className="text-xs text-tungsten">1 day ago • Processing 5 inputs</p>
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4 hover:bg-ceramic/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-signal-red/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-signal-red text-lg">error</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-espresso">Data Extraction Pipeline failed</p>
                    <p className="text-xs text-tungsten">2 days ago • API timeout error</p>
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
