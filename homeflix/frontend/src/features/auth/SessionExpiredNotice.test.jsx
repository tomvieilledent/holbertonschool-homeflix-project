import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import LoginPage from '@/features/auth/LoginPage'

describe('écran de session expirée', () => {
  it('explique l’expiration puis laisse se reconnecter en gardant la destination', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter([{ path: '/login', element: <LoginPage /> }], {
      initialEntries: [{ pathname: '/login', search: '?next=%2Fadmin', state: { reason: 'session-expired' } }],
    })
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('status')).toHaveTextContent('Session expirée')
    await user.click(screen.getByRole('button', { name: 'Se reconnecter' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?next=%2Fadmin')
  })
})
