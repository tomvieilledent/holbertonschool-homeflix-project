import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diagnoseStream } from '@/services/streaming'

const STREAM_URL = '/api/library/v1/stream/abc?t=ticket'
const reply = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('diagnoseStream', () => {
  let fetchMock
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('ne demande que le premier octet et ne signale rien si le flux répond', async () => {
    fetchMock.mockResolvedValue(reply(206))
    expect(await diagnoseStream(STREAM_URL)).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe(STREAM_URL)
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Range: 'bytes=0-0' })
  })

  it.each([
    [401, undefined, 'TICKET_EXPIRED'],
    [404, undefined, 'MEDIA_FILE_MISSING'],
    [415, undefined, 'MEDIA_UNSUPPORTED_FORMAT'],
    [403, undefined, undefined],
    [403, { code: 'ACCESS_DENIED' }, 'ACCESS_DENIED'],
    [401, { code: 'TICKET_EXPIRED' }, 'TICKET_EXPIRED'],
  ])('statut %s (%o) → code %s', async (status, body, code) => {
    fetchMock.mockResolvedValue(reply(status, body))
    expect(await diagnoseStream(STREAM_URL)).toMatchObject({ status, code })
  })

  it('signale une perte de réseau', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await diagnoseStream(STREAM_URL)).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('laisse passer une annulation', async () => {
    fetchMock.mockRejectedValue(new DOMException('annulé', 'AbortError'))
    await expect(diagnoseStream(STREAM_URL)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
