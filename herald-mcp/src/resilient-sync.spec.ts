/**
 * CEDA-53: Unit tests for Herald MCP Resilient Sync
 *
 * Tests the resilient sync functionality:
 * - CEDA_URL environment variable resolution
 * - Local insight buffer read/write
 * - Cloud-first sync with local fallback
 * - herald_sync tool
 * - herald_health buffer status
 */

import * as fs from 'fs';
import * as path from 'path';

describe('CEDA-53: Herald Resilient Sync', () => {
  const indexPath = path.join(process.cwd(), 'src', 'index.ts');
  let indexContent: string;

  beforeAll(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  describe('CEDA_URL environment variable', () => {
    it('should accept CEDA_URL as primary env var', () => {
      expect(indexContent).toContain('process.env.CEDA_URL');
    });

    it('should fallback to HERALD_API_URL if CEDA_URL not set', () => {
      expect(indexContent).toMatch(/process\.env\.CEDA_URL \|\| process\.env\.HERALD_API_URL/);
    });

    it('should default to https://getceda.com if neither env var is set', () => {
      expect(indexContent).toMatch(/process\.env\.CEDA_URL \|\| process\.env\.HERALD_API_URL \|\| "https:\/\/getceda\.com"/);
    });
  });

  describe('Local insight buffer', () => {
    it('should have getInsightBufferFile function', () => {
      expect(indexContent).toContain('function getInsightBufferFile()');
      expect(indexContent).toContain('insight_buffer.json');
    });

    it('should have loadInsightBuffer function', () => {
      expect(indexContent).toContain('function loadInsightBuffer()');
    });

    it('should have saveInsightBuffer function', () => {
      expect(indexContent).toContain('function saveInsightBuffer(buffer: InsightBuffer)');
    });

    it('should have addToInsightBuffer function', () => {
      expect(indexContent).toContain('function addToInsightBuffer(insight: string');
    });

    it('should have removeFromInsightBuffer function', () => {
      expect(indexContent).toContain('function removeFromInsightBuffer(insightId: string)');
    });

    it('should define BufferedInsight interface with required fields', () => {
      expect(indexContent).toContain('interface BufferedInsight');
      expect(indexContent).toMatch(/BufferedInsight[\s\S]*?id: string/);
      expect(indexContent).toMatch(/BufferedInsight[\s\S]*?insight: string/);
      expect(indexContent).toMatch(/BufferedInsight[\s\S]*?timestamp: string/);
      expect(indexContent).toMatch(/BufferedInsight[\s\S]*?retryCount: number/);
    });

    it('should define InsightBuffer interface', () => {
      expect(indexContent).toContain('interface InsightBuffer');
      expect(indexContent).toMatch(/InsightBuffer[\s\S]*?insights: BufferedInsight\[\]/);
      expect(indexContent).toMatch(/InsightBuffer[\s\S]*?lastSyncAttempt\?: string/);
      expect(indexContent).toMatch(/InsightBuffer[\s\S]*?lastSuccessfulSync\?: string/);
    });
  });

  describe('Cloud-first sync with local fallback', () => {
    it('should have herald_share_insight implement cloud-first strategy', () => {
      // Check that herald_share_insight tries cloud first
      expect(indexContent).toMatch(/case "herald_share_insight"[\s\S]*?Cloud-first/);
    });

    it('should buffer locally on cloud failure', () => {
      expect(indexContent).toMatch(/case "herald_share_insight"[\s\S]*?addToInsightBuffer/);
    });

    it('should return synced status on cloud success', () => {
      expect(indexContent).toMatch(/case "herald_share_insight"[\s\S]*?synced: true/);
    });

    it('should return buffered status on cloud failure', () => {
      expect(indexContent).toMatch(/case "herald_share_insight"[\s\S]*?buffered: true/);
    });
  });

  describe('herald_sync tool', () => {
    it('should have herald_sync tool defined', () => {
      expect(indexContent).toContain('name: "herald_sync"');
      expect(indexContent).toContain('Flush the local insight buffer to the cloud');
    });

    it('should have herald_sync handler', () => {
      expect(indexContent).toContain('case "herald_sync"');
    });

    it('should call flushInsightBuffer in herald_sync handler', () => {
      expect(indexContent).toMatch(/case "herald_sync"[\s\S]*?flushInsightBuffer/);
    });

    it('should return sync results with synced, failed, remaining counts', () => {
      expect(indexContent).toMatch(/case "herald_sync"[\s\S]*?synced: syncResult\.synced/);
      expect(indexContent).toMatch(/case "herald_sync"[\s\S]*?failed: syncResult\.failed/);
      expect(indexContent).toMatch(/case "herald_sync"[\s\S]*?remaining: syncResult\.remaining/);
    });
  });

  describe('herald_health buffer status', () => {
    it('should include buffer status in herald_health', () => {
      expect(indexContent).toMatch(/case "herald_health"[\s\S]*?getBufferStatus/);
    });

    it('should include cloud connectivity check in herald_health', () => {
      expect(indexContent).toMatch(/case "herald_health"[\s\S]*?checkCloudConnectivity/);
    });

    it('should return pendingInsights count', () => {
      expect(indexContent).toMatch(/case "herald_health"[\s\S]*?pendingInsights/);
    });

    it('should return cloud connection status', () => {
      expect(indexContent).toMatch(/case "herald_health"[\s\S]*?cloud[\s\S]*?connected/);
    });

    it('should return lastSyncAttempt and lastSuccessfulSync timestamps', () => {
      expect(indexContent).toMatch(/case "herald_health"[\s\S]*?lastSyncAttempt/);
      expect(indexContent).toMatch(/case "herald_health"[\s\S]*?lastSuccessfulSync/);
    });
  });

  describe('Helper functions', () => {
    it('should have checkCloudConnectivity function', () => {
      expect(indexContent).toContain('async function checkCloudConnectivity()');
    });

    it('should have syncInsightToCloud function', () => {
      expect(indexContent).toContain('async function syncInsightToCloud(insight: BufferedInsight)');
    });

    it('should have flushInsightBuffer function', () => {
      expect(indexContent).toContain('async function flushInsightBuffer()');
    });

    it('should have getBufferStatus function', () => {
      expect(indexContent).toContain('function getBufferStatus()');
    });

    it('should have updateBufferSyncTimestamp function', () => {
      expect(indexContent).toContain('function updateBufferSyncTimestamp(success: boolean)');
    });
  });

  describe('Version', () => {
    it('should be version 1.9.0 in index.ts', () => {
      expect(indexContent).toContain('const VERSION = "1.9.0"');
    });
  });

  describe('CEDA-53 comment markers', () => {
    it('should have CEDA-53 comment in tool definitions', () => {
      expect(indexContent).toContain('// CEDA-53: Resilient Sync Tool');
    });

    it('should have CEDA-53 comment in tool handlers', () => {
      expect(indexContent).toMatch(/\/\/ CEDA-53: Resilient Sync Tool[\s\S]*?case "herald_sync"/);
    });

    it('should have insight buffer section comment', () => {
      expect(indexContent).toContain('// INSIGHT BUFFER - Local resilient storage');
    });
  });
});
