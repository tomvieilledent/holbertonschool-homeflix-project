import { describe, expect, it } from 'vitest'
import { formatBytes, safeHttpUrl } from '@/features/admin/acquisitionFormat'

describe('formatBytes', () => {
  it.each([
    [0, '0 octets'],
    [512, '512 octets'],
    [1024, '1 Ko'],
    [1536, '1,5 Ko'],
    [350_000_000, '334 Mo'],
    [1_500_000_000, '1,4 Go'],
    [1_073_741_824, '1 Go'],
    [5 * 1024 ** 4, '5 To'],
  ])('%s octets → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })

  it.each([[-1], [NaN], [undefined], [null], ['350']])('une taille invalide (%j) donne un tiret', (value) => {
    expect(formatBytes(value)).toBe('—')
  })
})

describe('safeHttpUrl', () => {
  it.each([
    ['https://studio.blender.org/films/', 'https://studio.blender.org/films/'],
    ['http://exemple.org/licence', 'http://exemple.org/licence'],
  ])('accepte %s', (value, expected) => {
    expect(safeHttpUrl(value)).toBe(expected)
  })

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
    ['ftp://exemple.org/licence'],
    ['/relatif/licence'],
    ['pas une adresse'],
    [''],
    [undefined],
  ])('refuse %j', (value) => {
    expect(safeHttpUrl(value)).toBeNull()
  })
})
