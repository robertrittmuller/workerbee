const { app, BrowserWindow, dialog, ipcMain, Notification, safeStorage, shell } = require('electron')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {
  buildAgentEnvironment,
  buildAgentModelConfiguration,
  includedConnection,
  publicModelConnection,
  readModelConnection,
  saveModelConnection,
} = require('./model-settings.cjs')
const { buildMailtoUrl } = require('./email-draft.cjs')
const { buildCalendarIcs } = require('./calendar-draft.cjs')
const { exportBuffer } = require('./file-export.cjs')
const { taskNotificationCopy, validateTaskNotification } = require('./task-notification.cjs')
const { waitForCompatibleRuntime } = require('../scripts/runtime-compatibility.cjs')

let mainWindow = null
let backendProcess = null
let agentProcess = null
let desktopSessionSecret = ''
let runtimeDataDirectory = ''
const calendarDraftPaths = new Set()
let activeModelConnection = includedConnection()
let runtimeStatus = {
  mode: 'starting',
  apiBaseUrl: '',
  message: 'Starting the private local workspace…',
  modelService: 'Starting…',
  model: null,
  processingLocation: 'external',
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => {
        if (port) resolve(port)
        else reject(new Error('Could not reserve a local port'))
      })
    })
  })
}

function waitForHealth(url, timeoutMs = 45_000, headers = {}) {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, { headers }, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve()
          return
        }
        retry()
      })
      request.setTimeout(1_500, () => request.destroy())
      request.on('error', retry)
    }
    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('The local WorkerBee service did not become ready in time.'))
        return
      }
      setTimeout(check, 350)
    }
    check()
  })
}

function packagedAgentPath() {
  const executableName = process.platform === 'win32' ? 'opencode.exe' : 'opencode'
  return path.join(process.resourcesPath, 'runtime', executableName)
}

function developmentAgentPath() {
  const executableName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode'
  return path.resolve(__dirname, '../node_modules/.bin', executableName)
}

async function startAgentRuntime(dataDirectory, workspaceDirectory, modelConnection) {
  const configuredUrl = process.env.OPENCODE_API_BASE_URL?.trim()
  if (configuredUrl) {
    return {
      url: configuredUrl.replace(/\/$/, ''),
      password: process.env.OPENCODE_PASSWORD || 'workerbee_secret',
    }
  }

  const port = await reserveLoopbackPort()
  const url = `http://127.0.0.1:${port}`
  const password = crypto.randomBytes(32).toString('base64url')
  const configRoot = path.join(dataDirectory, 'opencode-config')
  const configDirectory = path.join(configRoot, 'opencode')
  const dataRoot = path.join(dataDirectory, 'opencode-data')
  const cacheRoot = path.join(dataDirectory, 'opencode-cache')
  fs.mkdirSync(configDirectory, { recursive: true })
  fs.mkdirSync(dataRoot, { recursive: true })
  fs.mkdirSync(cacheRoot, { recursive: true })
  fs.writeFileSync(
    path.join(configDirectory, 'opencode.json'),
    JSON.stringify(buildAgentModelConfiguration(modelConnection)),
    { encoding: 'utf8', mode: 0o600 }
  )

  const executable = app.isPackaged ? packagedAgentPath() : developmentAgentPath()
  if (!fs.existsSync(executable)) {
    throw new Error(`The WorkerBee agent engine was not found at ${executable}`)
  }

  agentProcess = spawn(
    executable,
    [
      'serve',
      '--pure',
      '--port',
      String(port),
      '--hostname',
      '127.0.0.1',
      '--log-level',
      app.isPackaged ? 'ERROR' : 'WARN',
    ],
    {
      cwd: workspaceDirectory,
      env: {
        ...process.env,
        OPENCODE_SERVER_PASSWORD: password,
        XDG_CONFIG_HOME: configRoot,
        XDG_DATA_HOME: dataRoot,
        XDG_CACHE_HOME: cacheRoot,
        ...buildAgentEnvironment(modelConnection),
      },
      stdio: app.isPackaged ? 'ignore' : 'inherit',
      windowsHide: true,
    }
  )

  agentProcess.once('exit', (code, signal) => {
    if (!app.isQuitting) {
      runtimeStatus = {
        mode: 'error',
        apiBaseUrl: runtimeStatus.apiBaseUrl,
        message: `The local agent engine stopped unexpectedly (${signal || code || 'unknown'}).`,
        modelService: runtimeStatus.modelService,
        model: runtimeStatus.model,
        processingLocation: runtimeStatus.processingLocation,
      }
      mainWindow?.webContents.send('runtime:status-changed', runtimeStatus)
    }
  })

  const authorization = Buffer.from(`opencode:${password}`).toString('base64')
  await waitForHealth(
    `${url}/global/health`,
    45_000,
    { Authorization: `Basic ${authorization}` }
  )
  return { url, password }
}

