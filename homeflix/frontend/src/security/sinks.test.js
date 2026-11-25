// Revue XSS (#86) : garde-fou. Aucun fichier de l'application n'utilise une API qui interprète du texte comme du HTML ou
// du code. Si un besoin réel apparaît, il doit être discuté, nettoyé, puis ajouté explicitement ici.
import { describe, expect, it } from 'vitest'

const SINKS =
  /dangerouslySetInnerHTML|\.(inner|outer)HTML\s*=|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser|srcDoc|\beval\s*\(|new Function\s*\(|set(Timeout|Interval)\s*\(\s*['"`]/

const files = Object.entries(
  import.meta.glob(['/src/**/*.{js,jsx}', '!/src/**/*.test.{js,jsx}'], { query: '?raw', import: 'default', eager: true }),
)

describe('puits HTML et exécution de texte', () => {
  it('inspecte bien le code de l’application', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files.map(([path]) => path)).toContain('/src/features/catalogue/DetailPage.jsx')
  })

  it.each([
    '<div dangerouslySetInnerHTML={{ __html: titre }} />',
    'node.innerHTML = titre',
    'element.insertAdjacentHTML("beforeend", nom)',
    'eval (code)',
    'setTimeout("alert(1)", 10)',
  ])('reconnaît : %s', (code) => {
    expect(code).toMatch(SINKS)
  })

  it('aucun fichier n’en utilise', () => {
    expect(files.filter(([, source]) => SINKS.test(source)).map(([path]) => path)).toEqual([])
  })
})
