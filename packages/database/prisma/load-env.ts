/**
 * Side-effect-only module that loads `.env` from the monorepo root.
 *
 * Imported at the top of `seed.ts` so that DATABASE_URL is in `process.env`
 * BEFORE Prisma's module is loaded (Prisma reads it at import time). Lives
 * in a separate file because `import` statements must be at the top of an
 * ES module — we can't legally interleave `loadEnv()` between two imports.
 */
import { join } from 'node:path';

import { config } from 'dotenv';

config({ path: join(__dirname, '..', '..', '..', '.env') });
