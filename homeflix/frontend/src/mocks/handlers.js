import { acquisitionHandlers } from '@/mocks/acquisition'
import { createDb } from '@/mocks/db'
import { identityHandlers } from '@/mocks/identity'
import { libraryHandlers } from '@/mocks/library'

/**
 * Handlers MSW des trois services, adossés à un état en mémoire.
 * @returns {{ db: ReturnType<typeof createDb>, handlers: import('msw').RequestHandler[] }}
 */
export function createMocks() {
  const db = createDb()
  return {
    db,
    handlers: [...identityHandlers(db), ...libraryHandlers(db), ...acquisitionHandlers(db)],
  }
}
