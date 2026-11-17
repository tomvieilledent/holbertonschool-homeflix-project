import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Marqueurs propres aux mocks : aucun ne doit se retrouver dans le build de production.
const MARKERS = ['mockServiceWorker', 'homeflix:mock-session', 'mot-de-passe-12', 'mock-access-token']
const dist = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })

const found = files(dist).flatMap((file) => {
  const content = readFileSync(file, 'utf8')
  return MARKERS.filter((marker) => content.includes(marker)).map((marker) => `${file} : « ${marker} »`)
})

if (found.length) {
  console.error('Des éléments de mock se trouvent dans le build :\n' + found.join('\n'))
  process.exit(1)
}
console.log('Aucun mock dans le build de production')
