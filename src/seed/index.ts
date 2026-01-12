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

// Future domain patterns:
// export { HR_PATTERNS, loadHRPatterns } from './hr-patterns';
// export { FINANCE_PATTERNS, loadFinancePatterns } from './finance-patterns';
