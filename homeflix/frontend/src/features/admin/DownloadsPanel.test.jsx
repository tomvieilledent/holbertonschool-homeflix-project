import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DownloadsPanel, { DOWNLOAD_STATES, isActiveDownload } from '@/features/admin/DownloadsPanel'
import { ApiError } from '@/services/apiError'

const download = (id, title, state, overrides = {}) => ({
  id,
  catalogueEntryId: `e-${id}`,
  title,
  state,
  progressPercent: 0,
  errorCode: null,
  libraryMediaId: null,
  createdAt: '2026-11-23T10:05:00Z',
  finishedAt: null,
  ...overrides,
})

const SAMPLE = [
  download('d1', 'Film en file', 'QUEUED'),
  download('d2', 'Film en cours', 'DOWNLOADING', { progressPercent: 45 }),
  download('d3', 'Film terminé', 'COMPLETED', { progressPercent: 100, libraryMediaId: 'm9' }),
  download('d4', 'Film échoué', 'FAILED', { progressPercent: 12, errorCode: 'NO_PEERS' }),
  download('d5', 'Film annulé', 'CANCELLED', { progressPercent: 30 }),
]

const renderPanel = (items = SAMPLE, props = {}) =>
  render(
    <MemoryRouter>
      <DownloadsPanel downloads={{ items, total: items.length }} stalled={false} onResume={vi.fn()} onCancel={vi.fn().mockResolvedValue()} {...props} />
    </MemoryRouter>,
  )

const rowOf = (title) => screen.getByRole('row', { name: new RegExp(`^${title}`) })

describe('DownloadsPanel : rendu des états', () => {
  it('chaque état a son texte, et les quatre états demandés sont distincts', () => {
    renderPanel()
    expect(within(rowOf('Film en file')).getByText('En file d’attente')).toBeInTheDocument()
    expect(within(rowOf('Film en cours')).getByText('En cours')).toBeInTheDocument()
    expect(within(rowOf('Film terminé')).getByText('Terminé')).toBeInTheDocument()
    expect(within(rowOf('Film échoué')).getByText('Échoué')).toBeInTheDocument()
    expect(within(rowOf('Film annulé')).getByText('Annulé')).toBeInTheDocument()
  })

  it('chaque état a aussi sa classe, son symbole et sa teinte : la couleur ne porte jamais seule l’information', () => {
    renderPanel()
    const badges = Object.keys(DOWNLOAD_STATES).map((state) => {
      const row = document.querySelector(`tr[data-state="${state}"]`)
      return row.querySelector('.download-state')
    })
    expect(new Set(badges.map((badge) => badge.className)).size).toBe(5)
    expect(new Set(badges.map((badge) => badge.textContent.trim())).size).toBe(5)
    expect(new Set(Object.values(DOWNLOAD_STATES).map((state) => state.glyph)).size).toBe(5)
    for (const badge of badges) expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull() // le symbole est décoratif
  })

  it('affiche la progression de chaque téléchargement, en barre et en texte', () => {
    renderPanel()
    const bar = within(rowOf('Film en cours')).getByRole('progressbar', { name: 'Progression de « Film en cours »' })
    expect(bar).toHaveAttribute('value', '45')
    expect(within(rowOf('Film en cours')).getByText('45 %')).toBeInTheDocument()
    expect(within(rowOf('Film en file')).getByText('0 %')).toBeInTheDocument()
    expect(within(rowOf('Film terminé')).getByText('100 %')).toBeInTheDocument()
  })

  it.each([
    ['NO_PEERS', 'Aucune source n’est disponible pour ce fichier pour le moment.'],
    ['DISK_FULL', 'L’espace disque est insuffisant pour ce téléchargement.'],
    ['TORRENT_CLIENT_UNAVAILABLE', 'Le service de téléchargement est injoignable. Réessayez plus tard.'],
    ['CODE_INCONNU', 'Une erreur est survenue. Réessayez dans un instant.'],
    [null, 'Une erreur est survenue. Réessayez dans un instant.'],
  ])('un téléchargement échoué (%s) est expliqué en français, sans détail technique', (errorCode, message) => {
    renderPanel([download('d4', 'Film échoué', 'FAILED', { errorCode, errorMessage: 'java.io.IOException: /downloads/x.part' })])
    expect(within(rowOf('Film échoué')).getByText(message)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('IOException')
  })

  it('n’affiche l’erreur que pour un téléchargement échoué', () => {
    renderPanel()
    expect(screen.getAllByText(/Aucune source n’est disponible/)).toHaveLength(1)
  })

  it('propose d’annuler uniquement ce qui est en file ou en cours', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Annuler le téléchargement de Film en file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler le téléchargement de Film en cours' })).toBeInTheDocument()
    for (const title of ['Film terminé', 'Film échoué', 'Film annulé']) expect(within(rowOf(title)).queryByRole('button')).not.toBeInTheDocument()
    expect(SAMPLE.filter(isActiveDownload).map((item) => item.state)).toEqual(['QUEUED', 'DOWNLOADING'])
  })

  it('un téléchargement terminé renvoie vers le film dans la bibliothèque', () => {
    renderPanel()
    expect(within(rowOf('Film terminé')).getByRole('link', { name: 'Voir dans la bibliothèque : Film terminé' })).toHaveAttribute('href', '/media/m9')
  })

  it('explique quand il n’y a aucun téléchargement', () => {
    renderPanel([])
    expect(screen.getByText(/Aucun téléchargement pour le moment/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('dit quand seuls les plus récents sont affichés', () => {
    render(
      <MemoryRouter>
        <DownloadsPanel downloads={{ items: SAMPLE, total: 120 }} stalled={false} onResume={vi.fn()} onCancel={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Les 5 téléchargements les plus récents sont affichés (120 au total).')).toBeInTheDocument()
  })

  it('signale un suivi interrompu et propose de le reprendre', async () => {
    const onResume = vi.fn()
    renderPanel(SAMPLE, { stalled: true, onResume })
    expect(screen.getByRole('alert')).toHaveTextContent('Le suivi des téléchargements est interrompu')
    await userEvent.click(screen.getByRole('button', { name: 'Reprendre le suivi' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })
})

describe('DownloadsPanel : annulation confirmée', () => {
  it('demande confirmation avec des libellés qui ne se confondent pas, et n’annule rien avant', async () => {
    const onCancel = vi.fn().mockResolvedValue()
    renderPanel(SAMPLE, { onCancel })
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le téléchargement de Film en cours' }))

    const dialog = screen.getByRole('dialog', { name: 'Annuler le téléchargement de « Film en cours » ?' })
    expect(within(dialog).getByText(/Le téléchargement sera arrêté/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Garder le téléchargement' })).toHaveFocus()
    expect(onCancel).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Garder le téléchargement' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('annule le bon téléchargement après confirmation, puis ferme', async () => {
    const onCancel = vi.fn().mockResolvedValue()
    renderPanel(SAMPLE, { onCancel })
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le téléchargement de Film en file' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler le téléchargement' }))
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('un échec est expliqué dans la fenêtre, qui reste ouverte', async () => {
    renderPanel(SAMPLE, { onCancel: vi.fn().mockRejectedValue(new ApiError(503, 'TORRENT_CLIENT_UNAVAILABLE')) })
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le téléchargement de Film en cours' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler le téléchargement' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Le service de téléchargement est injoignable.')
  })
})
