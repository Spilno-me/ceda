/**
 * CEDA Pattern Seeding Script
 *
 * Seeds all company-specific patterns into the pattern library.
 * Run: yarn seed
 *
 * CEDA-31: Company Pattern Seeds
 * - HSE patterns (company: disrupt)
 * - GoPrint patterns (company: goprint)
 * - Spilno patterns (company: spilno)
 */

import { PatternLibraryService } from '../services/pattern-library.service';
import { HSE_PATTERNS, GOPRINT_PATTERNS, SPILNO_PATTERNS } from '../seed';

async function seedPatterns(): Promise<void> {
  console.log('[CEDA] Starting pattern seeding...');

  const patternLibrary = new PatternLibraryService();

  // Load HSE patterns (company: disrupt)
  console.log('[CEDA] Loading HSE patterns (company: disrupt)...');
  patternLibrary.loadPatterns(HSE_PATTERNS);
  console.log(`[CEDA] Loaded ${HSE_PATTERNS.length} HSE patterns`);

  // Load GoPrint patterns (company: goprint)
  console.log('[CEDA] Loading GoPrint patterns (company: goprint)...');
  patternLibrary.loadPatterns(GOPRINT_PATTERNS);
  console.log(`[CEDA] Loaded ${GOPRINT_PATTERNS.length} GoPrint patterns`);

  // Load Spilno patterns (company: spilno)
  console.log('[CEDA] Loading Spilno patterns (company: spilno)...');
  patternLibrary.loadPatterns(SPILNO_PATTERNS);
  console.log(`[CEDA] Loaded ${SPILNO_PATTERNS.length} Spilno patterns`);

  // Summary
  const totalPatterns = patternLibrary.getPatternCount();
  console.log('\n[CEDA] Pattern seeding complete!');
  console.log(`[CEDA] Total patterns loaded: ${totalPatterns}`);

  // List patterns by company
  const allPatterns = patternLibrary.getAllPatterns();
  const byCompany = allPatterns.reduce((acc, p) => {
    const company = p.company || 'global';
    acc[company] = (acc[company] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n[CEDA] Patterns by company:');
  for (const [company, count] of Object.entries(byCompany)) {
    console.log(`  - ${company}: ${count} patterns`);
  }
}

seedPatterns().catch((error) => {
  console.error('[CEDA] Pattern seeding failed:', error);
  process.exit(1);
});
