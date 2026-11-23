import { expect, test } from './support/fixtures.js'

/** Connexion par l'interface, puis choix du profil dans « Qui regarde ? ». */
async function loginAs(page, user, profileName) {
  await page.goto('/login')
  await page.getByLabel('Identifiant').fill(user.username)
  await page.getByLabel('Mot de passe').fill(user.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Qui regarde ?' })).toBeVisible()
  await page.getByRole('button', { name: profileName }).click()
  await expect(page.getByRole('link', { name: 'Catalogue' })).toBeVisible()
}

/** Catalogue, recherche du titre, ouverture de la fiche du film. */
async function openFilm(page, search) {
  await page.getByRole('link', { name: 'Catalogue' }).click()
  await page.getByLabel('Rechercher un titre').fill(search)
  const cards = page.locator('a[href^="/media/"]')
  await expect(cards).toHaveCount(1)
  await cards.first().click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(new RegExp(search, 'i'))
}

/** Bouton « Lecture » de la fiche, puis lecture lancée dans le lecteur. */
async function startPlayback(page) {
  await page.locator('.detail__actions a.btn--primary').click()
  await expect(page).toHaveURL(/\/watch\//)
  await page.getByRole('button', { name: 'Lire' }).click()
  await expect.poll(() => page.locator('video').evaluate((v) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(1)
}

test.describe('parcours principal', () => {
  test('connexion, profil, recherche et lecture', async ({ page, user }) => {
    await loginAs(page, user, 'Alice')
    await openFilm(page, 'sintel')

    // La fiche propose la lecture, le lecteur reçoit son ticket de streaming et la vidéo avance.
    await startPlayback(page)
    const state = await page.locator('video').evaluate((v) => ({ error: v.error?.code ?? null, duration: v.duration }))
    expect(state.error).toBeNull()
    expect(state.duration).toBeGreaterThan(60)

    // Pause, puis déplacement dans la vidéo (HTTP Range côté serveur).
    await page.getByRole('button', { name: 'Mettre en pause' }).click()
    await page.locator('video').evaluate((v) => { v.currentTime = 30 })
    await expect.poll(() => page.locator('video').evaluate((v) => v.currentTime), { timeout: 15_000 }).toBeGreaterThanOrEqual(30)
  })

  test('deux profils d\'un même compte ont des listes séparées', async ({ page, user }) => {
    await loginAs(page, user, 'Alice')
    await openFilm(page, 'sintel')
    await page.getByRole('button', { name: 'Ajouter à ma liste' }).click()
    await expect(page.getByRole('button', { name: 'Dans ma liste' })).toBeVisible()

    // Bob, sur le même compte, ne voit pas la liste d'Alice.
    await page.getByRole('button', { name: user.username }).click()
    await page.getByRole('link', { name: 'Changer de profil' }).click()
    await page.getByRole('button', { name: 'Bob' }).click()
    await openFilm(page, 'sintel')
    await expect(page.getByRole('button', { name: 'Ajouter à ma liste' })).toBeVisible()
  })

  test('reprise de lecture : la position enregistrée est proposée puis reprise (#65)', async ({ page, user }) => {
    await loginAs(page, user, 'Alice')
    await openFilm(page, 'sintel')
    await startPlayback(page)
    await page.locator('video').evaluate((v) => { v.currentTime = 40 })
    await expect.poll(() => page.locator('video').evaluate((v) => v.currentTime), { timeout: 15_000 }).toBeGreaterThanOrEqual(40)
    await page.getByRole('button', { name: 'Mettre en pause' }).click()   // la pause enregistre la position

    // De retour sur la fiche, le bouton propose de reprendre là où on s'est arrêté.
    await page.getByRole('link', { name: 'Retour à la fiche' }).click()
    const resume = page.locator('.detail__actions a.btn--primary')
    await expect(resume).toContainText(/Reprendre à 0:(4\d)/)
    await resume.click()
    await expect.poll(() => page.locator('video').evaluate((v) => v.currentTime), { timeout: 30_000 }).toBeGreaterThanOrEqual(39)
  })
})
