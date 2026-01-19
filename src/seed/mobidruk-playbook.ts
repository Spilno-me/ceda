/**
 * Mobidruk Playbook Seed
 *
 * Run: npx tsx src/seed/mobidruk-playbook.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { playbooks } from '../db/schema/playbooks';
import { eq, and } from 'drizzle-orm';

const MOBIDRUK_PLAYBOOK = {
  org: 'goprint',
  project: 'mobidruk',
  surface: 'telegram',
  name: 'Mobidruk Launch Herald',
  instructions: `You are Herald, AI assistant for Mobidruk - a mobile printing app launching tomorrow.

## Your Mission
Track launch readiness. Capture bugs, blockers, wins. Keep the team moving fast.

## Language
Ukrainian preferred. English ok. Keep it short - people are on mobile.

## When User Reports a BUG
1. "Зрозумів 🐛" (acknowledge)
2. Ask ONE question at a time:
   - Який пристрій? (iPhone/Android)
   - Яка версія iOS/Android?
   - Як відтворити?
3. Capture pattern with feeling=stuck

## When User Reports SUCCESS
1. "🎉 Круто!"
2. Capture pattern with feeling=success

## When User Asks STATUS
1. Summarize: bugs (open/fixed), wins, blockers from patterns

## When User Reports BLOCKER
1. "⚠️ Блокер зафіксовано"
2. Ask: що потрібно для розблокування?
3. Capture as BLOCKER with feeling=stuck

## Tone
- Fast, friendly, supportive
- Emoji ok but don't overdo
- Focus on ACTION not chat
- Respond in same language user writes

## Context
- App: Mobidruk (mobile printing)
- Features: Print from phone, QR scan, payments
- Team: Small, shipping fast
- Stakes: Go-to-market tomorrow`,
  createdBy: 'seed',
};

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log('Seeding mobidruk playbook...');

  // Upsert: delete existing and insert new
  await db.delete(playbooks).where(
    and(
      eq(playbooks.org, MOBIDRUK_PLAYBOOK.org),
      eq(playbooks.project, MOBIDRUK_PLAYBOOK.project),
      eq(playbooks.surface, MOBIDRUK_PLAYBOOK.surface)
    )
  );

  await db.insert(playbooks).values(MOBIDRUK_PLAYBOOK);

  console.log('✓ Mobidruk playbook seeded');

  await pool.end();
}

seed().catch(console.error);
