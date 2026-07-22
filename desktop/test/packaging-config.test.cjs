const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const desktopDirectory = path.resolve(__dirname, '..')
const packageJson = require('../package.json')

test('desktop packages use branded assets and runtime verification', () => {
  assert.equal(packageJson.build.beforePack, 'scripts/verify-runtime.cjs')
  assert.equal(packageJson.build.files.includes('scripts/runtime-compatibility.cjs'), true)
  assert.equal(packageJson.build.mac.icon, 'build/icon.icns')
  assert.equal(packageJson.build.win.icon, 'build/icon.ico')
  assert.equal(packageJson.build.linux.icon, 'build/icon.png')

  for (const iconPath of ['build/icon.icns', 'build/icon.ico', 'build/icon.png']) {
    assert.equal(fs.existsSync(path.join(desktopDirectory, iconPath)), true, `${iconPath} should exist`)
  }
})

test('Windows installer stays per-user and cannot request elevation', () => {
  assert.equal(packageJson.build.nsis.oneClick, false)
  assert.equal(packageJson.build.nsis.perMachine, false)
  assert.equal(packageJson.build.nsis.allowElevation, false)
  assert.equal(packageJson.build.nsis.packElevateHelper, false)
})

test('platform distribution scripts request native sidecars explicitly', () => {
  assert.match(packageJson.scripts['dist:mac'], /--target=darwin/)
  assert.match(packageJson.scripts['dist:windows'], /--target=win32/)
  assert.match(packageJson.scripts['dist:linux'], /--target=linux/)
})
