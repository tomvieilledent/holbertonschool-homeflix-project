import { test as base, expect } from '@playwright/test'
import {
  adminCredentials, createUserWithProfiles, deleteAccount, login, newApi,
} from './api.js'

/**
 * Chaque test reçoit son propre compte (`user`) avec les profils Alice et Bob, créé par l'API et supprimé à la fin :
 * les tests ne dépendent ni de l'ordre ni des données des autres.
 */
export const test = base.extend({
  api: async ({}, use) => {
    const api = await newApi()
    await use(api)
    await api.dispose()
  },
  adminToken: async ({ api }, use) => {
    const { username, password } = adminCredentials()
    await use(await login(api, username, password))
  },
  user: async ({ api, adminToken }, use) => {
    const user = await createUserWithProfiles(api, adminToken)
    await use(user)
    await deleteAccount(api, adminToken, user.accountId)
  },
})

export { expect }
