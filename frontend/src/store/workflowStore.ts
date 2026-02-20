import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Node, Edge } from '@xyflow/react'

// Workflow store for managing workflow state
interface WorkflowState {
  nodes: Node[]
  edges: Edge[]
  selectedNode: string | null
  isExecuting: boolean
  
  // Actions
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  addNode: (node: Node) => void
  updateNode: (id: string, data: Partial<Node['data']>) => void
  removeNode: (id: string) => void
  setSelectedNode: (id: string | null) => void
  setIsExecuting: (isExecuting: boolean) => void
  
  // Connection actions
  addEdge: (edge: Edge) => void
  removeEdge: (id: string) => void
  
  // Reset
  reset: () => void
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNode: null,
      isExecuting: false,
      
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),
      
      addNode: (node) =>
        set((state) => ({
          nodes: [...state.nodes, node],
        })),
      
      updateNode: (id, data) =>
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, ...data } } : node
          ),
        })),
      
      removeNode: (id) =>
        set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== id),
          edges: state.edges.filter(
            (edge) => edge.source !== id && edge.target !== id
          ),
          selectedNode: state.selectedNode === id ? null : state.selectedNode,
        })),
      
      setSelectedNode: (id) => set({ selectedNode: id }),
      setIsExecuting: (isExecuting) => set({ isExecuting }),
      
      addEdge: (edge) =>
        set((state) => ({
          edges: [...state.edges, edge],
        })),
      
      removeEdge: (id) =>
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== id),
        })),
      
      reset: () =>
        set({
          nodes: [],
          edges: [],
          selectedNode: null,
          isExecuting: false,
        }),
    }),
    {
      name: 'workflow-storage',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
    }
  )
)

// Auth store for managing authentication state
interface AuthState {
  user: {
    id: string
    email: string
    name: string
  } | null
  token: string | null
  isAuthenticated: boolean
  
  // Actions
  setUser: (user: AuthState['user']) => void
  setToken: (token: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),
      
      setToken: (token) => set({ token }),
      
      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'auth-storage',
    }
  )
)

// UI store for managing UI state
interface UIState {
  sidebarOpen: boolean
  inspectorOpen: boolean
  terminalOpen: boolean
  activeTab: 'workflow' | 'settings' | 'logs'
  
  // Actions
  toggleSidebar: () => void
  toggleInspector: () => void
  toggleTerminal: () => void
  setActiveTab: (tab: UIState['activeTab']) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  inspectorOpen: true,
  terminalOpen: false,
  activeTab: 'workflow',
  
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),
  
  toggleInspector: () =>
    set((state) => ({
      inspectorOpen: !state.inspectorOpen,
    })),
  
  toggleTerminal: () =>
    set((state) => ({
      terminalOpen: !state.terminalOpen,
    })),
  
  setActiveTab: (activeTab) => set({ activeTab }),
}))