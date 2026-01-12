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

export const HERALD_SECTION_MARKER = "## Herald Integration";

export const HERALD_SECTION_TEMPLATE = `## Herald Integration

You have Herald MCP tools available. USE THEM.

### On Session Start
- Call \`herald_health()\` to verify CEDA connection
- Call \`herald_predict()\` when building new features

### During Implementation
- Use \`herald_predict()\` before building structures
- Use \`herald_query_insights()\` when stuck

### On Session End
- Call \`herald_observe()\` with outcome (accepted/modified/rejected)

### Context
- Company: {{company}}
- Project: {{project}}
- User: {{user}}
`;

export function renderHeraldSection(context: HeraldContext): string {
  return HERALD_SECTION_TEMPLATE
    .replace("{{company}}", context.company)
    .replace("{{project}}", context.project)
    .replace("{{user}}", context.user);
}

export function updateClaudeMdContent(
  existingContent: string | null,
  context: HeraldContext,
  projectName: string
): string {
  const heraldSection = renderHeraldSection(context);

  if (!existingContent) {
    return `# ${projectName}\n\n${heraldSection}`;
  }

  if (existingContent.includes(HERALD_SECTION_MARKER)) {
    const regex = /## Herald Integration[\s\S]*?(?=\n## |\n# |$)/;
    return existingContent.replace(regex, heraldSection.trimEnd());
  }

  return existingContent.trimEnd() + "\n\n" + heraldSection;
}
