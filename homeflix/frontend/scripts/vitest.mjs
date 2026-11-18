import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

// Sous Windows, un terminal ouvert avec une lettre de lecteur en minuscule (c:\...) fait charger
// Vitest sous deux orthographes du même chemin : « Vitest failed to find the runner », 0 test lancé.
// On le relance donc depuis le chemin canonique (C:\...). Sans effet sur Linux et macOS.
const cwd = realpathSync.native(process.cwd())
const vitest = join(cwd, 'node_modules', 'vitest', 'vitest.mjs')

const { status } = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
})
process.exit(status ?? 1)
