/**
 * AI Detector Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Create mock function using vi.hoisted to ensure it's available during module mocking
const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}));

// Mock node:util to intercept promisify calls
vi.mock('node:util', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:util')>();
  return {
    ...original,
    promisify: (fn: unknown) => {
      // If it's our mocked exec, return our mock
      if (fn === mockExec || (typeof fn === 'function' && fn.name === 'exec')) {
        return mockExec;
      }
      return original.promisify(fn as (...args: unknown[]) => unknown);
    },
  };
});

// Mock child_process
vi.mock('node:child_process', () => ({
  exec: mockExec,
}));

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from 'node:fs';
import { AIDetector } from '../aiDetector.js';

const mockExistsSync = vi.mocked(existsSync);

describe('AIDetector', () => {
  let detector: AIDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new AIDetector();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('detectAvailableProviders', () => {
    it('should return empty available providers when no CLI tools found', async () => {
      // Mock all detection methods to fail
      mockExec.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const providers = await detector.detectAvailableProviders();

      // Should return all providers but none available
      expect(providers.length).toBeGreaterThan(0);
      const available = providers.filter((p) => p.available);
      expect(available.length).toBe(0);
    });

    it('should detect claude when which command succeeds', async () => {
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes('which claude') || cmd.includes('where claude')) {
          return Promise.resolve({ stdout: '/usr/local/bin/claude\n', stderr: '' });
        } else if (cmd.includes('claude') && cmd.includes('--version')) {
          return Promise.resolve({ stdout: 'claude 1.0.0', stderr: '' });
        } else {
          return Promise.reject(new Error('not found'));
        }
      });
      mockExistsSync.mockReturnValue(false);

      const providers = await detector.detectAvailableProviders();
      const claude = providers.find((p) => p.name === 'claude');

      expect(claude).toBeDefined();
      expect(claude?.available).toBe(true);
      expect(claude?.path).toBe('/usr/local/bin/claude');
      expect(claude?.priority).toBe(100);
    });

    it('should sort providers by priority', async () => {
      mockExec.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const providers = await detector.detectAvailableProviders();

      // Check that providers are sorted by priority (descending)
      for (let i = 0; i < providers.length - 1; i++) {
        expect(providers[i]!.priority).toBeGreaterThanOrEqual(providers[i + 1]!.priority);
      }
    });
  });

  describe('getAvailableProviders', () => {
    it('should return only available providers', async () => {
      mockExec.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const providers = await detector.getAvailableProviders();

      expect(providers.every((p) => p.available)).toBe(true);
    });
  });

  describe('isProviderAvailable', () => {
    it('should return false for unknown provider', async () => {
      const result = await detector.isProviderAvailable('unknown-provider');
      expect(result).toBe(false);
    });

    it('should return false when provider not found', async () => {
      mockExec.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const result = await detector.isProviderAvailable('claude');
      expect(result).toBe(false);
    });
  });

  describe('getBestProvider', () => {
    it('should return null when no providers available', async () => {
      mockExec.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const best = await detector.getBestProvider();
      expect(best).toBeNull();
    });
  });

  describe('getDetectionSummary', () => {
    it('should return fallback message when no providers available', async () => {
      mockExec.mockRejectedValue(new Error('not found'));
      mockExistsSync.mockReturnValue(false);

      const summary = await detector.getDetectionSummary();
      expect(summary).toContain('No AI CLI tools detected');
      expect(summary).toContain('rule-based fallback');
    });
  });
});
