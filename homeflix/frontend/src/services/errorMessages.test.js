import { describe, expect, it } from 'vitest'
import conventions from '../../../../docs/api/CONVENTIONS.md?raw'
import { downloadFailureMessage, KNOWN_CODES, userMessage } from '@/services/errorMessages'

const tableCodes = (heading) => {
  const section = conventions.split(heading)[1].split(/\n## |\n### /)[0]
  return [...section.matchAll(/^\| `([A-Z_]+)` \|/gm)].map(([, code]) => code)
}

const fixtureErrors = import.meta.glob('@fixtures/errors/*.json', { eager: true, import: 'default' })

describe('messages d’erreur', () => {
  it('couvrent tous les codes métier de CONVENTIONS.md', () => {
    const codes = tableCodes('### Codes d\'erreur métier')
    expect(codes.length).toBeGreaterThan(20)
    expect(codes.filter((code) => !KNOWN_CODES.includes(code))).toEqual([])
  })

  it('couvrent tous les codes des fixtures d’erreur', () => {
    const codes = Object.values(fixtureErrors).map((body) => body.code)
    expect(codes.filter((code) => !KNOWN_CODES.includes(code))).toEqual([])
  })

  it('couvrent les codes d’échec d’un téléchargement', () => {
    const codes = tableCodes('### Codes d\'échec d\'un téléchargement')
    expect(codes).toEqual(['NO_PEERS', 'DISK_FULL', 'TORRENT_CLIENT_UNAVAILABLE'])
    for (const code of codes) {
      expect(downloadFailureMessage(code)).not.toBe(downloadFailureMessage('INCONNU'))
    }
  })

  it('ne laissent filtrer aucun terme technique', () => {
    const messages = KNOWN_CODES.map((code) => userMessage(code, 400))
    for (const message of messages) {
      expect(message).toMatch(/^[A-ZÉÀ]/)
      expect(message).not.toMatch(/exception|stack|sql|null|undefined|http \d|\/api\//i)
    }
  })

  it('retombent sur un message générique pour un code ou un statut inconnu', () => {
    expect(userMessage('CODE_INCONNU', 418)).toBe('Une erreur est survenue. Réessayez dans un instant.')
    expect(userMessage(undefined, 503)).toBe('Le service est momentanément indisponible. Réessayez dans un instant.')
    expect(userMessage(undefined, 404)).toBe(userMessage('NOT_FOUND', 404))
  })
})
