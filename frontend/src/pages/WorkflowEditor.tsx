import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, Connection, Edge, Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/Button'

// Initial nodes for demo
const initialNodes: Node[] = [
  {
    id: '1',
    type: 'input',
    position: { x: 100, y: 100 },
    data: { label: 'Input Node' },
  },
  {
    id: '2',
    type: 'default',
    position: { x: 400, y: 100 },
    data: { label: 'Agent Node' },
  },
  {
    id: '3',
    type: 'output',
    position: { x: 700, y: 100 },
    data: { label: 'Output Node' },
  },
]

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]

export default function WorkflowEditor() {
  const { id } = useParams()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [isRunning, setIsRunning] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [footerOpen, setFooterOpen] = useState(true)

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const handleRun = () => {
    setIsRunning(!isRunning)
    // TODO: Implement workflow execution
  }

  return (
    <div className="h-screen flex flex-col bg-bg-dark">
      {/* Top Navigation */}
      <nav className="h-16 bg-bg-darker border-b border-interface-border flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="text-primary flex items-center justify-center border-2 border-primary p-1">
              <span className="material-symbols-outlined text-xl font-bold">grid_view</span>
            </div>
          </Link>
          <div className="h-6 w-px bg-interface-border" />
          <div>
            <h1 className="font-mono font-bold text-sm text-white">
              {id === 'new' ? 'NEW_WORKFLOW' : `WORKFLOW_${id}`}
            </h1>
            <p className="text-xs text-accent-tan font-mono">Last saved: 2 minutes ago</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded border border-interface-border hover:border-primary transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-accent-tan">view_sidebar</span>
            <span className="text-xs font-mono text-accent-tan">{leftSidebarOpen ? 'Hide' : 'Show'} Nodes</span>
          </button>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-interface-border">
            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-primary animate-pulse' : 'bg-primary'}`} />
            <span className="text-xs font-mono font-medium text-accent-tan uppercase tracking-wider">
              {isRunning ? 'Running' : 'Ready'}
            </span>
          </div>
          <Button variant="ghost" size="sm">
            <span className="material-symbols-outlined">settings</span>
          </Button>
          <button
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded border border-interface-border hover:border-primary transition-colors"
          >
            <span className="text-xs font-mono text-accent-tan">{rightSidebarOpen ? 'Hide' : 'Show'} Config</span>
            <span className="material-symbols-outlined text-sm text-accent-tan">view_sidebar</span>
          </button>
          <Button variant="primary" size="sm" onClick={handleRun}>
            {isRunning ? (
              <>
                <span className="material-symbols-outlined">stop</span>
                Stop
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">play_arrow</span>
                Run
              </>
            )}
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Sidebar - Node Palette */}
        {leftSidebarOpen && (
        <aside className="w-80 bg-bg-sidebar border-r border-interface-border flex flex-col transition-all duration-300">
          <div className="p-4 border-b border-interface-border">
            <h2 className="font-mono font-bold text-sm text-white uppercase tracking-wider mb-3">
              Add Nodes
            </h2>
            {/* Search */}
            <div className="group relative w-full h-10 bg-white/5 rounded-lg border border-interface-border flex items-center px-3 transition-all duration-200 focus-within:border-primary">
              <span className="material-symbols-outlined text-accent-tan text-lg">search</span>
              <input
                type="text"
                placeholder="Find component..."
                className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-accent-tan/50 font-mono text-sm ml-2 h-full"
              />
            </div>
          </div>

          {/* Node Categories */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Inputs */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-accent-tan uppercase tracking-wider font-mono">Inputs</h3>
              <div className="space-y-2">
                <div className="bg-bg-sidebar border border-interface-border rounded-lg p-3 cursor-grab hover:border-primary hover:shadow-[0_0_15px_rgba(244,175,37,0.1)] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-interface-border flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-lg">upload_file</span>
                    </div>
                    <div>
                      <span className="font-mono font-bold text-xs text-white">File Upload</span>
                      <p className="text-[10px] text-accent-tan">PDF, Word, Excel, etc.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-bg-sidebar border border-interface-border rounded-lg p-3 cursor-grab hover:border-primary hover:shadow-[0_0_15px_rgba(244,175,37,0.1)] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-interface-border flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-lg">image</span>
                    </div>
                    <div>
                      <span className="font-mono font-bold text-xs text-white">Image Input</span>
                      <p className="text-[10px] text-accent-tan">PNG, JPG, etc.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agents */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-accent-tan uppercase tracking-wider font-mono">Agents</h3>
              <div className="space-y-2">
                <div className="bg-bg-sidebar border border-interface-border rounded-lg p-3 cursor-grab hover:border-primary hover:shadow-[0_0_15px_rgba(244,175,37,0.1)] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-lg">smart_toy</span>
                    </div>
                    <div>
                      <span className="font-mono font-bold text-xs text-white">GPT-4 Agent</span>
                      <p className="text-[10px] text-accent-tan">General purpose</p>
                    </div>
                  </div>
                </div>
                <div className="bg-bg-sidebar border border-interface-border rounded-lg p-3 cursor-grab hover:border-primary hover:shadow-[0_0_15px_rgba(244,175,37,0.1)] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-lg">psychology</span>
                    </div>
                    <div>
                      <span className="font-mono font-bold text-xs text-white">Claude Agent</span>
                      <p className="text-[10px] text-accent-tan">Code specialist</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Outputs */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-accent-tan uppercase tracking-wider font-mono">Outputs</h3>
              <div className="space-y-2">
                <div className="bg-bg-sidebar border border-interface-border rounded-lg p-3 cursor-grab hover:border-primary hover:shadow-[0_0_15px_rgba(244,175,37,0.1)] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-interface-border flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-lg">description</span>
                    </div>
                    <div>
                      <span className="font-mono font-bold text-xs text-white">Word Document</span>
                      <p className="text-[10px] text-accent-tan">.docx output</p>
                    </div>
                  </div>
                </div>
                <div className="bg-bg-sidebar border border-interface-border rounded-lg p-3 cursor-grab hover:border-primary hover:shadow-[0_0_15px_rgba(244,175,37,0.1)] transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-interface-border flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-lg">table</span>
                    </div>
                    <div>
                      <span className="font-mono font-bold text-xs text-white">Excel File</span>
                      <p className="text-[10px] text-accent-tan">.xlsx output</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
        )}

        {/* Canvas Area */}
        <main className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            className="bg-bg-dark"
          >
            <Background color="#2a2d37" gap={40} size={1} />
            <Controls className="bg-bg-sidebar border border-interface-border rounded-lg" />
            <MiniMap className="bg-bg-sidebar border border-interface-border rounded-lg" nodeColor="#f4af25" />
          </ReactFlow>

          {/* The Deck - Control Bar */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
            <div className="h-16 px-4 bg-bg-sidebar rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-interface-border flex items-center gap-4">
              <Button variant="outline" size="sm">
                <span className="material-symbols-outlined">add</span>
                Add Node
              </Button>
              <div className="w-px h-8 bg-interface-border" />
              <button
                onClick={handleRun}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  isRunning
                    ? 'bg-signal-red shadow-[0_4px_0_#993322,0_8px_16px_rgba(204,85,68,0.4)]'
                    : 'bg-primary shadow-[0_4px_0_#b88a32,0_8px_16px_rgba(244,175,37,0.4)] crt-button-glow'
                } active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] active:translate-y-[1px]`}
              >
                <span className="material-symbols-outlined text-bg-deep text-2xl">
                  {isRunning ? 'stop' : 'play_arrow'}
                </span>
              </button>
              <div className="w-px h-8 bg-interface-border" />
              <Button variant="icon" size="sm">
                <span className="material-symbols-outlined animate-spin" style={{ animationDuration: '10s' }}>settings</span>
              </Button>
            </div>
          </div>
        </main>

        {/* Inspector Panel */}
        {rightSidebarOpen && (
        <aside className="w-96 bg-bg-sidebar border-l border-interface-border flex flex-col">
          <div className="p-4 border-b border-interface-border">
            <h2 className="font-mono font-bold text-lg text-white">Node Config</h2>
          </div>
          <div className="flex-1 p-4 space-y-6 overflow-y-auto">
            {/* Model Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-accent-tan uppercase tracking-wider font-mono">
                Model
              </label>
              <div className="relative">
                <select className="w-full appearance-none bg-white/5 border border-interface-border text-white font-mono text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option>GPT-4 (WorkerBee Optimized)</option>
                  <option>Claude 3.5 Sonnet</option>
                  <option>GPT-4o-mini</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-accent-tan">
                  <span className="material-symbols-outlined text-sm">expand_more</span>
                </div>
              </div>
            </div>

            {/* Temperature Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-accent-tan uppercase tracking-wider font-mono">
                  Temperature
                </label>
                <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">
                  0.7
                </span>
              </div>
              <div className="relative h-2 bg-interface-border rounded-full overflow-hidden">
                <div className="absolute top-0 left-0 h-full w-[70%] bg-primary rounded-full" />
              </div>
              <div className="flex justify-between text-[10px] text-accent-tan font-mono">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-accent-tan uppercase tracking-wider font-mono">
                System Prompt
              </label>
              <textarea
                className="w-full h-32 bg-white/5 text-white font-mono text-xs leading-relaxed p-4 rounded-lg border border-interface-border shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] resize-none focus:ring-1 focus:ring-primary/30 outline-none"
                placeholder="You are a helpful assistant..."
                defaultValue="You are a specialized research agent focused on document analysis. When processing documents, prioritize accuracy and cite sources when possible."
              />
            </div>

            {/* Update Button */}
            <Button className="w-full">
              <span className="material-symbols-outlined text-base">save</span>
              Update Module
            </Button>
          </div>
        </aside>
        )}
      </div>

      {/* Terminal Drawer */}
      {footerOpen && (
      <div className="h-40 bg-bg-darker border-t border-interface-border flex flex-col transition-all duration-300">
        {/* Handle Bar */}
        <div 
          onClick={() => setFooterOpen(false)}
          className="h-8 bg-bg-darker flex items-center justify-between px-4 cursor-pointer hover:bg-interface-border/30 transition-colors">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-accent-tan text-lg">expand_less</span>
            <span className="text-accent-tan text-xs font-bold tracking-wider font-mono">SYSTEM LOG</span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <button className="text-accent-tan hover:text-white text-xs font-medium transition-colors font-mono">CLEAR</button>
            <button className="text-accent-tan hover:text-white text-xs font-medium transition-colors font-mono">COPY</button>
          </div>
        </div>
        
        {/* Log Content */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 relative">
          {/* CRT Overlay */}
          <div className="crt-overlay absolute inset-0 opacity-30 pointer-events-none" />
          
          <div className="flex gap-3 relative z-0">
            <span className="text-accent-tan">[15:30:41]</span>
            <span className="text-primary font-bold">[SYSTEM]</span>
            <span className="text-white/90">Workflow editor loaded.</span>
          </div>
          <div className="flex gap-3 relative z-0">
            <span className="text-accent-tan">[15:30:42]</span>
            <span className="text-primary font-bold">[INFO]</span>
            <span className="text-white/90">Connected to backend.</span>
          </div>
          <div className="flex gap-3 relative z-0">
            <span className="text-accent-tan">[15:30:45]</span>
            <span className="text-primary font-bold">[INFO]</span>
            <span className="text-white/90">Ready to execute workflows.</span>
          </div>
        </div>
      </div>
      )}

      {/* Collapsed Footer Indicator */}
      {!footerOpen && (
        <div 
          onClick={() => setFooterOpen(true)}
          className="h-10 bg-bg-darker border-t border-interface-border flex items-center justify-center cursor-pointer hover:bg-interface-border/30 transition-colors"
        >
          <span className="material-symbols-outlined text-accent-tan">expand_less</span>
          <span className="text-accent-tan text-xs font-mono ml-2">SYSTEM LOG</span>
        </div>
      )}
    </div>
  )
}
