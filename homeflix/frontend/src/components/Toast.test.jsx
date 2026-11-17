import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ToastProvider from '@/components/Toast'
import { useToast } from '@/components/toastContext'

function Trigger({ message = 'Enregistré', options }) {
  const { show } = useToast()
  return (
    <button type="button" onClick={() => show(message, options)}>
      Notifier
    </button>
  )
}

const setup = (props) =>
  render(
    <ToastProvider>
      <Trigger {...props} />
    </ToastProvider>,
  )

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('affiche le message dans une région aria-live', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = setup()
    await user.click(screen.getByRole('button', { name: 'Notifier' }))
    expect(screen.getByRole('status')).toHaveTextContent('Enregistré')
    expect(container.parentElement.querySelector('[aria-live="polite"]')).toContainElement(
      screen.getByRole('status'),
    )
  })

  it('utilise role="alert" pour une erreur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup({ message: 'Échec', options: { variant: 'error' } })
    await user.click(screen.getByRole('button', { name: 'Notifier' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Échec')
  })

  it('se ferme seul après la durée', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup({ options: { duration: 1000 } })
    await user.click(screen.getByRole('button', { name: 'Notifier' }))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1001))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('met le minuteur en pause au survol', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup({ options: { duration: 1000 } })
    await user.click(screen.getByRole('button', { name: 'Notifier' }))
    await user.hover(screen.getByRole('status'))
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('se ferme avec le bouton de fermeture', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup({ options: { duration: 0 } })
    await user.click(screen.getByRole('button', { name: 'Notifier' }))
    await user.click(screen.getByRole('button', { name: 'Fermer la notification' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
