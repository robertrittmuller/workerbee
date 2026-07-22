const path = require('node:path')
const { assertRuntimeBundle, normalizeArch, normalizePlatform } = require('./runtime-contract.cjs')
const { computeBackendBuildId, probeRuntimeExecutable } = require('./runtime-compatibility.cjs')

async function verifyPackagedRuntime(context) {
  const platform = normalizePlatform(context.electronPlatformName)
  const arch = normalizeArch(context.arch)
  const runtimeDirectory = path.resolve(__dirname, '../runtime')
  const inspected = assertRuntimeBundle(runtimeDirectory, platform, arch)
  const summary = inspected.map((item) => `${item.executableName}=${item.platform}/${item.arch}`).join(', ')
  console.log(`Verified WorkerBee runtime: ${summary}`)

  const backendName = platform === 'win32' ? 'workerbee-backend.exe' : 'workerbee-backend'
  const compatibility = await probeRuntimeExecutable(path.join(runtimeDirectory, backendName))
  const expectedBuildId = computeBackendBuildId(path.resolve(__dirname, '../../backend'))
  if (compatibility.buildId !== expectedBuildId) {
    throw new Error(
      `WorkerBee backend build ${compatibility.buildId.slice(0, 12)} does not match current source ` +
      `${expectedBuildId.slice(0, 12)}. Rebuild the bundled backend.`
    )
  }
  console.log(
    `Verified WorkerBee backend API: version=${compatibility.version}, ` +
    `contract=${compatibility.contractVersion}, capabilities=${compatibility.capabilities.length}, ` +
    `build=${compatibility.buildId.slice(0, 12)}`
  )
}

module.exports = verifyPackagedRuntime
