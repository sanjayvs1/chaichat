// Downloads the correct prebuilt better-sqlite3 binary for the installed
// Electron runtime. Native modules compiled against system Node.js will not
// load inside Electron (different ABI), so after every `npm install` we swap
// in the Electron-flavored prebuild published by better-sqlite3.
//
// If no prebuild exists for this Electron/OS/arch combo, we print instructions
// instead of failing silently (compiling from source requires MSVC on Windows).
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function main() {
  const root = path.join(__dirname, '..')
  const electronPkgPath = path.join(root, 'node_modules', 'electron', 'package.json')
  const bsqDir = path.join(root, 'node_modules', 'better-sqlite3')

  // Skip when either package isn't installed (e.g. partial installs)
  if (!fs.existsSync(electronPkgPath) || !fs.existsSync(bsqDir)) {
    console.log('[rebuild-native] electron or better-sqlite3 not installed; skipping.')
    return
  }

  const electronVersion = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8')).version
  console.log(`[rebuild-native] Fetching better-sqlite3 prebuild for Electron ${electronVersion}...`)

  const result = spawnSync(
    'npx',
    ['prebuild-install', '--runtime=electron', `--target=${electronVersion}`, '--verbose'],
    { cwd: bsqDir, stdio: 'inherit', shell: true }
  )

  if (result.status !== 0) {
    console.warn(
      '[rebuild-native] No matching prebuild found.\n' +
      '  Options:\n' +
      '  1. Pin Electron to a version with a published prebuild (see https://github.com/WiseLibs/better-sqlite3/releases)\n' +
      '  2. Compile from source: install Visual Studio Build Tools (C++ workload) and run:\n' +
      '     npx @electron/rebuild -f -w better-sqlite3'
    )
    // Don't fail the whole install over this — the app will show a clear DB error instead.
    return
  }

  console.log('[rebuild-native] better-sqlite3 is ready for Electron.')
}

main()
