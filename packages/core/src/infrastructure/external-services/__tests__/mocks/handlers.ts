/**
 * MSW Request Handlers for Contract Tests
 *
 * These handlers mock external API responses for contract testing.
 * They simulate the real API contracts to ensure our services
 * correctly handle various response scenarios.
 */

import { HttpResponse, http } from 'msw'

// OSV API Types
export interface OSVVulnerability {
  id: string
  aliases?: string[]
  summary?: string
  details?: string
  severity?: Array<{
    type: string
    score: string
  }>
  affected?: Array<{
    ranges?: Array<{
      type: string
      events: Array<{ introduced?: string; fixed?: string }>
    }>
    versions?: string[]
  }>
  references?: Array<{
    type: string
    url: string
  }>
  published?: string
  database_specific?: {
    severity?: string
    cvss?: {
      score?: number
    }
  }
}

export interface OSVQueryResponse {
  vulns?: OSVVulnerability[]
}

// npm Registry Types
export interface NpmPackageVersion {
  name: string
  version: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  repository?: { url?: string; directory?: string } | string
}

export interface NpmPackageMetadata {
  name: string
  'dist-tags': {
    latest: string
    [tag: string]: string
  }
  versions: Record<string, NpmPackageVersion>
  time?: Record<string, string>
}

// Mock Data
export const mockVulnerability: OSVVulnerability = {
  id: 'GHSA-test-1234',
  aliases: ['CVE-2023-12345'],
  summary: 'Test vulnerability summary',
  details: 'Detailed description of the vulnerability',
  severity: [
    {
      type: 'CVSS_V3',
      score: '7.5',
    },
  ],
  affected: [
    {
      ranges: [
        {
          type: 'ECOSYSTEM',
          events: [{ introduced: '1.0.0' }, { fixed: '1.2.0' }],
        },
      ],
    },
  ],
  references: [
    {
      type: 'ADVISORY',
      url: 'https://github.com/advisories/GHSA-test-1234',
    },
  ],
  published: '2023-01-15T00:00:00Z',
  database_specific: {
    severity: 'HIGH',
    cvss: {
      score: 7.5,
    },
  },
}

export const mockCriticalVulnerability: OSVVulnerability = {
  id: 'GHSA-critical-5678',
  aliases: ['CVE-2023-99999'],
  summary: 'Critical vulnerability in test package',
  details: 'A critical security flaw allowing remote code execution',
  severity: [
    {
      type: 'CVSS_V3',
      score: '9.8',
    },
  ],
  affected: [
    {
      ranges: [
        {
          type: 'ECOSYSTEM',
          events: [{ introduced: '0.0.0' }, { fixed: '2.0.0' }],
        },
      ],
    },
  ],
  references: [
    {
      type: 'ADVISORY',
      url: 'https://github.com/advisories/GHSA-critical-5678',
    },
  ],
  published: '2023-06-01T00:00:00Z',
  database_specific: {
    severity: 'CRITICAL',
    cvss: {
      score: 9.8,
    },
  },
}

export const mockNpmPackageMetadata: NpmPackageMetadata = {
  name: 'test-package',
  'dist-tags': {
    latest: '2.0.0',
    next: '3.0.0-beta.1',
  },
  versions: {
    '1.0.0': {
      name: 'test-package',
      version: '1.0.0',
      dependencies: {
        lodash: '^4.17.0',
      },
    },
    '1.1.0': {
      name: 'test-package',
      version: '1.1.0',
      dependencies: {
        lodash: '^4.17.21',
      },
    },
    '2.0.0': {
      name: 'test-package',
      version: '2.0.0',
      dependencies: {
        lodash: '^4.17.21',
      },
    },
  },
  time: {
    '1.0.0': '2022-01-01T00:00:00Z',
    '1.1.0': '2022-06-01T00:00:00Z',
    '2.0.0': '2023-01-01T00:00:00Z',
  },
}

// Handler state for dynamic responses
type VulnerabilityMap = Map<string, OSVVulnerability[]>
type PackageMetadataMap = Map<string, NpmPackageMetadata>
type DownloadStatsMap = Map<string, number>

let vulnerabilityStore: VulnerabilityMap = new Map()
let packageMetadataStore: PackageMetadataMap = new Map()
let downloadStatsStore: DownloadStatsMap = new Map()

