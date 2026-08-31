import { loadEnv } from './env';

loadEnv();

/** Drops and recreates the public schema, then exits. Follow with `npm run db:setup`. */
async function main() {
  const { dbDriver, dbExecute: execute, closeDb: close } = await import('../client');
  const driver = dbDriver();

  if (driver === 'postgres' && process.env.ALLOW_DB_RESET !== 'true') {
    console.error(
      'Refusing to reset a hosted database. Set ALLOW_DB_RESET=true if you really mean it.',
    );
    process.exit(1);
  }

  console.log(`→ dropping schema (driver: ${driver})`);
  await execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log('→ done. Run `npm run db:setup` to rebuild.');
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
