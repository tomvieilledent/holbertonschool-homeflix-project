import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetProfile, rememberedProfile, rememberProfile } from '@/services/activeProfile'

describe('profil actif retenu', () => {
  afterEach(() => {
    forgetProfile()
    vi.unstubAllGlobals()
  })

  it('retient, relit et oublie le profil de l’onglet', () => {
    expect(rememberedProfile()).toBeNull()
    rememberProfile('p1')
    expect(rememberedProfile()).toBe('p1')
    rememberProfile('p2')
    expect(rememberedProfile()).toBe('p2')
    forgetProfile()
    expect(rememberedProfile()).toBeNull()
  })

  it('reste dans sessionStorage (propre à l’onglet), pas dans localStorage', () => {
    rememberProfile('p1')
    expect(Object.keys(localStorage)).toHaveLength(0)
    expect(sessionStorage.getItem('homeflix:active-profile')).toBe('p1')
  })

  it('ne plante pas quand le stockage est indisponible', () => {
    const blocked = () => {
      throw new Error('bloqué')
    }
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(() => rememberProfile('p1')).not.toThrow()
    expect(rememberedProfile()).toBeNull()
    expect(() => forgetProfile()).not.toThrow()
  })
})
