import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/authContext'
import IntroGate from '@/features/intro/IntroGate'
import LogoIntro from '@/features/intro/LogoIntro'
import { hasSeenIntro, INTRO_SEEN_KEY } from '@/features/intro/introSeen'

function renderGate(status = 'anonymous') {
  return render(
    <AuthContext.Provider value={{ status }}>
      <IntroGate>
        <p>page de connexion</p>
      </IntroGate>
    </AuthContext.Provider>,
  )
}

describe('IntroGate', () => {
  beforeEach(() => {
    sessionStorage.removeItem(INTRO_SEEN_KEY) // le setup de test marque l'intro comme vue
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('joue l’intro avant la connexion, avec le logo nommé et un bouton pour passer', () => {
    renderGate()
    expect(screen.getByRole('img', { name: 'Homeflix' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Passer l’intro' })).toHaveFocus()
    expect(screen.queryByText('page de connexion')).toBeNull()
  })

  it.each([
    ['le bouton', () => userEvent.click(screen.getByRole('button', { name: 'Passer l’intro' }))],
    ['Échap', () => userEvent.keyboard('{Escape}')],
    ['un clic sur l’écran', () => userEvent.click(screen.getByRole('img', { name: 'Homeflix' }))],
  ])('passe l’intro avec %s et ne la rejoue plus', async (_name, skip) => {
    renderGate()
    await skip()
    expect(screen.getByText('page de connexion')).toBeInTheDocument()
    expect(hasSeenIntro()).toBe(true)
  })

  it('se termine seule après 7 secondes', () => {
    vi.useFakeTimers()
    renderGate()
    act(() => vi.advanceTimersByTime(6900))
    expect(screen.queryByText('page de connexion')).toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByText('page de connexion')).toBeInTheDocument()
  })

  it('suit la chronologie : rotation après 1,2 s, pression sur le play après 5,3 s', () => {
    vi.useFakeTimers()
    const { container } = renderGate()
    const logo = container.querySelector('.logo-intro__logo')
    const shapes = container.querySelector('.logo-intro__shapes')
    expect(logo).toHaveClass('is-appearing')
    act(() => vi.advanceTimersByTime(1250))
    expect(logo).toHaveClass('is-turned')
    expect(shapes).not.toHaveClass('is-pressed')
    act(() => vi.advanceTimersByTime(4100))
    expect(shapes).toHaveClass('is-pressed')
  })

  it('ne joue rien quand l’intro a déjà été vue dans la session', () => {
    sessionStorage.setItem(INTRO_SEEN_KEY, '1')
    renderGate()
    expect(screen.getByText('page de connexion')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Homeflix' })).toBeNull()
  })

  it('ne joue rien pour qui est déjà connecté', () => {
    renderGate('authenticated')
    expect(screen.getByText('page de connexion')).toBeInTheDocument()
  })

  it('est sautée quand le système demande moins d’animations', () => {
    vi.stubGlobal('matchMedia', (query) => ({ matches: query.includes('reduce') }))
    renderGate()
    expect(screen.getByText('page de connexion')).toBeInTheDocument()
  })

  it('ne déclenche plus rien après son démontage', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    const { unmount } = render(<LogoIntro onDone={onDone} />)
    unmount()
    act(() => vi.advanceTimersByTime(8000))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('n’appelle onDone qu’une fois même si on la passe plusieurs fois', async () => {
    const onDone = vi.fn()
    render(<LogoIntro onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Passer l’intro' }))
    await userEvent.keyboard('{Escape}')
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
