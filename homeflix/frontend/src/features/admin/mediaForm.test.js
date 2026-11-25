import { describe, expect, it } from 'vitest'
import {
  changesFrom,
  DESCRIPTION_MAX,
  GENRE_MAX_LENGTH,
  GENRES_MAX,
  initialValues,
  parseGenres,
  TITLE_MAX,
  validateMetadata,
} from '@/features/admin/mediaForm'

const media = {
  title: 'Big Buck Bunny',
  description: 'Un lapin géant.',
  genres: ['Animation', 'Comédie'],
  year: 2008,
}
const valid = { title: 'Big Buck Bunny', description: 'Un lapin géant.', genres: 'Animation, Comédie', year: '2008' }

describe('parseGenres', () => {
  it.each([
    ['Animation, Comédie', ['Animation', 'Comédie']],
    ['  Animation ,, Comédie , ', ['Animation', 'Comédie']],
    ['Animation, animation, ANIMATION', ['Animation']],
    ['', []],
    [' , , ', []],
  ])('%j → %j', (text, expected) => {
    expect(parseGenres(text)).toEqual(expected)
  })
})

describe('initialValues', () => {
  it('reprend le média, avec des champs vides pour les valeurs absentes', () => {
    expect(initialValues(media)).toEqual(valid)
    expect(initialValues({ title: 'Sans rien', description: null, genres: [], year: null })).toEqual({
      title: 'Sans rien',
      description: '',
      genres: '',
      year: '',
    })
  })
})

describe('validateMetadata', () => {
  it('accepte des valeurs valides, et une année vide', () => {
    expect(validateMetadata(valid)).toEqual({})
    expect(validateMetadata({ ...valid, year: '' })).toEqual({})
    expect(validateMetadata({ ...valid, genres: '', description: '' })).toEqual({})
  })

  it('exige un titre, de 1 à 200 caractères', () => {
    expect(validateMetadata({ ...valid, title: '   ' }).title).toBe('Le titre est obligatoire.')
    expect(validateMetadata({ ...valid, title: 'x'.repeat(TITLE_MAX) }).title).toBeUndefined()
    expect(validateMetadata({ ...valid, title: 'x'.repeat(TITLE_MAX + 1) }).title).toBe(
      `Le titre ne doit pas dépasser ${TITLE_MAX} caractères.`,
    )
  })

  it('limite la description à 2000 caractères', () => {
    expect(validateMetadata({ ...valid, description: 'x'.repeat(DESCRIPTION_MAX) }).description).toBeUndefined()
    expect(validateMetadata({ ...valid, description: 'x'.repeat(DESCRIPTION_MAX + 1) }).description).toBe(
      `La description ne doit pas dépasser ${DESCRIPTION_MAX} caractères.`,
    )
  })

  it('limite les genres : 10 au plus, de 40 caractères au plus', () => {
    const many = Array.from({ length: GENRES_MAX + 1 }, (_, index) => `genre${index}`).join(', ')
    expect(validateMetadata({ ...valid, genres: many }).genres).toBe(`${GENRES_MAX} genres au maximum.`)
    expect(validateMetadata({ ...valid, genres: Array.from({ length: GENRES_MAX }, (_, i) => `g${i}`).join(',') }).genres).toBeUndefined()
    const long = 'x'.repeat(GENRE_MAX_LENGTH + 1)
    expect(validateMetadata({ ...valid, genres: `Animation, ${long}` }).genres).toBe(
      `Le genre « ${long} » dépasse ${GENRE_MAX_LENGTH} caractères.`,
    )
  })

  it.each([['1887'], ['2101'], ['2008.5'], ['abc'], ['-5']])('refuse l’année %j', (year) => {
    expect(validateMetadata({ ...valid, year }).year).toBe('L’année doit être un nombre entier entre 1888 et 2100.')
  })

  it.each([['1888'], ['2100'], ['2008']])('accepte l’année %j', (year) => {
    expect(validateMetadata({ ...valid, year }).year).toBeUndefined()
  })

  it('signale tous les champs invalides à la fois', () => {
    expect(Object.keys(validateMetadata({ title: '', description: 'x'.repeat(2001), genres: 'x'.repeat(41), year: '1' })).sort()).toEqual([
      'description',
      'genres',
      'title',
      'year',
    ])
  })
})

describe('changesFrom', () => {
  it('ne renvoie rien quand rien n’a changé (espaces autour compris)', () => {
    expect(changesFrom(media, valid)).toEqual({})
    expect(changesFrom(media, { ...valid, title: '  Big Buck Bunny  ', genres: ' Animation ,Comédie ' })).toEqual({})
  })

  it('ne renvoie que les champs modifiés', () => {
    expect(changesFrom(media, { ...valid, title: 'Big Buck Bunny (HD)' })).toEqual({ title: 'Big Buck Bunny (HD)' })
    expect(changesFrom(media, { ...valid, year: '2009' })).toEqual({ year: 2009 })
    expect(changesFrom(media, { ...valid, genres: 'Animation' })).toEqual({ genres: ['Animation'] })
    expect(changesFrom(media, { ...valid, genres: 'Comédie, Animation' })).toEqual({ genres: ['Comédie', 'Animation'] })
  })

  it('permet d’effacer la description, pas l’année (non effaçable dans le contrat)', () => {
    expect(changesFrom(media, { ...valid, description: '   ' })).toEqual({ description: '' })
    expect(changesFrom(media, { ...valid, year: '' })).toEqual({})
  })

  it('gère un média sans description, genres ni année', () => {
    const bare = { title: 'Sans rien', description: null, genres: [], year: null }
    expect(changesFrom(bare, initialValues(bare))).toEqual({})
    expect(changesFrom(bare, { ...initialValues(bare), description: 'Nouvelle', genres: 'Drame', year: '1999' })).toEqual({
      description: 'Nouvelle',
      genres: ['Drame'],
      year: 1999,
    })
  })
})
