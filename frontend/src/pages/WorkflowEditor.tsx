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

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const handleRun = () => {
    setIsRunning(!isRunning)
    // TODO: Implement workflow execution
  }

  return (
    <div className="h-screen flex flex-col bg-ceramic">
      {/* Top Navigation */}
      <nav className="h-16 bg-plastic/80 backdrop-blur-sm border-b border-[#D6D1CC] flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-espresso rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-ceramic text-xl">hive</span>
            </div>
          </Link>
          <div className="h-6 w-px bg-[#D6D1CC]" />
          <div>
            <h1 className="font-display font-bold text-sm text-espresso">
              {id === 'new' ? 'New Workflow' : `Workflow ${id}`}
            </h1>
            <p className="text-xs text-tungsten">Last saved: 2 minutes ago</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-ceramic rounded-full border border-[#D6D1CC]">
            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber animate-pulse' : 'bg-signal-green'}`} />
            <span className="text-xs font-mono font-medium text-tungsten uppercase tracking-wider">
              {isRunning ? 'Running' : 'Ready'}
            </span>
          </div>
          <Button variant="ghost" size="sm">
            <span className="material-symbols-outlined">settings</span>
          </Button>
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
        <aside className="w-80 bg-ceramic-dark border-r border-[#D6D1CC] flex flex-col">
          <div className="p-4 border-b border-[#D6D1CC]">
            <h2 className="font-display font-bold text-sm text-espresso uppercase tracking-wider mb-3">
              Add Nodes
            </h2>
            {/* Search */}
            <div className="group relative w-full h-10 bg-ceramic rounded-lg border border-transparent shadow-inset-slot flex items-center px-3 transition-all duration-200 focus-within:border-amber">
              <span className="material-symbols-outlined text-tungsten text-lg">search</span>
              <input
                type="text"
                placeholder="Find component..."
                className="w-full bg-transparent border-none focus:ring-0 text-espresso placeholder-tungsten/50 font-body text-sm ml-2 h-full"
              />
            </div>
          </div>

          {/* Node Categories */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Inputs */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-tungsten uppercase tracking-wider font-display">Inputs</h3>
              <div className="space-y-2">
                <div className="bg-plastic border border-ceramic rounded-lg p-3 cursor-grab hover:border-amber hover:shadow-soft transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-ceramic flex items-center justify-center">
                      <span className="material-symbols-outlined text-espresso text-lg">upload_file</span>
                    </div>
                    <div>
                      <span className="font-display font-bold text-xs text-espresso">File Upload</span>
                      <p className="text-[10px] text-tungsten">PDF, Word, Excel, etc.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-plastic border border-ceramic rounded-lg p-3 cursor-grab hover:border-amber hover:shadow-soft transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-ceramic flex items-center justify-center">
                      <span className="material-symbols-outlined text-espresso text-lg">image</span>
                    </div>
                    <div>
                      <span className="font-display font-bold text-xs text-espresso">Image Input</span>
                      <p className="text-[10px] text-tungsten">PNG, JPG, etc.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agents */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-tungsten uppercase tracking-wider font-display">Agents</h3>
              <div className="space-y-2">
                <div className="bg-plastic border border-ceramic rounded-lg p-3 cursor-grab hover:border-amber hover:shadow-soft transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-amber text-lg">smart_toy</span>
                    </div>
                    <div>
                      <span className="font-display font-bold text-xs text-espresso">GPT-4 Agent</span>
                      <p className="text-[10px] text-tungsten">General purpose</p>
                    </div>
                  </div>
                </div>
                <div className="bg-plastic border border-ceramic rounded-lg p-3 cursor-grab hover:border-amber hover:shadow-soft transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-amber text-lg">psychology</span>
                    </div>
                    <div>
                      <span className="font-display font-bold text-xs text-espresso">Claude Agent</span>
                      <p className="text-[10px] text-tungsten">Code specialist</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Outputs */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-tungsten uppercase tracking-wider font-display">Outputs</h3>
              <div className="space-y-2">
                <div className="bg-plastic border border-ceramic rounded-lg p-3 cursor-grab hover:border-amber hover:shadow-soft transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-ceramic flex items-center justify-center">
                      <span className="material-symbols-outlined text-espresso text-lg">description</span>
                    </div>
                    <div>
                      <span className="font-display font-bold text-xs text-espresso">Word Document</span>
                      <p className="text-[10px] text-tungsten">.docx output</p>
                    </div>
                  </div>
                </div>
                <div className="bg-plastic border border-ceramic rounded-lg p-3 cursor-grab hover:border-amber hover:shadow-soft transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-ceramic flex items-center justify-center">
                      <span className="material-symbols-outlined text-espresso text-lg">table</span>
                    </div>
                    <div>
                      <span className="font-display font-bold text-xs text-espresso">Excel File</span>
                      <p className="text-[10px] text-tungsten">.xlsx output</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Canvas Area */}
        <main className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            className="bg-ceramic"
          >
            <Background color="#8C8682" gap={40} size={1} />
            <Controls className="bg-plastic border border-[#D6D1CC] rounded-lg shadow-lift" />
            <MiniMap className="bg-plastic border border-[#D6D1CC] rounded-lg" />
          </ReactFlow>

          {/* The Deck - Control Bar */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
            <div className="h-16 px-4 bg-plastic rounded-2xl shadow-deep border border-[#D6D1CC] flex items-center gap-4">
              <Button variant="outline" size="sm">
                <span className="material-symbols-outlined">add</span>
                Add Node
              </Button>
              <div className="w-px h-8 bg-[#D6D1CC]" />
              <button
                onClick={handleRun}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  isRunning
                    ? 'bg-signal-red shadow-[0_4px_0_#993322,0_8px_16px_rgba(204,85,68,0.4)]'
                    : 'bg-amber shadow-[0_4px_0_#b88a32,0_8px_16px_rgba(228,173,63,0.4)]'
                } active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] active:translate-y-[1px]`}
              >
                <span className="material-symbols-outlined text-white text-2xl">
                  {isRunning ? 'stop' : 'play_arrow'}
                </span>
              </button>
              <div className="w-px h-8 bg-[#D6D1CC]" />
              <Button variant="icon" size="sm">
                <span className="material-symbols-outlined animate-spin" style={{ animationDuration: '10s' }}>settings</span>
              </Button>
            </div>
          </div>
        </main>

        {/* Inspector Panel */}
        <aside className="w-96 bg-plastic border-l border-[#D6D1CC] flex flex-col">
          <div className="p-4 border-b border-[#D6D1CC]">
            <h2 className="font-display font-bold text-lg text-espresso">Node Config</h2>
          </div>
          <div className="flex-1 p-4 space-y-6 overflow-y-auto">
            {/* Model Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-tungsten uppercase tracking-wider font-display">
                Model
              </label>
              <div className="relative">
                <select className="w-full appearance-none bg-ceramic border border-[#D6D1CC] text-espresso font-mono text-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber/50 shadow-inset">
                  <option>GPT-4 (WorkerBee Optimized)</option>
                  <option>Claude 3.5 Sonnet</option>
                  <option>GPT-4o-mini</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-tungsten">
                  <span className="material-symbols-outlined text-sm">expand_more</span>
                </div>
              </div>
            </div>

            {/* Temperature Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-tungsten uppercase tracking-wider font-display">
                  Temperature
                </label>
                <span className="font-mono text-xs text-espresso bg-ceramic px-2 py-0.5 rounded border border-[#D6D1CC]">
                  0.7
                </span>
              </div>
              <div className="relative h-2 bg-ceramic rounded-full shadow-inset overflow-hidden">
                <div className="absolute top-0 left-0 h-full w-[70%] bg-amber rounded-full" />
              </div>
              <div className="flex justify-between text-[10px] text-tungsten font-mono">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-tungsten uppercase tracking-wider font-display">
                System Prompt
              </label>
              <textarea
                className="w-full h-32 bg-tinted-paper text-espresso font-mono text-xs leading-relaxed p-4 rounded-lg border-none shadow-inset resize-none focus:ring-1 focus:ring-amber/30 outline-none"
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
      </div>

      {/* Terminal Drawer */}
      <div className="h-40 bg-espresso-dark border-t border-[#4a3e36] flex flex-col">
        {/* Handle Bar */}
        <div className="h-8 bg-[#362e2a] flex items-center justify-between px-4 cursor-pointer hover:bg-[#3f3632] transition-colors">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-tungsten text-lg">expand_less</span>
            <span className="text-tungsten text-xs font-bold tracking-wider">SYSTEM LOG</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <button className="text-tungsten hover:text-ceramic text-xs font-medium transition-colors">CLEAR</button>
            <button className="text-tungsten hover:text-ceramic text-xs font-medium transition-colors">COPY</button>
          </div>
        </div>
        
        {/* Log Content */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 relative">
          {/* CRT Overlay */}
          <div className="crt-overlay absolute inset-0 opacity-30 pointer-events-none" />
          
          <div className="flex gap-3 relative z-0">
            <span className="text-tungsten">[15:30:41]</span>
            <span className="text-amber font-bold">[SYSTEM]</span>
            <span className="text-ceramic/90">Workflow editor loaded.</span>
          </div>
          <div className="flex gap-3 relative z-0">
            <span className="text-tungsten">[15:30:42]</span>
            <span className="text-amber font-bold">[INFO]</span>
            <span className="text-ceramic/90">Connected to backend.</span>
          </div>
          <div className="flex gap-3 relative z-0">
            <span className="text-tungsten">[15:30:45]</span>
            <span className="text-amber font-bold">[INFO]</span>
            <span className="text-ceramic/90">Ready to execute workflows.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
