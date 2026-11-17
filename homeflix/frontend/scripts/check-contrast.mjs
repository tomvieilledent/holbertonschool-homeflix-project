import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

const themes = {
  sombre: /:root\s*\{([^}]*)\}/,
  clair: /:root\[data-theme='light'\]\s*\{([^}]*)\}/,
}

// [premier plan, arrière-plan, ratio minimal]. Texte : 4,5 ; éléments d'interface : 3 (WCAG 2.1 AA)
const checks = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['link', 'bg', 4.5],
  ['link', 'surface', 4.5],
  ['secondary-text', 'bg', 4.5],
  ['secondary-text', 'surface', 4.5],
  ['danger', 'bg', 4.5],
  ['danger', 'surface', 4.5],
  ['success', 'bg', 4.5],
  ['success', 'surface', 4.5],
  ['on-primary', 'primary', 4.5],
  ['on-secondary', 'secondary', 4.5],
  ['border-strong', 'bg', 3],
  ['border-strong', 'surface', 3],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
]

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

let failures = 0
for (const [theme, pattern] of Object.entries(themes)) {
  const block = css.match(pattern)?.[1] ?? ''
  const own = Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v]),
  )
  const dark = Object.fromEntries(
    [...css.match(themes.sombre)[1].matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(
      ([, k, v]) => [k, v],
    ),
  )
  const colors = { ...dark, ...own }
  console.log(`\nThème ${theme}`)
  for (const [fg, bg, min] of checks) {
    const value = ratio(colors[fg], colors[bg])
    const ok = value >= min
    if (!ok) failures++
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${fg} ${colors[fg]} sur ${bg} ${colors[bg]} : ${value.toFixed(2)}:1 (min ${min})`,
    )
  }
}

if (failures) {
  console.error(`\n${failures} contraste(s) insuffisant(s)`)
  process.exit(1)
}
console.log('\nTous les contrastes respectent WCAG AA')
