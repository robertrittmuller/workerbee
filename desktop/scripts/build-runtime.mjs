import { spawn } from 'node:child_process'
import { chmod, copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { assertRuntimeBundle, normalizePlatform } = require('./runtime-contract.cjs')
const { computeBackendBuildId } = require('./runtime-compatibility.cjs')

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopDirectory = path.resolve(scriptDirectory, '..')
const backendDirectory = path.resolve(desktopDirectory, '../backend')
const runtimeDirectory = path.join(desktopDirectory, 'runtime')
const targetArgument = process.argv.find((argument) => argument.startsWith('--target='))
const targetPlatform = normalizePlatform(targetArgument?.split('=', 2)[1] || process.platform)

if (targetPlatform !== process.platform) {
  throw new Error(
    `WorkerBee runtime builds are native-only: requested ${targetPlatform} from ${process.platform}. ` +
    `Run this build on ${targetPlatform} so PyInstaller and OpenCode match the installer.`
  )
}

const executableName = targetPlatform === 'win32' ? 'workerbee-backend.exe' : 'workerbee-backend'
const openCodeName = targetPlatform === 'win32' ? 'opencode.exe' : 'opencode'
const openCodeSource = path.join(
  desktopDirectory,
  'node_modules',
  'opencode-ai',
  'bin',
  'opencode.exe'
)
const backendBuildId = computeBackendBuildId(backendDirectory)
const runtimeHookPath = path.join(backendDirectory, 'build', 'workerbee-runtime-hook.py')

await mkdir(runtimeDirectory, { recursive: true })
await mkdir(path.dirname(runtimeHookPath), { recursive: true })
await writeFile(
  runtimeHookPath,
  `import os\nos.environ["WORKERBEE_BUNDLED_BUILD_ID"] = ${JSON.stringify(backendBuildId)}\n`,
  'utf8'
)
await Promise.all([
  'workerbee-backend',
  'workerbee-backend.exe',
  'opencode',
  'opencode.exe',
].map((name) => rm(path.join(runtimeDirectory, name), { force: true })))

const command = process.env.WORKERBEE_UV_EXECUTABLE || 'uv'
const args = [
  'run',
  '--extra',
  'desktop',
  'pyinstaller',
  '--noconfirm',
  '--clean',
  '--onefile',
  '--name',
  'workerbee-backend',
  '--distpath',
  runtimeDirectory,
  '--workpath',
  path.join(backendDirectory, 'build', 'desktop-runtime'),
  '--specpath',
  path.join(backendDirectory, 'build'),
  '--collect-all',
  'uvicorn',
  '--collect-all',
  'bcrypt',
  '--collect-all',
  'aiosqlite',
  '--collect-all',
  'pypdf',
  '--collect-all',
  'docx',
  '--collect-all',
  'openpyxl',
  '--collect-all',
  'pptx',
  '--runtime-hook',
  runtimeHookPath,
  path.join(backendDirectory, 'desktop_entry.py'),
]

const child = spawn(command, args, {
  cwd: backendDirectory,
  stdio: 'inherit',
  windowsHide: true,
})

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (code) => resolve(code ?? 1))
})

if (exitCode !== 0) process.exit(exitCode)

await rm(path.join(runtimeDirectory, openCodeName), { force: true })
await copyFile(openCodeSource, path.join(runtimeDirectory, openCodeName))
if (targetPlatform !== 'win32') {
  await chmod(path.join(runtimeDirectory, executableName), 0o755)
  await chmod(path.join(runtimeDirectory, openCodeName), 0o755)
}

const inspected = assertRuntimeBundle(runtimeDirectory, targetPlatform, process.arch)
console.log(
  `Built WorkerBee runtime: ${inspected.map((item) => `${item.executableName}=${item.platform}/${item.arch}`).join(', ')}, ` +
  `build=${backendBuildId.slice(0, 12)}`
)