// Helper functions to set mock data
export function setMockVulnerabilities(
  packageName: string,
  version: string,
  vulns: OSVVulnerability[]
): void {
  vulnerabilityStore.set(`${packageName}@${version}`, vulns)
}

export function setMockPackageMetadata(packageName: string, metadata: NpmPackageMetadata): void {
  packageMetadataStore.set(packageName, metadata)
}

export function setMockDownloadStats(
  packageName: string,
  period: 'last-day' | 'last-week' | 'last-month',
  downloads: number
): void {
  downloadStatsStore.set(`${packageName}@${period}`, downloads)
}

export function clearMockData(): void {
  vulnerabilityStore = new Map()
  packageMetadataStore = new Map()
  downloadStatsStore = new Map()
}

// Default handlers
export const handlers = [
  // OSV API - Query vulnerabilities
  http.post('https://api.osv.dev/v1/query', async ({ request }) => {
    const body = (await request.json()) as {
      package: { name: string; ecosystem: string }
      version: string
    }

    const packageName = body.package.name
    const version = body.version
    const key = `${packageName}@${version}`

    // Check for stored mock data
    const storedVulns = vulnerabilityStore.get(key)
    if (storedVulns !== undefined) {
      return HttpResponse.json({
        vulns: storedVulns.length > 0 ? storedVulns : undefined,
      } as OSVQueryResponse)
    }

    // Default: no vulnerabilities
    return HttpResponse.json({} as OSVQueryResponse)
  }),

  // npm Registry - Get package metadata
  http.get('https://registry.npmjs.org/:packageName', ({ params }) => {
    const packageName = params.packageName as string

    // Check for stored mock data
    const storedMetadata = packageMetadataStore.get(packageName)
    if (storedMetadata) {
      return HttpResponse.json(storedMetadata)
    }

    // Return default metadata
    return HttpResponse.json({
      ...mockNpmPackageMetadata,
      name: packageName,
    })
  }),

  // npm Registry - Get specific version
  http.get('https://registry.npmjs.org/:packageName/:version', ({ params }) => {
    const packageName = params.packageName as string
    const version = params.version as string

    // Check for stored mock data
    const storedMetadata = packageMetadataStore.get(packageName)
    if (storedMetadata?.versions[version]) {
      return HttpResponse.json(storedMetadata.versions[version])
    }

    // Return default version metadata
    return HttpResponse.json({
      name: packageName,
      version: version,
      dependencies: {},
    } as NpmPackageVersion)
  }),

  // npm Registry - Search packages
  http.get('https://registry.npmjs.org/-/v1/search', () => {
    // Return empty search results by default
    return HttpResponse.json({
      objects: [],
      total: 0,
      time: new Date().toISOString(),
    })
  }),

  // npm Downloads API - Get download stats
  // Use wildcard (*) to match scoped packages like @scope/package
  http.get('https://api.npmjs.org/downloads/point/:period/*', ({ params, request }) => {
    const period = params.period as string
    // Extract package name from URL (handles both regular and scoped packages)
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/downloads/point/')
    const packagePath = pathParts[1] || ''
    const packageName = packagePath.substring(packagePath.indexOf('/') + 1)

    // Check for stored mock data
    const downloads = downloadStatsStore.get(`${packageName}@${period}`)
    if (downloads !== undefined) {
      return HttpResponse.json({
        downloads,
        package: packageName,
        start: '2024-01-01',
        end: '2024-01-07',
      })
    }

    // Return default download count
    return HttpResponse.json({
      downloads: 10000,
      package: packageName,
      start: '2024-01-01',
      end: '2024-01-07',
    })
  }),
]

// Error scenario handlers
export const errorHandlers = {
  osvTimeout: http.post('https://api.osv.dev/v1/query', async () => {
    // Simulate timeout by delaying response
    await new Promise((resolve) => setTimeout(resolve, 15000))
    return HttpResponse.json({})
  }),

  osv500: http.post('https://api.osv.dev/v1/query', () => {
    return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })
  }),

  osv429: http.post('https://api.osv.dev/v1/query', () => {
    return new HttpResponse(null, { status: 429, statusText: 'Too Many Requests' })
  }),

  npmNotFound: http.get('https://registry.npmjs.org/:packageName', () => {
    return new HttpResponse(null, { status: 404, statusText: 'Not Found' })
  }),

  npmTimeout: http.get('https://registry.npmjs.org/:packageName', async () => {
    await new Promise((resolve) => setTimeout(resolve, 15000))
    return HttpResponse.json({})
  }),
}
