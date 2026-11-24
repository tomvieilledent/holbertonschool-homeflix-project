import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'
import { markIntroSeen } from '@/features/intro/introSeen'

// L'intro du logo précède la connexion ; les tests des écrans partent de « intro déjà vue ».
beforeEach(() => markIntroSeen())
