import React, { useEffect, useMemo, useState } from 'react'
import mermaid from 'mermaid'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type MarkdownContentProps = {
  content: string
}

let mermaidInitialized = false

function ensureMermaidInitialized(): void {
  if (mermaidInitialized) {
    return
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
  })
  mermaidInitialized = true
}

function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const diagramId = useMemo(() => `mermaid-${Math.random().toString(36).slice(2, 10)}`, [])

  useEffect(() => {
    let isMounted = true
    ensureMermaidInitialized()

    const renderDiagram = async () => {
      try {
        const { svg: renderedSvg } = await mermaid.render(diagramId, chart)
        if (!isMounted) {
          return
        }
        setSvg(renderedSvg)
        setError(null)
      } catch (err) {
        if (!isMounted) {
          return
        }
        setSvg('')
        setError(err instanceof Error ? err.message : 'Failed to render Mermaid diagram')
      }
    }

    void renderDiagram()

    return () => {
      isMounted = false
    }
  }, [chart, diagramId])

  if (error) {
    return (
      <div className="border border-signal-red/40 bg-signal-red/10 rounded p-3 space-y-2">
        <p className="text-xs font-mono text-signal-red break-words">
          Mermaid render error: {error}
        </p>
        <pre className="text-xs font-mono text-accent-tan whitespace-pre-wrap break-words">
          {chart}
        </pre>
      </div>
    )
  }

  if (!svg) {
    return <p className="text-xs font-mono text-accent-tan">Rendering diagram...</p>
  }

  return (
    <div
      className="overflow-auto rounded border border-interface-border/60 bg-bg-deep/40 p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="space-y-3 text-sm font-mono text-white leading-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-xl font-bold mt-2 mb-3">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mt-2 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-bold mt-2 mb-2">{children}</h3>,
          p: ({ children }) => <p className="text-sm leading-6">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-6">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-interface-border/70 pl-3 italic text-accent-tan">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline break-all"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-auto">
              <table className="w-full border-collapse border border-interface-border/70 text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/10">{children}</thead>,
          th: ({ children }) => <th className="border border-interface-border/70 px-2 py-1">{children}</th>,
          td: ({ children }) => <td className="border border-interface-border/70 px-2 py-1">{children}</td>,
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children
            if (React.isValidElement(child)) {
              const props = child.props as { className?: string; children?: React.ReactNode }
              if (props.className?.includes('language-mermaid')) {
                const chart = String(props.children ?? '').trim()
                return <MermaidBlock chart={chart} />
              }
            }

            return (
              <pre className="overflow-auto rounded border border-interface-border/70 bg-bg-deep/40 p-3 text-xs">
                {children}
              </pre>
            )
          },
          code: ({ className, children }) => (
            <code className={`font-mono ${className ?? ''}`}>{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
