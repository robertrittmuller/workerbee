const { contextBridge, ipcRenderer } = require('electron')

function readArgument(name) {
  const prefix = `--${name}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))
  return argument ? decodeURIComponent(argument.slice(prefix.length)) : ''
}

contextBridge.exposeInMainWorld('workerbeeDesktop', {
  isDesktop: true,
  platform: process.platform,
  apiBaseUrl: readArgument('workerbee-api-url'),
  runtimeMode: readArgument('workerbee-runtime-mode') || 'unknown',
  desktopSessionSecret: readArgument('workerbee-desktop-session'),
  getRuntimeStatus: () => ipcRenderer.invoke('runtime:get-status'),
  onRuntimeStatusChanged: (listener) => {
    const handler = (_event, status) => listener(status)
    ipcRenderer.on('runtime:status-changed', handler)
    return () => ipcRenderer.removeListener('runtime:status-changed', handler)
  },
  getModelConnection: () => ipcRenderer.invoke('settings:get-model-connection'),
  saveModelConnection: (settings) => ipcRenderer.invoke('settings:save-model-connection', settings),
  selectFiles: () => ipcRenderer.invoke('files:select'),
  selectDirectory: () => ipcRenderer.invoke('folders:select'),
  revealFile: (filePath) => ipcRenderer.invoke('files:reveal', filePath),
  saveFileCopy: (input) => ipcRenderer.invoke('files:save-copy', input),
  openEmailDraft: (draft) => ipcRenderer.invoke('email:open-draft', draft),
  openCalendarDraft: (draft) => ipcRenderer.invoke('calendar:open-draft', draft),
  showTaskNotification: (input) => ipcRenderer.invoke('notifications:show-task-status', input),
  onOpenTaskNotification: (listener) => {
    const handler = (_event, executionId) => listener(executionId)
    ipcRenderer.on('notifications:open-task', handler)
    return () => ipcRenderer.removeListener('notifications:open-task', handler)
  },
})
