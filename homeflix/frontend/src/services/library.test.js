import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@/services/api'
import { getProgress, listAllCompleted, resetProgress, saveProgress } from '@/services/library'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

const PROGRESS = '*/api/library/v1/media/:mediaId/progress'

/** Serveur de progression : l'écriture est lente (40 ms), la lecture est immédiate. `stored` : position par film. */
function slowWrites(stored, { fail = false } = {}) {
  return [
    http.put(PROGRESS, async ({ request, params }) => {
      await delay(40)
      if (fail) return HttpResponse.json({ code: 'INTERNAL_ERROR', status: 500 }, { status: 500 })
      stored[params.mediaId] = (await request.json()).positionSeconds
      return HttpResponse.json({ mediaId: params.mediaId, positionSeconds: stored[params.mediaId], state: 'STARTED' })
    }),
    http.delete(PROGRESS, async ({ params }) => {
      await delay(40)
      delete stored[params.mediaId]
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(PROGRESS, ({ params }) =>
      HttpResponse.json({ mediaId: params.mediaId, positionSeconds: stored[params.mediaId] ?? 0, state: 'STARTED' }),
    ),
  ]
}

beforeEach(() => {
  server.resetHandlers()
  setAccessToken('jeton')
})

describe('titres terminés', () => {
  const COMPLETED = '*/api/library/v1/me/completed'
  const page = (items, number = 0, totalPages = 1) => ({ items, page: number, size: 50, total: items.length, totalPages })

  it('parcourt toutes les pages', async () => {
    const asked = []
    server.use(
      http.get(COMPLETED, ({ request }) => {
        const query = new URL(request.url).searchParams
        asked.push(`${query.get('page')}/${query.get('size')}`)
        const number = Number(query.get('page'))
        return HttpResponse.json(page([{ id: `m${number}` }], number, 3))
      }),
    )
    expect(await listAllCompleted()).toEqual([{ id: 'm0' }, { id: 'm1' }, { id: 'm2' }])
    expect(asked).toEqual(['0/50', '1/50', '2/50'])
  })

  it('attend la sauvegarde en cours : un film qu’on vient de terminer y figure', async () => {
    const stored = {}
    server.use(
      ...slowWrites(stored),
      http.get(COMPLETED, () => HttpResponse.json(page(Object.keys(stored).map((id) => ({ id }))))),
    )
    saveProgress('m1', { positionSeconds: 600, durationSeconds: 600 })
    expect(await listAllCompleted()).toEqual([{ id: 'm1' }])
  })

  it('refuse une réponse inattendue', async () => {
    server.use(http.get(COMPLETED, () => HttpResponse.json({})))
    await expect(listAllCompleted()).rejects.toThrow('Réponse inattendue pour les titres terminés')
  })
})

describe('progression : lire après sa propre écriture', () => {
  it('une lecture lancée pendant une sauvegarde renvoie la position sauvegardée', async () => {
    const stored = {}
    server.use(...slowWrites(stored))

    saveProgress('m1', { positionSeconds: 90, durationSeconds: 600 }) // en tâche de fond, comme à la sortie du lecteur
    const progress = await getProgress('m1')
    expect(progress.positionSeconds).toBe(90)
  })

  it('« Recommencer » est lui aussi attendu avant la lecture suivante', async () => {
    const stored = { m1: 300 }
    server.use(...slowWrites(stored))

    resetProgress('m1')
    expect((await getProgress('m1')).positionSeconds).toBe(0)
  })

  it('enchaîne plusieurs écritures : la lecture voit la dernière', async () => {
    const stored = {}
    server.use(...slowWrites(stored))

    saveProgress('m1', { positionSeconds: 30, durationSeconds: 600 })
    saveProgress('m1', { positionSeconds: 60, durationSeconds: 600 })
    expect((await getProgress('m1')).positionSeconds).toBe(60)
  })

  it('n’attend pas les écritures d’un autre film', async () => {
    const stored = {}
    const order = []
    server.use(...slowWrites(stored))

    const write = saveProgress('m1', { positionSeconds: 90, durationSeconds: 600 }).then(() => order.push('écriture m1'))
    await getProgress('m2').then(() => order.push('lecture m2'))
    await write
    expect(order).toEqual(['lecture m2', 'écriture m1'])
  })

  it('une écriture en échec ne bloque pas la lecture, et l’échec reste visible pour l’appelant', async () => {
    server.use(...slowWrites({}, { fail: true }))

    const outcome = saveProgress('m1', { positionSeconds: 90, durationSeconds: 600 }).then(
      () => null,
      (error) => error,
    )
    expect((await getProgress('m1')).positionSeconds).toBe(0)
    expect(await outcome).toMatchObject({ status: 500 })
  })
})
