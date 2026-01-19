/**
 * Goprint Memberships Seed - Axis MVP
 *
 * Run: npx tsx src/seed/goprint-members.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { memberships } from '../db/schema/memberships';
import { eq } from 'drizzle-orm';

const GOPRINT_MEMBERS = [
  {
    userEmail: 'oleksii.orlov@gmail.com',
    userProvider: 'google',
    org: 'goprint',
    role: 'admin',
    trustSource: 'manual',
  },
  // Add more team members as needed
  // {
  //   userEmail: 'team@goprint.com',
  //   userProvider: 'google',
  //   org: 'goprint',
  //   role: 'member',
  //   trustSource: 'manual',
  // },
];

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log('Seeding goprint memberships...');

  for (const member of GOPRINT_MEMBERS) {
    // Upsert: delete existing and insert new
    await db.delete(memberships).where(
      eq(memberships.userEmail, member.userEmail)
    );

    await db.insert(memberships).values(member);
    console.log(`  ✓ ${member.userEmail} → ${member.org} (${member.role})`);
  }

  console.log('✓ Goprint memberships seeded');

  await pool.end();
}

seed().catch(console.error);
