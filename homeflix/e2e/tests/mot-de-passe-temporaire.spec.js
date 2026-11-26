import { IDENTITY, bearer, login, randomPassword } from './support/api.js'
import { expect, test } from './support/fixtures.js'

// Après une réinitialisation par un administrateur, le titulaire doit choisir un nouveau mot de passe (#223, #274).

test('mot de passe temporaire : changement obligatoire, puis accès rétabli', async ({ page, api, adminToken, user }) => {
  const temporary = randomPassword()
  const chosen = randomPassword()
  const reset = await api.post(`${IDENTITY}/admin/accounts/${user.accountId}/password-reset`, {
    headers: bearer(adminToken),
    data: { temporaryPassword: temporary },
  })
  expect(reset.status()).toBe(204)

  await page.goto('/login')
  await page.getByLabel('Identifiant').fill(user.username)
  await page.getByLabel('Mot de passe').fill(temporary)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  const title = page.getByRole('heading', { name: 'Choisissez un nouveau mot de passe' })
  await expect(title).toBeVisible()

  // Une autre adresse ramène au même écran, y compris après un rechargement.
  await page.waitForLoadState('networkidle')
  await page.goto('/catalogue')
  await expect(title).toBeVisible()

  await page.getByLabel('Mot de passe temporaire').fill(temporary)
  await page.getByLabel('Nouveau mot de passe', { exact: false }).first().fill(chosen)
  await page.getByLabel('Confirmer le nouveau mot de passe').fill(chosen)
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click()

  await expect(page.getByRole('heading', { name: 'Qui regarde ?' })).toBeVisible()
  await page.getByRole('button', { name: 'Alice' }).click()
  await expect(page.getByRole('link', { name: 'Catalogue' })).toBeVisible()

  // La nouvelle session tient au rechargement, et seul le nouveau mot de passe fonctionne.
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(page.getByRole('link', { name: 'Catalogue' })).toBeVisible()
  expect(await login(api, user.username, chosen)).toBeTruthy()
  expect(await login(api, user.username, temporary)).toBeNull()
})
