import { describe, expect, it } from 'vitest'
import { loginUrl, safeNext } from '@/features/auth/redirect'

describe('loginUrl', () => {
  it('conserve la destination, requête et ancre comprises', () => {
    expect(loginUrl({ pathname: '/watch/12', search: '?t=30', hash: '#fin' })).toBe(
      '/login?next=%2Fwatch%2F12%3Ft%3D30%23fin',
    )
  })

  it('n’ajoute pas de paramètre pour l’accueil', () => {
    expect(loginUrl({ pathname: '/' })).toBe('/login')
  })
})

describe('safeNext', () => {
  it('accepte un chemin interne', () => {
    expect(safeNext('/watch/12?t=30')).toBe('/watch/12?t=30')
  })

  it.each([
    ['URL absolue', 'https://evil.example/phish'],
    ['URL relative au protocole', '//evil.example'],
    ['antislash', '/\\evil.example'],
    ['sans barre initiale', 'admin'],
    ['boucle vers /login', '/login'],
    ['boucle vers /login avec requête', '/login?next=%2F'],
    ['vide', ''],
    ['absent', undefined],
    ['null', null],
  ])('refuse : %s', (_label, value) => {
    expect(safeNext(value)).toBe('/')
  })
})