function readOrCreateDesktopSecret(dataDirectory) {
  const secretPath = path.join(dataDirectory, 'desktop-secret')
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim()
    if (existing) return existing
  } catch {
    // The file is created on first launch.
  }
  const secret = crypto.randomBytes(48).toString('base64url')
  fs.writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600 })
  return secret
}

function packagedBackendPath() {
  const executableName = process.platform === 'win32' ? 'workerbee-backend.exe' : 'workerbee-backend'
  return path.join(process.resourcesPath, 'runtime', executableName)
}

function developmentBackend() {
  const backendDirectory = path.resolve(__dirname, '../../backend')
  return {
    command: process.env.WORKERBEE_UV_EXECUTABLE || 'uv',
    args: ['run', '--project', backendDirectory, 'python', path.join(backendDirectory, 'desktop_entry.py')],
  }
}

async function startLocalRuntime() {
  const configuredApiUrl = process.env.WORKERBEE_API_URL?.trim()
  if (configuredApiUrl) {
    runtimeStatus = {
      mode: 'remote',
      apiBaseUrl: configuredApiUrl.replace(/\/$/, ''),
      message: 'Connected to the configured WorkerBee service.',
      modelService: process.env.WORKERBEE_MODEL_SERVICE_LABEL || 'Organization-managed model service',
      model: process.env.WORKERBEE_MODEL_NAME || null,
      processingLocation: 'external',
    }
    return
  }

  const backendPort = await reserveLoopbackPort()
  desktopSessionSecret = crypto.randomBytes(32).toString('base64url')
  const apiBaseUrl = `http://127.0.0.1:${backendPort}`
  const dataDirectory = path.join(app.getPath('userData'), 'runtime')
  runtimeDataDirectory = dataDirectory
  const uploadsDirectory = path.join(dataDirectory, 'uploads')
  const workspaceDirectory = path.join(dataDirectory, 'workspace')
  fs.mkdirSync(uploadsDirectory, { recursive: true })
  fs.mkdirSync(workspaceDirectory, { recursive: true })
  activeModelConnection = readModelConnection(dataDirectory, safeStorage)

  const databasePath = path.join(dataDirectory, 'workerbee.db').replace(/\\/g, '/')
  const secret = readOrCreateDesktopSecret(dataDirectory)
  const devServerUrl = process.env.WORKERBEE_DEV_SERVER_URL?.trim()
  const corsOrigins = ['null']
  if (devServerUrl) corsOrigins.push(new URL(devServerUrl).origin)
  const agentRuntime = await startAgentRuntime(dataDirectory, workspaceDirectory, activeModelConnection)

  let command
  let args
  let cwd = dataDirectory
  const explicitExecutable = process.env.WORKERBEE_BACKEND_EXECUTABLE?.trim()
  if (explicitExecutable) {
    command = explicitExecutable
    args = []
  } else if (app.isPackaged) {
    command = packagedBackendPath()
    args = []
  } else {
    const development = developmentBackend()
    command = development.command
    args = development.args
  }

  if (!fs.existsSync(command) && (app.isPackaged || explicitExecutable)) {
    throw new Error(`The WorkerBee runtime was not found at ${command}`)
  }

  backendProcess = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      WORKERBEE_BACKEND_PORT: String(backendPort),
      DATABASE_URL: `sqlite+aiosqlite:///${databasePath}`,
      SECRET_KEY: secret,
      CORS_ORIGINS: JSON.stringify(corsOrigins),
      OPENCODE_API_BASE_URL: agentRuntime.url,
      OPENCODE_PASSWORD: agentRuntime.password,
      OPENCODE_WORKSPACE_ROOT: workspaceDirectory,
      WORKERBEE_DESKTOP_MODE: 'true',
      WORKERBEE_DESKTOP_SESSION_SECRET: desktopSessionSecret,
    },
    stdio: app.isPackaged ? 'ignore' : 'inherit',
    windowsHide: true,
  })

  backendProcess.once('exit', (code, signal) => {
    if (!app.isQuitting) {
      runtimeStatus = {
        mode: 'error',
        apiBaseUrl,
        message: `The local service stopped unexpectedly (${signal || code || 'unknown'}).`,
        modelService: runtimeStatus.modelService,
        model: runtimeStatus.model,
        processingLocation: runtimeStatus.processingLocation,
      }
      mainWindow?.webContents.send('runtime:status-changed', runtimeStatus)
    }
  })

  await waitForCompatibleRuntime(`${apiBaseUrl}/health`)
  runtimeStatus = {
    mode: 'local',
    apiBaseUrl,
    message: 'Private local workspace is ready.',
    modelService: activeModelConnection.providerLabel,
    model: activeModelConnection.model,
    processingLocation: 'external',
  }
}

