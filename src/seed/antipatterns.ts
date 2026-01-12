/**
 * Antipattern Seed Data
 *
 * These antipatterns represent common behavioral patterns that indicate
 * suboptimal approaches during AI-assisted development sessions.
 *
 * CEDA uses these to detect and help developers escape from unproductive cycles.
 */

import { Antipattern } from '../interfaces';

/**
 * Seed antipatterns for CEDA observation system
 */
export const SEED_ANTIPATTERNS: Antipattern[] = [
  {
    id: 'conflicting-instructions',
    signal: 'Instructions contain contradictory requirements or goals',
    context: 'User provides requirements that cannot be simultaneously satisfied, leading to confusion and wasted effort',
    escape: 'Pause and clarify the conflicting requirements with the user before proceeding. Ask which requirement takes priority.',
    confidence: 0.8,
    source_sessions: [],
  },
  {
    id: 'symptom-not-cause',
    signal: 'Repeatedly fixing surface-level issues without addressing root cause',
    context: 'Developer keeps patching symptoms (e.g., adding null checks, try-catch blocks) instead of understanding why the underlying issue occurs',
    escape: 'Step back and trace the issue to its origin. Ask "why" five times to find the root cause before implementing a fix.',
    confidence: 0.85,
    source_sessions: [],
  },
  {
    id: 'missing-tdd-spec',
    signal: 'Implementation started without clear test specifications or acceptance criteria',
    context: 'Code is being written without first defining what success looks like, leading to unclear requirements and potential rework',
    escape: 'Stop implementation and write failing tests first. Define acceptance criteria before writing production code.',
    confidence: 0.75,
    source_sessions: [],
  },
  {
    id: 'circular-debugging',
    signal: 'Debugging session revisiting the same hypotheses or code paths multiple times',
    context: 'Developer is stuck in a loop, trying the same debugging approaches without making progress or gaining new insights',
    escape: 'Document what has been tried. Take a break or get fresh eyes. Use systematic debugging: binary search, logging, or rubber duck debugging.',
    confidence: 0.9,
    source_sessions: [],
  },
  {
    id: 'copy-paste-without-understanding',
    signal: 'Code copied from external sources without understanding its purpose or implications',
    context: 'Developer copies code from Stack Overflow, documentation, or AI suggestions without understanding how it works or if it fits the context',
    escape: 'Before using copied code, explain each line in your own words. Verify it matches your use case and understand its dependencies.',
    confidence: 0.7,
    source_sessions: [],
  },
];

/**
 * Load antipatterns into an AntipatternService
 */
export function loadAntipatterns(service: { loadAntipatterns: (antipatterns: Antipattern[]) => void }): void {
  service.loadAntipatterns(SEED_ANTIPATTERNS);
}
