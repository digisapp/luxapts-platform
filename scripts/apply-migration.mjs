import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Supabase connection (using transaction pooler)
const connectionString = "postgresql://postgres.csgesvqzvqfhepksbory:Porkchop1!@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

async function runMigration() {
  const client = new pg.Client({ connectionString });

  try {
    console.log("Connecting to Supabase...");
    await client.connect();
    console.log("Connected!\n");

    // Read migration file
    const migrationPath = path.join(__dirname, "../supabase/migrations/007_analytics.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    console.log("Running analytics migration...\n");

    // Run the entire migration as a single transaction
    await client.query("BEGIN");

    try {
      await client.query(sql);
      await client.query("COMMIT");
      console.log("✅ Migration completed successfully!");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    // Verify tables were created
    console.log("\nVerifying tables...");
    const tables = ["page_views", "building_views", "analytics_events", "user_sessions"];

    for (const table of tables) {
      const result = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      if (result.rows[0].exists) {
        console.log(`✅ Table '${table}' created`);
      } else {
        console.log(`❌ Table '${table}' NOT found`);
      }
    }

    // Verify functions
    console.log("\nVerifying functions...");
    const functions = ["increment_session_page_views", "get_visitor_stats", "get_top_events"];

    for (const func of functions) {
      const result = await client.query(
        `SELECT EXISTS (SELECT FROM pg_proc WHERE proname = $1)`,
        [func]
      );
      if (result.rows[0].exists) {
        console.log(`✅ Function '${func}' created`);
      } else {
        console.log(`❌ Function '${func}' NOT found`);
      }
    }

    console.log("\n✅ Analytics system ready!");

  } catch (err) {
    console.error("Migration failed:", err.message);
    if (err.message.includes("password authentication failed")) {
      console.log("\nNote: You may need to use the database password from Supabase dashboard.");
      console.log("Go to: Project Settings > Database > Connection string");
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
