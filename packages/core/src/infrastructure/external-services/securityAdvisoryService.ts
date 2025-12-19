/**
 * Security Advisory Service
 *
 * Provides real-time security vulnerability data from OSV (Open Source Vulnerabilities).
 * Uses the OSV API to query known vulnerabilities for npm packages.
 *
 * @see https://osv.dev/
 */

export interface VulnerabilityInfo {
  id: string;
  aliases: string[]; // CVE IDs, GHSA IDs, etc.
  summary: string;
  details: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  cvssScore?: number;
  affectedVersions: string;
  fixedVersions: string[];
  references: string[];
  publishedAt?: string;
}

export interface SecurityAdvisoryReport {
  packageName: string;
  version: string;
  vulnerabilities: VulnerabilityInfo[];
  hasCriticalVulnerabilities: boolean;
  hasHighVulnerabilities: boolean;
  totalVulnerabilities: number;
  queriedAt: Date;
  source: 'osv' | 'npm-audit' | 'github-advisory';
}

interface OSVQueryResponse {
  vulns?: OSVVulnerability[];
}

interface OSVVulnerability {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected?: Array<{
    ranges?: Array<{
      type: string;
      events: Array<{ introduced?: string; fixed?: string }>;
    }>;
    versions?: string[];
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
  published?: string;
  database_specific?: {
    severity?: string;
    cvss?: {
      score?: number;
    };
  };
}

export class SecurityAdvisoryService {
  private readonly cache: Map<string, { data: SecurityAdvisoryReport; timestamp: number }> =
    new Map();
  private readonly cacheTimeout: number;
  private readonly timeout: number;
  private readonly checkEcosystem: boolean;

  constructor(options: { cacheMinutes?: number; timeout?: number; checkEcosystem?: boolean } = {}) {
    this.cacheTimeout = (options.cacheMinutes ?? 30) * 60 * 1000; // Default 30 minutes
    this.timeout = options.timeout ?? 10000; // Default 10 seconds
    this.checkEcosystem = options.checkEcosystem ?? true; // Default to checking ecosystem packages
  }

  /**
   * Discover related packages by:
   * 1. Inspecting the package's actual dependencies
   * 2. Finding sibling packages in the same monorepo (via repository URL)
   */
  private async discoverEcosystemPackages(packageName: string, version: string): Promise<string[]> {
    const relatedPackages: string[] = [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      // Fetch the package's package.json from npm registry
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as {
          dependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
          optionalDependencies?: Record<string, string>;
          repository?: { url?: string; directory?: string } | string;
        };

        // 1. Collect all dependencies
        const allDeps = new Set<string>();

        if (data.dependencies) {
          for (const dep of Object.keys(data.dependencies)) {
            allDeps.add(dep);
          }
        }

        if (data.peerDependencies) {
          for (const dep of Object.keys(data.peerDependencies)) {
            allDeps.add(dep);
          }
        }

        if (data.optionalDependencies) {
          for (const dep of Object.keys(data.optionalDependencies)) {
            allDeps.add(dep);
          }
        }

        for (const dep of allDeps) {
          if (!relatedPackages.includes(dep)) {
            relatedPackages.push(dep);
          }
        }

        // 2. If this is a monorepo package (has repository.directory), find sibling packages
        const repoUrl =
          typeof data.repository === 'string' ? data.repository : data.repository?.url;
        const repoDir =
          typeof data.repository === 'object' ? data.repository?.directory : undefined;

        if (repoUrl && repoDir) {
          // This is a monorepo package, try to find siblings
          const siblingPackages = await this.findMonorepoSiblings(packageName, repoUrl, version);
          for (const sibling of siblingPackages) {
            if (!relatedPackages.includes(sibling)) {
              relatedPackages.push(sibling);
            }
          }
        }
      }
    } catch {
      // Silently ignore failures - this is best-effort discovery
    }

    return relatedPackages;
  }

