import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-deep">
      {/* Navigation */}
      <nav className="fixed top-0 w-full h-16 z-50 bg-bg-deep/90 border-b border-interface-border flex items-center px-6 lg:px-12 justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="text-primary flex items-center justify-center border-2 border-primary p-1">
            <span className="material-symbols-outlined text-2xl font-bold">grid_view</span>
          </div>
          <span className="text-xl font-mono font-extrabold tracking-tighter uppercase crt-glow">WorkerBee <span className="text-accent-tan font-normal text-xs">[DH-01]</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-widest text-accent-tan">
          <a className="hover:text-primary transition-colors flex items-center gap-2" href="#features">// Product</a>
          <a className="hover:text-primary transition-colors flex items-center gap-2" href="#pricing">// Pricing</a>
          <a className="hover:text-primary transition-colors flex items-center gap-2" href="#">// Docs</a>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login">
            <button className="font-mono text-xs uppercase tracking-widest text-accent-tan hover:text-white transition-colors">Login</button>
          </Link>
          <Link to="/login">
            <button className="bg-primary text-bg-deep px-4 py-1.5 font-mono font-bold text-xs uppercase crt-button-glow">
              Get Started
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen pt-32 pb-20 px-6 flex flex-col items-center justify-center overflow-hidden border-b border-interface-border">
        <div className="absolute inset-0 data-grid opacity-20"></div>
        <div className="relative z-10 max-w-6xl w-full text-center space-y-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-3 px-4 py-1 border border-interface-border bg-white/5 font-mono text-[10px] uppercase tracking-[0.3em] text-accent-tan">
            <span className="w-2 h-2 bg-primary inline-block"></span>
            System Status: V2.0 Swarm Active
          </div>
          
          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-mono font-extrabold tracking-tight text-white leading-none">
            POLLINATE YOUR<br/>
            <span className="text-primary crt-glow">PRODUCTIVITY</span><br/>
            WITH WORKERBEE.
          </h1>
          
          {/* Divider */}
          <div className="divider-h max-w-xs mx-auto opacity-50"></div>
          
          {/* Subheadline */}
          <p className="text-accent-tan font-sans text-sm md:text-base max-w-xl mx-auto uppercase tracking-wide leading-relaxed opacity-80">
            The hive-mind automation engine that connects your tools with autonomous AI agents.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-6">
            <Link to="/login" className="w-full sm:w-auto">
              <button className="w-full bg-primary text-bg-deep px-8 py-3 font-mono font-extrabold text-sm uppercase crt-button-glow flex items-center justify-center gap-3">
                Start Swarming <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </Link>
            <button className="w-full sm:w-auto border border-accent-tan text-accent-tan px-8 py-3 font-mono font-bold text-sm uppercase hover:bg-accent-tan hover:text-bg-deep transition-all flex items-center justify-center gap-3">
              View Demo <span className="material-symbols-outlined text-lg">terminal</span>
            </button>
          </div>
        </div>

        {/* Hero Image Container */}
        <div className="relative mt-20 w-full max-w-5xl aspect-[21/9] wireframe-box bg-bg-deep/40 flex items-center justify-center p-4">
          <div className="absolute top-2 left-2 font-mono text-[8px] text-accent-tan uppercase opacity-50">3D_MODEL_WIRE_V08.MAP</div>
          <div className="absolute bottom-2 right-2 font-mono text-[8px] text-accent-tan uppercase opacity-50">COORD_X: 42.09 // COORD_Y: -11.92</div>
          <div className="grid grid-cols-4 w-full h-full relative border border-interface-border/30">
            {/* Data In */}
            <div className="border-r border-interface-border/30 flex items-center justify-center">
              <div className="p-4 border border-accent-tan/20 flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-accent-tan text-3xl">database</span>
                <span className="font-mono text-[8px] text-accent-tan uppercase">Data_In</span>
              </div>
            </div>
            {/* Proc Node */}
            <div className="border-r border-interface-border/30 flex items-center justify-center">
              <div className="p-4 border border-primary/40 bg-primary/5 flex flex-col items-center gap-2 translate-y-6">
                <span className="material-symbols-outlined text-primary text-3xl crt-glow">memory</span>
                <span className="font-mono text-[8px] text-primary uppercase">Proc_Node</span>
              </div>
            </div>
            {/* Logic Map */}
            <div className="border-r border-interface-border/30 flex items-center justify-center">
              <div className="p-4 border border-accent-tan/20 flex flex-col items-center gap-2 -translate-y-6">
                <span className="material-symbols-outlined text-accent-tan text-3xl">account_tree</span>
                <span className="font-mono text-[8px] text-accent-tan uppercase">Logic_Map</span>
              </div>
            </div>
            {/* Execute */}
            <div className="flex items-center justify-center">
              <div className="p-6 border-2 border-primary bg-primary/10 flex flex-col items-center gap-2 crt-button-glow">
                <span className="material-symbols-outlined text-primary text-4xl crt-glow">send</span>
                <span className="font-mono text-[10px] font-bold text-primary uppercase">Execute</span>
              </div>
            </div>
            {/* SVG Lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
              <path d="M 120 150 L 350 190 L 580 110 L 820 150" fill="none" stroke="#f4af25" stroke-width="1"></path>
              <circle cx="120" cy="150" fill="#f4af25" r="3"></circle>
              <circle cx="350" cy="190" fill="#f4af25" r="3"></circle>
              <circle cx="580" cy="110" fill="#f4af25" r="3"></circle>
              <circle cx="820" cy="150" fill="#f4af25" r="3"></circle>
            </svg>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 lg:px-20 relative">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 flex flex-col md:flex-row md:items-end justify-between border-b border-interface-border pb-8">
            <div className="space-y-4">
              <h2 className="text-primary font-mono font-bold uppercase tracking-[0.4em] text-xs crt-glow">// CAPABILITIES</h2>
              <h3 className="text-3xl md:text-4xl font-mono font-extrabold tracking-tight text-white uppercase">Engineered for the Collective.</h3>
            </div>
            <div className="mt-4 md:mt-0 font-mono text-[10px] text-accent-tan uppercase tracking-widest bg-white/5 px-4 py-1 border border-interface-border">
              Access_Level: Root
            </div>
          </div>
          
          <div className="grid md:grid-cols-3 border border-interface-border">
            {/* Feature 1 */}
            <div className="p-10 space-y-8 border-b md:border-b-0 md:border-r border-interface-border group hover:bg-white/[0.02] transition-colors">
              <div className="w-16 h-16 border-2 border-primary/30 flex items-center justify-center text-primary group-hover:border-primary transition-all">
                <span className="material-symbols-outlined text-4xl">hub</span>
              </div>
              <div className="space-y-4">
                <h4 className="text-xl font-mono font-bold text-white uppercase tracking-tight">Hive Intelligence</h4>
                <p className="text-accent-tan text-xs uppercase tracking-wider leading-relaxed opacity-70">Deploy swarms of specialized AI agents that communicate and collaborate to solve complex multi-step tasks autonomously.</p>
              </div>
              <div className="pt-4 font-mono text-[10px] text-primary/60 uppercase">Module_01 // Active</div>
            </div>

            {/* Feature 2 */}
            <div className="p-10 space-y-8 border-b md:border-b-0 md:border-r border-interface-border group hover:bg-white/[0.02] transition-colors">
              <div className="w-16 h-16 border-2 border-primary/30 flex items-center justify-center text-primary group-hover:border-primary transition-all">
                <span className="material-symbols-outlined text-4xl">widgets</span>
              </div>
              <div className="space-y-4">
                <h4 className="text-xl font-mono font-bold text-white uppercase tracking-tight">Hex-Node Architecture</h4>
                <p className="text-accent-tan text-xs uppercase tracking-wider leading-relaxed opacity-70">A modular workflow engine designed for infinite scalability. Every 'Cell' is a reusable component in your automation honeycomb.</p>
              </div>
              <div className="pt-4 font-mono text-[10px] text-primary/60 uppercase">Module_02 // Active</div>
            </div>

            {/* Feature 3 */}
            <div className="p-10 space-y-8 group hover:bg-white/[0.02] transition-colors">
              <div className="w-16 h-16 border-2 border-primary/30 flex items-center justify-center text-primary group-hover:border-primary transition-all">
                <span className="material-symbols-outlined text-4xl">monitoring</span>
              </div>
              <div className="space-y-4">
                <h4 className="text-xl font-mono font-bold text-white uppercase tracking-tight">Honey-Flow Monitoring</h4>
                <p className="text-accent-tan text-xs uppercase tracking-wider leading-relaxed opacity-70">Visual real-time analytics. Watch your data flow through the hive with millisecond precision and detailed audit logs.</p>
              </div>
              <div className="pt-4 font-mono text-[10px] text-primary/60 uppercase">Module_03 // Active</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6 lg:px-20 border-t border-interface-border bg-white/[0.01]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl font-mono font-extrabold text-white uppercase tracking-tighter">The Lifecycle of a Task</h2>
            <div className="divider-h max-w-xs mx-auto opacity-30"></div>
            <p className="text-accent-tan text-[10px] uppercase tracking-[0.3em] font-mono">Process_Workflow_Sequencing</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 border border-interface-border">
            {/* Step 1 */}
            <div className="p-8 border-b md:border-b-0 md:border-r border-interface-border flex flex-col items-center text-center space-y-6">
              <div className="font-mono text-xs text-primary bg-primary/10 border border-primary/40 px-3 py-1">STEP_01</div>
              <div className="w-12 h-12 border border-interface-border flex items-center justify-center text-accent-tan">
                <span className="material-symbols-outlined text-2xl">search</span>
              </div>
              <div className="space-y-2">
                <h5 className="text-sm font-mono font-bold text-white uppercase">Deploy Scout</h5>
                <p className="text-accent-tan text-[10px] uppercase tracking-wide opacity-60">Identify the data sources and triggers for your swarm.</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-8 border-b md:border-b-0 md:border-r border-interface-border flex flex-col items-center text-center space-y-6">
              <div className="font-mono text-xs text-accent-tan border border-interface-border px-3 py-1">STEP_02</div>
              <div className="w-12 h-12 border border-interface-border flex items-center justify-center text-accent-tan">
                <span className="material-symbols-outlined text-2xl">architecture</span>
              </div>
              <div className="space-y-2">
                <h5 className="text-sm font-mono font-bold text-white uppercase">Map Workflow</h5>
                <p className="text-accent-tan text-[10px] uppercase tracking-wide opacity-60">Design the hexagonal logic path between nodes.</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-8 border-b md:border-b-0 md:border-r border-interface-border flex flex-col items-center text-center space-y-6">
              <div className="font-mono text-xs text-accent-tan border border-interface-border px-3 py-1">STEP_03</div>
              <div className="w-12 h-12 border border-interface-border flex items-center justify-center text-accent-tan">
                <span className="material-symbols-outlined text-2xl">dataset</span>
              </div>
              <div className="space-y-2">
                <h5 className="text-sm font-mono font-bold text-white uppercase">Collect Data</h5>
                <p className="text-accent-tan text-[10px] uppercase tracking-wide opacity-60">Aggregated results are processed through AI refinement.</p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-8 flex flex-col items-center text-center space-y-6">
              <div className="font-mono text-xs text-accent-tan border border-interface-border px-3 py-1">STEP_04</div>
              <div className="w-12 h-12 border border-interface-border flex items-center justify-center text-accent-tan">
                <span className="material-symbols-outlined text-2xl">verified</span>
              </div>
              <div className="space-y-2">
                <h5 className="text-sm font-mono font-bold text-white uppercase">Execute Task</h5>
                <p className="text-accent-tan text-[10px] uppercase tracking-wide opacity-60">The final payload is delivered to your destination tools.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 border-t border-interface-border relative overflow-hidden">
        <div className="absolute inset-0 data-grid opacity-10"></div>
        <div className="max-w-4xl mx-auto relative z-10 text-center space-y-12">
          <h2 className="text-4xl md:text-6xl font-mono font-extrabold tracking-tighter text-white uppercase">Ready to start the swarm?</h2>
          <div className="flex flex-col items-center gap-8">
            <p className="text-accent-tan font-mono text-xs uppercase tracking-[0.2em]">Established_Connection: Pulse_Sync_Acknowledge</p>
            <Link to="/login">
              <button className="bg-primary text-bg-deep px-12 py-5 font-mono font-extrabold text-lg uppercase crt-button-glow">
                Join the Hive
              </button>
            </Link>
            <p className="text-accent-tan text-[10px] uppercase tracking-widest opacity-50">Join 10,000+ teams automating with collective AI intelligence.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-bg-deep pt-20 pb-10 px-6 lg:px-20 border-t border-interface-border font-mono text-xs">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-20">
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center gap-3">
              <div className="text-primary flex items-center justify-center border-2 border-primary p-1">
                <span className="material-symbols-outlined text-xl font-bold">grid_view</span>
              </div>
              <span className="text-lg font-extrabold tracking-tight uppercase text-white">WorkerBee</span>
            </div>
            <p className="text-accent-tan uppercase tracking-wide opacity-60 max-w-sm leading-relaxed">
              The world's most advanced AI hive-mind automation engine. Scaling intelligence from the ground up.
            </p>
            <div className="flex gap-4">
              <a className="w-10 h-10 border border-interface-border flex items-center justify-center hover:border-primary hover:text-primary transition-all" href="#">
                <span className="material-symbols-outlined text-lg">terminal</span>
              </a>
              <a className="w-10 h-10 border border-interface-border flex items-center justify-center hover:border-primary hover:text-primary transition-all" href="#">
                <span className="material-symbols-outlined text-lg">code</span>
              </a>
            </div>
          </div>
          
          <div className="space-y-6">
            <h6 className="text-primary font-bold uppercase tracking-widest text-[10px]">// Product</h6>
            <ul className="space-y-4 text-accent-tan uppercase tracking-widest opacity-60">
              <li><a className="hover:text-white" href="#">Cells Marketplace</a></li>
              <li><a className="hover:text-white" href="#">Automation Hub</a></li>
              <li><a className="hover:text-white" href="#">Worker Agents</a></li>
              <li><a className="hover:text-white" href="#">Honey-Flow API</a></li>
            </ul>
          </div>
          
          <div className="space-y-6">
            <h6 className="text-primary font-bold uppercase tracking-widest text-[10px]">// Company</h6>
            <ul className="space-y-4 text-accent-tan uppercase tracking-widest opacity-60">
              <li><a className="hover:text-white" href="#">About Us</a></li>
              <li><a className="hover:text-white" href="#">Careers</a></li>
              <li><a className="hover:text-white" href="#">Security</a></li>
              <li><a className="hover:text-white" href="#">Privacy</a></li>
            </ul>
          </div>
          
          <div className="space-y-6">
            <h6 className="text-primary font-bold uppercase tracking-widest text-[10px]">// Resources</h6>
            <ul className="space-y-4 text-accent-tan uppercase tracking-widest opacity-60">
              <li><a className="hover:text-white" href="#">Documentation</a></li>
              <li><a className="hover:text-white" href="#">Community</a></li>
              <li><a className="hover:text-white" href="#">Status</a></li>
              <li><a className="hover:text-white" href="#">Support</a></li>
            </ul>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto pt-10 border-t border-interface-border flex flex-col md:flex-row justify-between items-center gap-4 text-accent-tan text-[9px] uppercase tracking-[0.2em] opacity-40">
          <p>© 2024 WorkerBee Technologies Inc. [SYSTEM_READY]</p>
          <div className="flex gap-8">
            <a className="hover:text-white" href="#">Terms of Service</a>
            <a className="hover:text-white" href="#">Cookie Policy</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
