import { LIBRARY, adminCredentials, bearer, randomName, randomPassword } from './support/api.js'
import { expect, test } from './support/fixtures.js'

// Parcours administrateur contre les vrais services (#104). Chaque test remet la pile dans l'état où il l'a trouvée.
// Volontairement absents : retirer un dossier (ses films seraient réindexés en double) et lancer un téléchargement
// (trafic pair-à-pair réel).

/** Connexion de l'administrateur par l'interface, puis ouverture d'une page d'administration. */
async function openAdmin(page, path, heading) {
  const { username, password } = adminCredentials()
  await page.goto('/login')
  await page.getByLabel('Identifiant').fill(username)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.waitForLoadState('networkidle')
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
}

test.describe('administration', () => {
  test('comptes : création, désactivation, réactivation et suppression', async ({ page }) => {
    const username = randomName('e2e-admin-ui')
    await openAdmin(page, '/admin/comptes', 'Comptes')
    const dialog = page.getByRole('dialog')
    const row = page.getByRole('row').filter({ hasText: username })

    await page.getByRole('button', { name: 'Créer un compte' }).click()
    await dialog.getByLabel('Identifiant').fill(username)
    await dialog.getByLabel('Adresse e-mail').fill(`${username}@example.test`)
    await dialog.getByLabel('Mot de passe').fill(randomPassword())
    await dialog.getByRole('button', { name: 'Créer le compte' }).click()
    await expect(page.getByText(`Compte « ${username} » créé.`)).toBeVisible()
    // La liste est paginée : le compte peut être sur une autre page que la première.
    for (let next = 2; !(await row.count()) && next <= 10; next++) {
      await page.goto(`/admin/comptes?page=${next}`)
      await page.waitForLoadState('networkidle')
    }

    await page.getByRole('button', { name: `Désactiver le compte ${username}` }).click()
    await dialog.getByRole('button', { name: 'Désactiver le compte' }).click()
    await expect(row).toContainText('Désactivé')
    await page.getByRole('button', { name: `Activer le compte ${username}` }).click()
    await expect(row).toContainText('Actif')

    await page.getByRole('button', { name: `Supprimer le compte ${username}` }).click()
    await dialog.getByRole('button', { name: 'Supprimer le compte' }).click()
    await expect(page.getByText(`Compte « ${username} » supprimé.`)).toBeVisible()
    await expect(row).toHaveCount(0)
  })

  test('bibliothèque : un dossier interdit est expliqué, puis une indexation va au bout', async ({ page }) => {
    await openAdmin(page, '/admin/bibliotheque', 'Bibliothèque')
    await page.getByRole('button', { name: 'Ajouter un dossier' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Chemin du dossier').fill('/etc')
    await dialog.getByRole('button', { name: 'Vérifier le dossier' }).click()
    await expect(dialog.getByRole('alert')).toContainText('emplacement autorisé')
    await expect(dialog.getByRole('button', { name: 'Ajouter le dossier' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Annuler' }).click()

    const launched = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/admin/index'))
    await page.getByRole('button', { name: 'Lancer l’indexation' }).click()
    expect((await launched).status()).toBe(202)
    await expect(page.getByText(/Indexation terminée/)).toBeVisible({ timeout: 60_000 })
  })

  test('médias : la description corrigée est enregistrée', async ({ page, api, adminToken }) => {
    const found = await (await api.get(`${LIBRARY}/media?q=sintel`, { headers: bearer(adminToken) })).json()
    const film = found.items[0]
    const description = `Description d’essai ${randomName('e2e')}`
    try {
      await openAdmin(page, '/admin/medias', 'Médias')
      await page.getByLabel('Rechercher un titre').fill(film.title)
      await page.getByRole('button', { name: 'Rechercher' }).click()
      await page.getByRole('button', { name: `Modifier ${film.title}`, exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Description').fill(description)
      await dialog.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(dialog).toHaveCount(0)
      const saved = await (await api.get(`${LIBRARY}/media/${film.id}`, { headers: bearer(adminToken) })).json()
      expect(saved.description).toBe(description)
    } finally {
      await api.patch(`${LIBRARY}/admin/media/${film.id}`, {
        headers: bearer(adminToken),
        data: { description: film.description ?? '' },
      })
    }
  })

  test('fenêtres sur un petit téléphone : tous les boutons restent entiers', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await openAdmin(page, '/admin/bibliotheque', 'Bibliothèque')
    await page.getByRole('button', { name: 'Ajouter un dossier' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeVisible()
    const frame = await dialog.boundingBox()
    for (const button of await dialog.getByRole('button').all()) {
      const box = await button.boundingBox()
      const label = await button.textContent()
      expect(box.x, `« ${label} » sort à gauche`).toBeGreaterThanOrEqual(frame.x)
      expect(box.x + box.width, `« ${label} » sort à droite`).toBeLessThanOrEqual(frame.x + frame.width)
    }
  })

  test('acquisition et services : catalogue autorisé et trois services opérationnels', async ({ page }) => {
    await openAdmin(page, '/admin/acquisition', 'Acquisition')
    await expect(page.getByRole('table', { name: 'Contenus autorisés au téléchargement' })).toContainText('Sintel')
    await expect(page.getByRole('heading', { name: 'Téléchargements' })).toBeVisible()

    await page.getByRole('link', { name: 'Services', exact: true }).click()
    const services = page.getByRole('list', { name: 'Services' }).getByRole('listitem')
    await expect(services).toHaveCount(3)
    for (const service of await services.all()) await expect(service).toContainText('Opérationnel')
  })
})