  /**
   * Find sibling packages in the same monorepo by:
   * 1. Searching npm for packages with related names
   * 2. Verifying they share the same repository URL
   * 3. Confirming they have the same version
   */
  private async findMonorepoSiblings(
    packageName: string,
    repoUrl: string,
    version: string
  ): Promise<string[]> {
    const siblings: string[] = [];
    const normalizedRepoUrl = this.normalizeRepoUrl(repoUrl);

    try {
      // Search for packages using multiple search strategies to find monorepo siblings
      // These patterns cover common monorepo package naming conventions
      const searchQueries = [
        `${packageName}-dom`, // e.g., react-dom
        `${packageName}-server`, // e.g., react-server
        `${packageName}-server-dom`, // e.g., react-server-dom-webpack
        `${packageName}-native`, // e.g., react-native
        `${packageName}-test`, // e.g., react-test-renderer
        `${packageName}-reconciler`, // e.g., react-reconciler
        `${packageName}-refresh`, // e.g., react-refresh
        `${packageName}-devtools`, // e.g., react-devtools
      ];

      const foundPackages = new Set<string>();

      for (const query of searchQueries) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(
            `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=50`,
            { signal: controller.signal }
          );

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = (await response.json()) as {
              objects?: Array<{ package: { name: string } }>;
            };

            if (data.objects) {
              for (const obj of data.objects) {
                const pkgName = obj.package.name;
                // Only consider packages that start with the main package name
                if (pkgName.startsWith(`${packageName}-`) && pkgName !== packageName) {
                  foundPackages.add(pkgName);
                }
              }
            }
          }
        } catch {
          // Continue with next search query
        }
      }

      // Verify each found package:
      // 1. Has the same version
      // 2. Shares the same repository URL (confirms it's from the same monorepo)
      for (const pkgName of foundPackages) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(
            `https://registry.npmjs.org/${encodeURIComponent(pkgName)}/${encodeURIComponent(version)}`,
            { signal: controller.signal }
          );

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = (await response.json()) as {
              repository?: { url?: string } | string;
            };

            // Verify it's from the same repository
            const pkgRepoUrl =
              typeof data.repository === 'string' ? data.repository : data.repository?.url;

            if (pkgRepoUrl && this.normalizeRepoUrl(pkgRepoUrl) === normalizedRepoUrl) {
              siblings.push(pkgName);
            }
          }
        } catch {
          // Skip packages we can't verify
        }
      }
    } catch {
      // Silently ignore failures
    }

    return siblings;
  }

  /**
   * Normalize repository URL for comparison
   * e.g., "git+https://github.com/facebook/react.git" -> "github.com/facebook/react"
   */
  private normalizeRepoUrl(url: string): string {
    return url
      .replace(/^git\+/, '')
      .replace(/\.git$/, '')
      .replace(/^https?:\/\//, '')
      .replace(/^git:\/\//, '')
      .toLowerCase();
  }

  /**
   * Query vulnerabilities for a specific package version
   * Also checks ecosystem packages (e.g., react-server-dom-* for react) if enabled
   */
  async queryVulnerabilities(
    packageName: string,
    version: string
  ): Promise<SecurityAdvisoryReport> {
    const cacheKey = `${packageName}@${version}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      // Query main package
      const report = await this.queryOSV(packageName, version);

      // If ecosystem checking is enabled, also check related packages (dependencies)
      if (this.checkEcosystem) {
        const ecosystemPackages = await this.discoverEcosystemPackages(packageName, version);

        if (ecosystemPackages.length > 0) {
          // Query ecosystem packages in parallel
          const ecosystemReports = await Promise.all(
            ecosystemPackages.map(async (pkgName) => {
              try {
                return await this.queryOSV(pkgName, version);
              } catch {
                return null; // Ignore individual ecosystem package failures
              }
            })
          );

          // Merge ecosystem vulnerabilities into main report
          for (const ecoReport of ecosystemReports) {
            if (ecoReport && ecoReport.vulnerabilities.length > 0) {
              for (const vuln of ecoReport.vulnerabilities) {
                // Add source package info to vulnerability
                const vulnWithSource = {
                  ...vuln,
                  summary: `[${ecoReport.packageName}] ${vuln.summary}`,
                };
                // Avoid duplicates
                if (!report.vulnerabilities.some((v) => v.id === vuln.id)) {
                  report.vulnerabilities.push(vulnWithSource);
                }
              }
            }
          }

          // Re-sort and recalculate totals
          report.vulnerabilities.sort((a, b) => {
            const severityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3, UNKNOWN: 4 };
            return severityOrder[a.severity] - severityOrder[b.severity];
          });
          report.totalVulnerabilities = report.vulnerabilities.length;
          report.hasCriticalVulnerabilities = report.vulnerabilities.some(
            (v) => v.severity === 'CRITICAL'
          );
          report.hasHighVulnerabilities = report.vulnerabilities.some(
            (v) => v.severity === 'HIGH' || v.severity === 'CRITICAL'
          );
        }
      }

      // Cache the result
      this.cache.set(cacheKey, {
        data: report,
        timestamp: Date.now(),
      });

      return report;
    } catch (error) {
      // Return empty report on error, don't block the analysis
      console.error(
        `Security advisory query failed for ${packageName}@${version}:`,
        (error as Error).message
      );

      return {
        packageName,
        version,
        vulnerabilities: [],
        hasCriticalVulnerabilities: false,
        hasHighVulnerabilities: false,
        totalVulnerabilities: 0,
        queriedAt: new Date(),
        source: 'osv',
      };
    }
  }

  /**
   * Query OSV API for vulnerabilities
   * @see https://google.github.io/osv.dev/api/
   */
  private async queryOSV(packageName: string, version: string): Promise<SecurityAdvisoryReport> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          package: {
            name: packageName,
            ecosystem: 'npm',
          },
          version: version,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OSV API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as OSVQueryResponse;
      return this.parseOSVResponse(packageName, version, data);
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).name === 'AbortError') {
        throw new Error('OSV API request timed out');
      }
      throw error;
    }
  }

  /**
   * Parse OSV API response into our format
   */
  private parseOSVResponse(
    packageName: string,
    version: string,
    response: OSVQueryResponse
  ): SecurityAdvisoryReport {
    const vulnerabilities: VulnerabilityInfo[] = [];

    if (response.vulns && response.vulns.length > 0) {
      for (const vuln of response.vulns) {
        const severity = this.extractSeverity(vuln);
        const cvssScore = this.extractCVSSScore(vuln);

        vulnerabilities.push({
          id: vuln.id,
          aliases: vuln.aliases || [],
          summary: vuln.summary || 'No summary available',
          details: vuln.details || '',
          severity,
          cvssScore,
          affectedVersions: this.extractAffectedVersions(vuln),
          fixedVersions: this.extractFixedVersions(vuln),
          references: this.extractReferences(vuln),
          publishedAt: vuln.published,
        });
      }
    }

    // Sort by severity (CRITICAL first)
    vulnerabilities.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3, UNKNOWN: 4 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return {
      packageName,
      version,
      vulnerabilities,
      hasCriticalVulnerabilities: vulnerabilities.some((v) => v.severity === 'CRITICAL'),
      hasHighVulnerabilities: vulnerabilities.some(
        (v) => v.severity === 'HIGH' || v.severity === 'CRITICAL'
      ),
      totalVulnerabilities: vulnerabilities.length,
      queriedAt: new Date(),
      source: 'osv',
    };
  }

  /**
   * Extract severity from OSV vulnerability
   */
  private extractSeverity(
    vuln: OSVVulnerability
  ): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN' {
    // Try database_specific first
    if (vuln.database_specific?.severity) {
      const severity = vuln.database_specific.severity.toUpperCase();
      if (['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(severity)) {
        return severity as 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
      }
    }

    // Try CVSS score
    const cvssScore = this.extractCVSSScore(vuln);
    if (cvssScore !== undefined) {
      if (cvssScore >= 9.0) return 'CRITICAL';
      if (cvssScore >= 7.0) return 'HIGH';
      if (cvssScore >= 4.0) return 'MODERATE';
      return 'LOW';
    }

    // Check severity array
    if (vuln.severity && vuln.severity.length > 0) {
      const cvss = vuln.severity.find((s) => s.type === 'CVSS_V3');
      if (cvss) {
        const score = parseFloat(cvss.score);
        if (!isNaN(score)) {
          if (score >= 9.0) return 'CRITICAL';
          if (score >= 7.0) return 'HIGH';
          if (score >= 4.0) return 'MODERATE';
          return 'LOW';
        }
      }
    }

    return 'UNKNOWN';
  }

  /**
   * Extract CVSS score from OSV vulnerability
   */
  private extractCVSSScore(vuln: OSVVulnerability): number | undefined {
    // Check database_specific first
    if (vuln.database_specific?.cvss?.score !== undefined) {
      return vuln.database_specific.cvss.score;
    }

    // Check severity array
    if (vuln.severity && vuln.severity.length > 0) {
      const cvss = vuln.severity.find((s) => s.type === 'CVSS_V3');
      if (cvss) {
        const score = parseFloat(cvss.score);
        if (!isNaN(score)) {
          return score;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract affected versions string
   */
  private extractAffectedVersions(vuln: OSVVulnerability): string {
    if (!vuln.affected || vuln.affected.length === 0) {
      return 'Unknown';
    }

    const ranges: string[] = [];

    for (const affected of vuln.affected) {
      if (affected.ranges) {
        for (const range of affected.ranges) {
          if (range.events) {
            let introduced = '';
            let fixed = '';

            for (const event of range.events) {
              if (event.introduced) introduced = event.introduced;
              if (event.fixed) fixed = event.fixed;
            }

            if (introduced && fixed) {
              ranges.push(`>=${introduced} <${fixed}`);
            } else if (introduced) {
              ranges.push(`>=${introduced}`);
            }
          }
        }
      }

      if (affected.versions && affected.versions.length > 0) {
        ranges.push(affected.versions.slice(0, 5).join(', '));
      }
    }

    return ranges.length > 0 ? ranges.join(' || ') : 'Unknown';
  }

  /**
   * Extract fixed versions
   */
  private extractFixedVersions(vuln: OSVVulnerability): string[] {
    const fixedVersions: string[] = [];

    if (vuln.affected) {
      for (const affected of vuln.affected) {
        if (affected.ranges) {
          for (const range of affected.ranges) {
            if (range.events) {
              for (const event of range.events) {
                if (event.fixed) {
                  fixedVersions.push(event.fixed);
                }
              }
            }
          }
        }
      }
    }

    return [...new Set(fixedVersions)]; // Remove duplicates
  }

  /**
   * Extract reference URLs
   */
  private extractReferences(vuln: OSVVulnerability): string[] {
    if (!vuln.references) {
      return [];
    }

    return vuln.references
      .filter((ref) => ref.url)
      .map((ref) => ref.url)
      .slice(0, 5); // Limit to 5 references
  }

  /**
   * Batch query multiple packages
   */
  async queryMultiplePackages(
    packages: Array<{ name: string; version: string }>
  ): Promise<Map<string, SecurityAdvisoryReport>> {
    const results = new Map<string, SecurityAdvisoryReport>();

    // Query in parallel with concurrency limit
    const concurrency = 5;
    const chunks: Array<Array<{ name: string; version: string }>> = [];

    for (let i = 0; i < packages.length; i += concurrency) {
      chunks.push(packages.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (pkg) => {
        const report = await this.queryVulnerabilities(pkg.name, pkg.version);
        results.set(`${pkg.name}@${pkg.version}`, report);
      });

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Format vulnerabilities for AI prompt context
   */
  formatForPrompt(report: SecurityAdvisoryReport): string {
    if (report.totalVulnerabilities === 0) {
      return `No known vulnerabilities found for ${report.packageName}@${report.version}`;
    }

    const lines: string[] = [];
    lines.push(
      `⚠️ SECURITY ALERT: ${report.totalVulnerabilities} vulnerability(ies) found for ${report.packageName}@${report.version}:`
    );

    for (const vuln of report.vulnerabilities) {
      const cveIds = vuln.aliases.filter((a) => a.startsWith('CVE-')).join(', ') || vuln.id;
      const scoreStr = vuln.cvssScore ? ` (CVSS: ${vuln.cvssScore})` : '';

      lines.push(`  - [${vuln.severity}]${scoreStr} ${cveIds}: ${vuln.summary}`);

      if (vuln.fixedVersions.length > 0) {
        lines.push(`    Fixed in: ${vuln.fixedVersions.join(', ')}`);
      }
    }

    if (report.hasCriticalVulnerabilities) {
      lines.push(
        '\n🚨 CRITICAL: This version has CRITICAL security vulnerabilities. DO NOT recommend updating to this version!'
      );
    } else if (report.hasHighVulnerabilities) {
      lines.push(
        '\n⚠️ HIGH RISK: This version has HIGH severity vulnerabilities. Consider alternative versions.'
      );
    }

    return lines.join('\n');
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
