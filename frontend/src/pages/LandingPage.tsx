import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ceramic">
      {/* Navigation */}
      <nav className="h-16 bg-plastic/80 backdrop-blur-sm border-b border-[#D6D1CC] flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-espresso rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-ceramic text-xl">hive</span>
          </div>
          <span className="font-display font-bold text-lg text-espresso">WorkerBee</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-tungsten hover:text-espresso transition-colors text-sm font-medium">Features</a>
          <a href="#how-it-works" className="text-tungsten hover:text-espresso transition-colors text-sm font-medium">How It Works</a>
          <a href="#pricing" className="text-tungsten hover:text-espresso transition-colors text-sm font-medium">Pricing</a>
          <a href="#" className="text-tungsten hover:text-espresso transition-colors text-sm font-medium">Docs</a>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login">
            <Button variant="ghost" size="sm">Log In</Button>
          </Link>
          <Link to="/login">
            <Button variant="primary" size="sm">Get Started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Dot Grid Background */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#8C8682 1.5px, transparent 1.5px)',
            backgroundSize: '40px 40px'
          }}
        />

        {/* Content */}
        <div className="relative z-10 text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-plastic rounded-full border border-[#D6D1CC] shadow-soft mb-8">
            <div className="w-2 h-2 rounded-full bg-amber animate-pulse" />
            <span className="text-xs font-mono font-medium text-tungsten uppercase tracking-wider">
              Now in Beta
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display font-bold text-5xl md:text-6xl lg:text-7xl text-espresso tracking-tight leading-tight mb-6">
            Put AI Agents to<br />
            <span className="text-amber">Real Work</span>
          </h1>

          {/* Subheadline */}
          <p className="font-body text-lg md:text-xl text-tungsten max-w-2xl mx-auto mb-10">
            WorkerBee lets you build visual workflows that connect your documents, 
            data, and AI agents. No coding required.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login">
              <Button variant="primary" size="lg">
                Get Started Free
                <span className="material-symbols-outlined">arrow_forward</span>
              </Button>
            </Link>
            <Button variant="outline" size="lg">
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Hero Image Container */}
        <div className="relative z-10 mt-16 w-full max-w-5xl mx-auto">
          <div className="relative bg-plastic rounded-2xl shadow-deep border border-[#D6D1CC] overflow-hidden aspect-video">
            {/* Canvas Content Preview */}
            <div 
              className="absolute inset-0 bg-ceramic opacity-50"
              style={{
                backgroundImage: 'radial-gradient(#8C8682 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}
            />
            {/* Placeholder for workflow canvas preview */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-tungsten font-display text-xl">Workflow Canvas Preview</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 bg-plastic">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display font-bold text-3xl md:text-4xl text-espresso text-center mb-16">
            Everything you need to automate your work
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-ceramic rounded-xl p-6 border border-[#D6D1CC]">
              <div className="w-12 h-12 rounded-xl bg-amber/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-amber text-2xl">account_tree</span>
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Visual Workflow Builder</h3>
              <p className="text-tungsten text-sm">
                Drag and drop nodes to create complex workflows. Connect inputs, agents, and outputs visually.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-ceramic rounded-xl p-6 border border-[#D6D1CC]">
              <div className="w-12 h-12 rounded-xl bg-amber/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-amber text-2xl">smart_toy</span>
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Multiple AI Models</h3>
              <p className="text-tungsten text-sm">
                Choose from GPT-4, Claude, and more. Switch models based on your task requirements.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-ceramic rounded-xl p-6 border border-[#D6D1CC]">
              <div className="w-12 h-12 rounded-xl bg-amber/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-amber text-2xl">code</span>
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Sandboxed Execution</h3>
              <p className="text-tungsten text-sm">
                Agents execute Python code in secure sandboxes. Install packages dynamically as needed.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-ceramic rounded-xl p-6 border border-[#D6D1CC]">
              <div className="w-12 h-12 rounded-xl bg-amber/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-amber text-2xl">description</span>
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Document Processing</h3>
              <p className="text-tungsten text-sm">
                Upload PDFs, Word docs, Excel files, and images. Agents can read and process any format.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-ceramic rounded-xl p-6 border border-[#D6D1CC]">
              <div className="w-12 h-12 rounded-xl bg-amber/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-amber text-2xl">output</span>
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Multiple Output Formats</h3>
              <p className="text-tungsten text-sm">
                Generate Word documents, PDFs, Excel files, CSVs, and more from your workflows.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-ceramic rounded-xl p-6 border border-[#D6D1CC]">
              <div className="w-12 h-12 rounded-xl bg-amber/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-amber text-2xl">visibility</span>
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Real-time Monitoring</h3>
              <p className="text-tungsten text-sm">
                Watch your agents work in real-time. View logs, debug issues, and track progress.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6 bg-ceramic">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display font-bold text-3xl md:text-4xl text-espresso text-center mb-16">
            How It Works
          </h2>
          
          <div className="grid md:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber text-espresso-dark font-display font-bold text-2xl flex items-center justify-center mx-auto mb-4 shadow-pneumatic">
                1
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Upload Files</h3>
              <p className="text-tungsten text-sm">
                Upload your documents, data files, or images as input for your workflow.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber text-espresso-dark font-display font-bold text-2xl flex items-center justify-center mx-auto mb-4 shadow-pneumatic">
                2
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Create Workflow</h3>
              <p className="text-tungsten text-sm">
                Drag nodes onto the canvas and connect them to define your workflow.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber text-espresso-dark font-display font-bold text-2xl flex items-center justify-center mx-auto mb-4 shadow-pneumatic">
                3
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Define Task</h3>
              <p className="text-tungsten text-sm">
                Tell your agent what to do using natural language or pre-built templates.
              </p>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber text-espresso-dark font-display font-bold text-2xl flex items-center justify-center mx-auto mb-4 shadow-pneumatic">
                4
              </div>
              <h3 className="font-display font-bold text-lg text-espresso mb-2">Get Results</h3>
              <p className="text-tungsten text-sm">
                Run your workflow and download the generated outputs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-espresso">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display font-bold text-3xl md:text-4xl text-ceramic mb-6">
            Ready to automate your work?
          </h2>
          <p className="text-tungsten text-lg mb-8">
            Start building workflows today. No credit card required.
          </p>
          <Link to="/login">
            <Button variant="primary" size="lg">
              Get Started Free
              <span className="material-symbols-outlined">arrow_forward</span>
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-espresso-dark border-t border-tungsten/20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-espresso-dark text-xl">hive</span>
              </div>
              <span className="font-display font-bold text-lg text-ceramic">WorkerBee</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#" className="text-tungsten hover:text-ceramic transition-colors text-sm">Privacy</a>
              <a href="#" className="text-tungsten hover:text-ceramic transition-colors text-sm">Terms</a>
              <a href="#" className="text-tungsten hover:text-ceramic transition-colors text-sm">Contact</a>
            </div>
            <p className="text-tungsten text-sm">
              © 2026 WorkerBee. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
