/**
 * MSW Server Setup for Node.js Environment
 *
 * This module configures the MSW server for use in Vitest tests.
 * It exports the server instance and utility functions for contract testing.
 */

import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { clearMockData, handlers } from './handlers.js'

// Create the MSW server with default handlers
export const server = setupServer(...handlers)

// Server lifecycle hooks for test setup
export function setupMswServer(): void {
  // Start server before all tests
  beforeAll(() => {
    server.listen({
      onUnhandledRequest: 'warn',
    })
  })

  // Reset handlers and mock data after each test
  afterEach(() => {
    server.resetHandlers()
    clearMockData()
  })

  // Close server after all tests
  afterAll(() => {
    server.close()
  })
}

export type {
  NpmPackageMetadata,
  NpmPackageVersion,
  OSVQueryResponse,
  OSVVulnerability,
} from './handlers.js'
// Re-export utilities
export {
  clearMockData,
  errorHandlers,
  handlers,
  mockCriticalVulnerability,
  mockNpmPackageMetadata,
  mockVulnerability,
  setMockDownloadStats,
  setMockPackageMetadata,
  setMockVulnerabilities,
} from './handlers.js'
