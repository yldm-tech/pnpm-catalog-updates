/**
 * AI Analysis Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackageUpdateInfo, WorkspaceInfo } from '../../../domain/interfaces/aiProvider.js';
import { AIAnalysisService } from '../aiAnalysisService.js';

// Mock all AI providers
vi.mock('../../../infrastructure/ai/providers/claudeProvider.js', () => ({
  ClaudeProvider: vi.fn().mockImplementation(() => ({
    name: 'claude',
    priority: 100,
    capabilities: ['impact', 'security', 'compatibility', 'recommend'],
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock('../../../infrastructure/ai/providers/geminiProvider.js', () => ({
  GeminiProvider: vi.fn().mockImplementation(() => ({
    name: 'gemini',
    priority: 80,
    capabilities: ['impact', 'security', 'compatibility', 'recommend'],
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

vi.mock('../../../infrastructure/ai/providers/codexProvider.js', () => ({
  CodexProvider: vi.fn().mockImplementation(() => ({
    name: 'codex',
    priority: 60,
    capabilities: ['impact', 'security', 'compatibility', 'recommend'],
    isAvailable: vi.fn().mockResolvedValue(false),
  })),
}));

describe('AIAnalysisService', () => {
  let service: AIAnalysisService;

  const packages: PackageUpdateInfo[] = [
    {
      name: 'lodash',
      currentVersion: '4.17.20',
      targetVersion: '4.17.21',
      updateType: 'patch',
    },
    {
      name: 'react',
      currentVersion: '17.0.0',
      targetVersion: '18.0.0',
      updateType: 'major',
    },
  ];

  const workspaceInfo: WorkspaceInfo = {
    name: 'test-workspace',
    path: '/test/path',
    packageCount: 5,
    catalogCount: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AIAnalysisService();
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('analyzeUpdates', () => {
    it('should return disabled result when AI is disabled', async () => {
      const disabledService = new AIAnalysisService({
        config: { enabled: false },
      });

      const result = await disabledService.analyzeUpdates(packages, workspaceInfo);

      expect(result.provider).toBe('none');
      expect(result.recommendations).toHaveLength(2);
      expect(result.recommendations[0]?.action).toBe('review');
      expect(result.summary).toContain('disabled');
    });

    it('should use rule engine fallback when no provider available', async () => {
      const result = await service.analyzeUpdates(packages, workspaceInfo);

      expect(result.provider).toBe('rule-engine');
      expect(result.recommendations).toHaveLength(2);
    });

    it('should respect analysis type option', async () => {
      const result = await service.analyzeUpdates(packages, workspaceInfo, {
        analysisType: 'security',
      });

      expect(result.analysisType).toBe('security');
    });
  });

  describe('analyzeImpact', () => {
    it('should analyze with impact type', async () => {
      const result = await service.analyzeImpact(packages, workspaceInfo);

      expect(result.analysisType).toBe('impact');
    });
  });

  describe('analyzeSecurity', () => {
    it('should analyze with security type', async () => {
      const result = await service.analyzeSecurity(packages, workspaceInfo);

      expect(result.analysisType).toBe('security');
    });
  });

  describe('analyzeCompatibility', () => {
    it('should analyze with compatibility type', async () => {
      const result = await service.analyzeCompatibility(packages, workspaceInfo);

      expect(result.analysisType).toBe('compatibility');
    });
  });

  describe('getRecommendations', () => {
    it('should analyze with recommend type', async () => {
      const result = await service.getRecommendations(packages, workspaceInfo);

      expect(result.analysisType).toBe('recommend');
    });
  });

  describe('cache operations', () => {
    it('should cache results and return cached on second call', async () => {
      const result1 = await service.analyzeUpdates(packages, workspaceInfo);
      const result2 = await service.analyzeUpdates(packages, workspaceInfo);

      expect(result2.provider).toContain('cached');
    });

    it('should skip cache when skipCache option is true', async () => {
      await service.analyzeUpdates(packages, workspaceInfo);
      const result = await service.analyzeUpdates(packages, workspaceInfo, {
        skipCache: true,
      });

      expect(result.provider).not.toContain('cached');
    });

    it('should invalidate cache for specific packages', async () => {
      await service.analyzeUpdates(packages, workspaceInfo);

      service.invalidateCache(['lodash']);

      const result = await service.analyzeUpdates(packages, workspaceInfo);
      expect(result.provider).not.toContain('cached');
    });

    it('should clear all cache', async () => {
      await service.analyzeUpdates(packages, workspaceInfo);

      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should return cache stats', () => {
      const stats = service.getCacheStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
    });
  });

  describe('isAvailable', () => {
    it('should return true when fallback enabled even without providers', async () => {
      const serviceWithFallback = new AIAnalysisService({
        config: {
          fallback: { enabled: true, useRuleEngine: true },
        },
      });

      const available = await serviceWithFallback.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when disabled', async () => {
      const disabledService = new AIAnalysisService({
        config: { enabled: false },
      });

      const available = await disabledService.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return service status', async () => {
      const status = await service.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('providers');
      expect(status).toHaveProperty('activeProvider');
      expect(status).toHaveProperty('cacheEnabled');
      expect(status).toHaveProperty('cacheStats');
      expect(status).toHaveProperty('fallbackEnabled');
    });
  });

  describe('analyzeComprehensive', () => {
    it('should run all analysis types', async () => {
      const result = await service.analyzeComprehensive(packages, workspaceInfo);

      expect(result.primary).toBeDefined();
      expect(result.providers).toContain('rule-engine');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should merge results from multiple analysis types', async () => {
      const result = await service.analyzeComprehensive(packages, workspaceInfo);

      expect(result.merged).toBeDefined();
      expect(result.merged?.recommendations.length).toBeGreaterThanOrEqual(2);
    });
  });
});
