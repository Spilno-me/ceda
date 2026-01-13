/**
 * Seed patterns for different domains
 *
 * CEDA is domain-agnostic. Import and load domain-specific patterns
 * based on your application's needs.
 *
 * Multi-tenant Pattern Isolation (CEDA-30/31):
 * - HSE patterns: company='disrupt'
 * - GoPrint patterns: company='goprint'
 * - Spilno patterns: company='spilno'
 */

// HSE domain patterns (company: disrupt)
export { HSE_PATTERNS, loadHSEPatterns } from './hse-patterns';

// GoPrint domain patterns (company: goprint) - CEDA-31
export { GOPRINT_PATTERNS, loadGoPrintPatterns } from './goprint-patterns';

// Spilno domain patterns (company: spilno) - CEDA-31
export { SPILNO_PATTERNS, loadSpilnoPatterns } from './spilno-patterns';

// Antipatterns for observation and learning
export { SEED_ANTIPATTERNS, loadAntipatterns } from './antipatterns';

// Design System domain patterns (global)
export { DESIGNSYSTEM_PATTERNS, loadDesignSystemPatterns } from './designsystem-patterns';

// Anteater ecosystem patterns (anteater CLI + anteater-mcp)
export { ANTEATER_PATTERNS, loadAnteaterPatterns } from './anteater-patterns';

// Methodology patterns (shared/cross-domain) - Five Hats AI Consilium 2026-01-13
export { METHODOLOGY_PATTERNS, loadMethodologyPatterns } from './methodology-patterns';

// Future domain patterns:
// export { HR_PATTERNS, loadHRPatterns } from './hr-patterns';
// export { FINANCE_PATTERNS, loadFinancePatterns } from './finance-patterns';
