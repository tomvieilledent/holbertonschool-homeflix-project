import { expect } from 'vitest'

/** Bouton momentanément indisponible : annoncé comme tel, mais toujours focalisable (le clavier garde sa place). */
export function expectBusy(button) {
  expect(button).toHaveAttribute('aria-disabled', 'true')
  expect(button).toBeEnabled()
}

/** Bouton disponible. */
export function expectAvailable(button) {
  expect(button).toBeEnabled()
  expect(button).not.toHaveAttribute('aria-disabled')
}
