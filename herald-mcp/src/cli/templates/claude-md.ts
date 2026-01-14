/**
 * CLAUDE.md Herald Integration Template
 *
 * Template for the Herald integration section that gets added to CLAUDE.md
 * when running `herald-mcp init`.
 */

export interface HeraldContext {
  company: string;
  project: string;
  user: string;
}

export interface LearnedPatterns {
  patterns: Array<{ insight: string; reinforcement?: string }>;
  antipatterns: Array<{ insight: string; warning?: string }>;
}

export const HERALD_SECTION_MARKER = "## Herald Integration";

export const HERALD_SECTION_TEMPLATE = `## Herald Integration

You have Herald MCP tools available. USE THEM.

### On Session Start
- Call \`herald_patterns()\` to learn from past sessions
- Review antipatterns below BEFORE starting work

### Pattern Capture
- When things go WRONG: "Herald reflect - that was rough"
- When things go WELL: "Herald reflect - that was smooth"
- For deep analysis: "Herald simulate"

### Context
- Company: {{company}}
- Project: {{project}}
- User: {{user}}

{{learned_patterns}}
`;

export function renderHeraldSection(context: HeraldContext, learnedPatterns?: LearnedPatterns): string {
  let learnedSection = "";

  if (learnedPatterns && (learnedPatterns.antipatterns.length > 0 || learnedPatterns.patterns.length > 0)) {
    learnedSection = "### Learned from Past Sessions\n\n";

    if (learnedPatterns.antipatterns.length > 0) {
      learnedSection += "**Antipatterns (AVOID THESE):**\n";
      learnedPatterns.antipatterns.slice(0, 5).forEach((ap, i) => {
        learnedSection += `${i + 1}. ${ap.insight}`;
        if (ap.warning) learnedSection += ` → ${ap.warning}`;
        learnedSection += "\n";
      });
      learnedSection += "\n";
    }

    if (learnedPatterns.patterns.length > 0) {
      learnedSection += "**Patterns (DO THESE):**\n";
      learnedPatterns.patterns.slice(0, 5).forEach((p, i) => {
        learnedSection += `${i + 1}. ${p.insight}`;
        if (p.reinforcement) learnedSection += ` → ${p.reinforcement}`;
        learnedSection += "\n";
      });
    }
  }

  return HERALD_SECTION_TEMPLATE
    .replace("{{company}}", context.company)
    .replace("{{project}}", context.project)
    .replace("{{user}}", context.user)
    .replace("{{learned_patterns}}", learnedSection);
}

export async function fetchLearnedPatterns(
  cedaUrl: string,
  company: string,
  project: string
): Promise<LearnedPatterns | null> {
  try {
    const response = await fetch(
      `${cedaUrl}/api/herald/reflections?company=${company}&project=${project}&limit=10`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      patterns?: Array<{ insight: string; reinforcement?: string }>;
      antipatterns?: Array<{ insight: string; warning?: string }>;
    };

    return {
      patterns: data.patterns || [],
      antipatterns: data.antipatterns || [],
    };
  } catch {
    return null;
  }
}

export function updateClaudeMdContent(
  existingContent: string | null,
  context: HeraldContext,
  projectName: string,
  learnedPatterns?: LearnedPatterns
): string {
  const heraldSection = renderHeraldSection(context, learnedPatterns);

  if (!existingContent) {
    return `# ${projectName}\n\n${heraldSection}`;
  }

  if (existingContent.includes(HERALD_SECTION_MARKER)) {
    const regex = /## Herald Integration[\s\S]*?(?=\n## |\n# |$)/;
    return existingContent.replace(regex, heraldSection.trimEnd());
  }

  return existingContent.trimEnd() + "\n\n" + heraldSection;
}
