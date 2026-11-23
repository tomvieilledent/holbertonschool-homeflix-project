import { describe, expect, it } from 'vitest'
import { resolvePlaybackFailure } from '@/features/player/playbackErrors'
import { ApiError } from '@/services/apiError'

const resolve = (input) => resolvePlaybackFailure({ canRefresh: true, failure: null, ...input })

const FORMAT = 'Le format de cette vidéo n’est pas pris en charge.'
const FAILED = 'La lecture a échoué. Réessayez dans un instant.'

describe('resolvePlaybackFailure', () => {
  it.each([
    ['fichier manquant (404)', new ApiError(404, 'MEDIA_FILE_MISSING'), 'Le fichier de ce film est introuvable.'],
    ['accès refusé (403)', new ApiError(403, 'ACCESS_DENIED'), 'Vous n’avez pas les droits nécessaires pour cette action.'],
    ['format refusé par le serveur (415)', new ApiError(415, 'MEDIA_UNSUPPORTED_FORMAT'), FORMAT],
    ['connexion perdue', new ApiError(0, 'NETWORK_ERROR'), 'Impossible de joindre le serveur. Vérifiez votre connexion.'],
    ['serveur en panne (503)', new ApiError(503), 'Le service est momentanément indisponible. Réessayez dans un instant.'],
  ])('%s → message clair', (_name, failure, message) => {
    expect(resolve({ mediaErrorCode: 4, failure })).toEqual({ type: 'error', message })
  })

  it('un ticket expiré donne un nouveau ticket, une seule fois', () => {
    const failure = new ApiError(401, 'TICKET_EXPIRED')
    expect(resolve({ failure })).toEqual({ type: 'refresh' })
    expect(resolve({ failure, canRefresh: false })).toEqual({
      type: 'error',
      message: 'Le lien de lecture a expiré. Relancez la lecture.',
    })
  })

  it('la perte du réseau n’essaie pas de nouveau ticket', () => {
    expect(resolve({ failure: new ApiError(0, 'NETWORK_ERROR') }).type).toBe('error')
  })

  it('un flux qui répond mais ne se lit pas : un nouveau ticket d’abord, puis le message du navigateur', () => {
    expect(resolve({ mediaErrorCode: 2 })).toEqual({ type: 'refresh' })
    expect(resolve({ mediaErrorCode: 4, canRefresh: false }).message).toBe(FORMAT)
    expect(resolve({ mediaErrorCode: 3, canRefresh: false }).message).toBe(
      'Cette vidéo ne peut pas être lue : le fichier semble endommagé.',
    )
    expect(resolve({ mediaErrorCode: 2, canRefresh: false }).message).toBe(FAILED)
    expect(resolve({ canRefresh: false }).message).toBe(FAILED)
  })

  it('ignore une lecture interrompue volontairement', () => {
    expect(resolve({ mediaErrorCode: 1 })).toEqual({ type: 'ignore' })
  })

  it('n’affiche jamais de détail technique', () => {
    const messages = [404, 403, 415, 500, 503].map((status) => resolve({ failure: new ApiError(status) }).message)
    for (const message of messages) expect(message).not.toMatch(/exception|stack|sql|null|undefined|http \d|\/api\//i)
  })
})