function registerIpcHandlers() {
  ipcMain.handle('runtime:get-status', () => runtimeStatus)

  ipcMain.handle('settings:get-model-connection', () => (
    publicModelConnection(activeModelConnection, safeStorage)
  ))

  ipcMain.handle('settings:save-model-connection', (_event, input) => {
    if (runtimeStatus.mode !== 'local' || !runtimeDataDirectory) {
      throw new Error('Model connections are managed by your WorkerBee administrator.')
    }
    activeModelConnection = saveModelConnection(runtimeDataDirectory, safeStorage, input)
    const result = publicModelConnection(activeModelConnection, safeStorage)
    runtimeStatus = {
      ...runtimeStatus,
      mode: 'starting',
      message: 'Restarting WorkerBee with the new model connection…',
      modelService: activeModelConnection.providerLabel,
      model: activeModelConnection.model,
    }
    mainWindow?.webContents.send('runtime:status-changed', runtimeStatus)
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 700)
    return result
  })

  ipcMain.handle('files:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add files to WorkerBee',
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return []
    return result.filePaths.map((filePath) => {
      const stats = fs.statSync(filePath)
      return { path: filePath, name: path.basename(filePath), size: stats.size }
    })
  })

  ipcMain.handle('folders:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a folder for WorkerBee',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0] || null
  })

  ipcMain.handle('files:reveal', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return false
    shell.showItemInFolder(filePath)
    return true
  })

  ipcMain.handle('files:save-copy', async (_event, input) => {
    const { filename, buffer } = exportBuffer(input)
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save a copy from WorkerBee',
      buttonLabel: 'Save copy',
      defaultPath: path.join(app.getPath('downloads'), filename),
    })
    if (result.canceled || !result.filePath) return { saved: false }
    await fs.promises.writeFile(result.filePath, buffer, { flag: 'w' })
    return { saved: true, filePath: result.filePath }
  })

  ipcMain.handle('email:open-draft', async (_event, draft) => {
    const mailtoUrl = buildMailtoUrl(draft)
    await shell.openExternal(mailtoUrl)
    return true
  })

  ipcMain.handle('calendar:open-draft', async (_event, draft) => {
    const content = buildCalendarIcs(draft)
    const draftDirectory = path.join(app.getPath('temp'), 'workerbee-calendar-drafts')
    await fs.promises.mkdir(draftDirectory, { recursive: true, mode: 0o700 })
    const filePath = path.join(draftDirectory, `${crypto.randomUUID()}.ics`)
    await fs.promises.writeFile(filePath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    calendarDraftPaths.add(filePath)
    const openError = await shell.openPath(filePath)
    if (openError) {
      calendarDraftPaths.delete(filePath)
      await fs.promises.unlink(filePath).catch(() => undefined)
      throw new Error(`WorkerBee could not open the calendar draft: ${openError}`)
    }
    return true
  })

  ipcMain.handle('notifications:show-task-status', (_event, input) => {
    const task = validateTaskNotification(input)
    if (!Notification.isSupported() || mainWindow?.isFocused()) return false
    const copy = taskNotificationCopy(task.status)
    const notification = new Notification({ title: copy.title, body: copy.body })
    notification.on('click', () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('notifications:open-task', task.executionId)
    })
    notification.show()
    return true
  })
}

function createWindow() {
  const devServerUrl = process.env.WORKERBEE_DEV_SERVER_URL?.trim()
  const uiPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ui', 'index.html')
    : path.resolve(__dirname, '../../frontend/dist/index.html')
  const allowedFilePrefix = pathToFileURL(`${path.dirname(uiPath)}${path.sep}`).href

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    show: false,
    backgroundColor: '#f6f5f2',
    title: 'WorkerBee',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [
        `--workerbee-api-url=${encodeURIComponent(runtimeStatus.apiBaseUrl)}`,
        `--workerbee-runtime-mode=${encodeURIComponent(runtimeStatus.mode)}`,
        `--workerbee-desktop-session=${encodeURIComponent(desktopSessionSecret)}`,
      ],
    },
  })

  mainWindow.removeMenu()
  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAllowed = devServerUrl
      ? new URL(url).origin === new URL(devServerUrl).origin
      : url.startsWith(allowedFilePrefix)
    if (isAllowed) return

    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
  })

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(uiPath)
  }
}

async function stopRuntime() {
  if (backendProcess && !backendProcess.killed) backendProcess.kill('SIGTERM')
  if (agentProcess && !agentProcess.killed) agentProcess.kill('SIGTERM')
  backendProcess = null
  agentProcess = null
}

app.whenReady().then(async () => {
  registerIpcHandlers()
  try {
    await startLocalRuntime()
  } catch (error) {
    runtimeStatus = {
      mode: 'error',
      apiBaseUrl: '',
      message: error instanceof Error ? error.message : 'The local service could not start.',
      modelService: 'Unavailable',
      model: null,
      processingLocation: 'external',
    }
  }

  process.env.WORKERBEE_RESOLVED_API_URL = runtimeStatus.apiBaseUrl
  process.env.WORKERBEE_RUNTIME_MODE = runtimeStatus.mode
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
  for (const filePath of calendarDraftPaths) {
    void fs.promises.unlink(filePath).catch(() => undefined)
  }
  calendarDraftPaths.clear()
  void stopRuntime()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
