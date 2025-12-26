/**
 * Vitest Setup File
 *
 * This file runs before all tests to ensure proper mocking of @pcu/utils
 * to avoid ConfigManager initialization issues during logger instantiation.
 *
 * For tests that need configurable mocks, use the shared mock utilities:
 * ```typescript
 * import { mockControls, createPcuUtilsMock } from '../../__tests__/shared/mockUtils.js'
 *
 * const mocks = vi.hoisted(() => mockControls())
 * vi.mock('@pcu/utils', () => createPcuUtilsMock(mocks))
 * ```
 */

import { vi } from 'vitest'
import { createPcuUtilsMock } from './src/__tests__/shared/mockUtils.js'

// Mock the entire @pcu/utils module with default configuration
vi.mock('@pcu/utils', () => createPcuUtilsMock())
