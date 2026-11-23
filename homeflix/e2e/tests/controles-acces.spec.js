import { expect, test } from './support/fixtures.js'

test.describe('contrôles d\'accès', () => {
  test('un mot de passe incorrect est refusé avec un message', async ({ page, user }) => {
    await page.goto('/login')
    await page.getByLabel('Identifiant').fill(user.username)
    await page.getByLabel('Mot de passe').fill('un-mauvais-mot-de-passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('sans connexion, une page protégée renvoie vers la connexion', async ({ page }) => {
    await page.goto('/catalogue')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  })

  test('un utilisateur simple n\'accède pas à l\'administration', async ({ page, user }) => {
    await page.goto('/login')
    await page.getByLabel('Identifiant').fill(user.username)
    await page.getByLabel('Mot de passe').fill(user.password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.getByRole('button', { name: 'Alice' }).click()
    // On attend l'application chargée (menu visible) avant de naviguer : sinon la redirection vers l'accueil,
    // qui suit le choix du profil, écraserait la navigation vers /admin.
    await expect(page.getByRole('link', { name: 'Catalogue' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0)
    // Navigation dans l'application (sans rechargement) : un rechargement perdrait le profil actif (#222).
    await page.evaluate(() => {
      window.history.pushState({}, '', '/admin')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByText('Accès refusé')).toBeVisible()
  })
})
