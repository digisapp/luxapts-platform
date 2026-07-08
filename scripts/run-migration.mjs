import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// General-purpose migration runner.
//   DATABASE_URL=... node scripts/run-migration.mjs 017_security_fixes.sql 018_rls_escalation_fixes.sql
// Each file is applied in its own transaction (rolled back on error).
// Set DATABASE_URL in your environment — never commit credentials.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/run-migration.mjs <file.sql> [file2.sql ...]");
  process.exit(1);
}

async function run() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("Connected.\n");

  try {
    for (const file of files) {
      const migrationPath = path.join(__dirname, "../supabase/migrations", file);
      const sql = fs.readFileSync(migrationPath, "utf-8");
      console.log(`Applying ${file} ...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
        console.log(`  ✅ ${file} committed\n`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ❌ ${file} rolled back: ${err.message}\n`);
        throw err;
      }
    }
    console.log("All migrations applied successfully.");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("Migration run failed:", err.message);
  process.exit(1);
});
