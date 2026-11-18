import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Pagination, { pageWindow } from '@/components/Pagination'

const hrefFor = (page) => `/liste?page=${page}`

function renderPagination(props) {
  const router = createMemoryRouter(
    [{ path: '/liste', element: <Pagination hrefFor={hrefFor} {...props} /> }],
    { initialEntries: ['/liste'] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

describe('pageWindow', () => {
  it.each([
    [1, 3, [1, 2, 3]],
    [1, 10, [1, 2, null, 10]],
    [5, 10, [1, null, 4, 5, 6, null, 10]],
    [10, 10, [1, null, 9, 10]],
    [2, 4, [1, 2, 3, 4]],
  ])('page %s sur %s', (current, total, expected) => {
    expect(pageWindow(current, total)).toEqual(expected)
  })
})

describe('Pagination', () => {
  it('n’affiche rien pour une seule page', () => {
    renderPagination({ page: 1, totalPages: 1 })
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('marque la page courante et dit où l’on est', () => {
    renderPagination({ page: 3, totalPages: 5 })
    expect(screen.getByRole('link', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Page 2' })).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Page 3 sur 5')).toBeInTheDocument()
  })

  it('désactive « Précédent » sur la première page et « Suivant » sur la dernière', () => {
    const { unmount } = renderPagination({ page: 1, totalPages: 3 })
    expect(screen.queryByRole('link', { name: 'Page précédente' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Page suivante' })).toHaveAttribute('href', '/liste?page=2')
    unmount()

    renderPagination({ page: 3, totalPages: 3 })
    expect(screen.queryByRole('link', { name: 'Page suivante' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Page précédente' })).toHaveAttribute('href', '/liste?page=2')
  })

  it('s’utilise au clavier : Tab jusqu’au lien puis Entrée', async () => {
    const user = userEvent.setup()
    const { router } = renderPagination({ page: 1, totalPages: 3 })
    await user.tab()
    expect(screen.getByRole('link', { name: 'Page 1' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(router.state.location.search).toBe('?page=2')
  })
})
