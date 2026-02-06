import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://csgesvqzvqfhepksbory.supabase.co";
const serviceRoleKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzZ2VzdnF6dnFmaGVwa3Nib3J5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODA2MjkwMCwiZXhwIjoyMDgzNjM4OTAwfQ.fzrB9IztbM_LG3AOixQdcY7htCTcmCAzyux8QDtwzoo";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log("Checking analytics tables...\n");

  // Check if tables exist by querying information_schema through a workaround
  const tables = ["page_views", "building_views", "analytics_events", "user_sessions"];

  let needsMigration = false;

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(1);

    if (error?.message?.includes("schema cache") || error?.code === "42P01") {
      console.log(`❌ Table '${table}' - NOT FOUND (needs migration)`);
      needsMigration = true;
    } else if (error) {
      console.log(`⚠️  Table '${table}' - Error: ${error.message}`);
    } else {
      console.log(`✅ Table '${table}' - EXISTS`);
    }
  }

  // Check functions
  console.log("\nChecking functions...");
  const { error: funcError } = await supabase.rpc("get_visitor_stats", { days_back: 7 });
  if (funcError?.message?.includes("schema cache") || funcError?.code === "42883") {
    console.log(`❌ Function 'get_visitor_stats' - NOT FOUND`);
    needsMigration = true;
  } else if (funcError) {
    console.log(`⚠️  Function 'get_visitor_stats' - ${funcError.message}`);
  } else {
    console.log(`✅ Function 'get_visitor_stats' - EXISTS`);
  }

  if (needsMigration) {
    console.log("\n" + "=".repeat(60));
    console.log("⚠️  Migration needed! Please run the SQL in Supabase Dashboard:");
    console.log("=".repeat(60));
    console.log("\n1. Open: https://supabase.com/dashboard/project/csgesvqzvqfhepksbory/sql/new");
    console.log("2. Copy the contents of: supabase/migrations/007_analytics.sql");
    console.log("3. Paste and click 'Run'\n");
  } else {
    console.log("\n✅ All analytics tables and functions are ready!");
  }
}

main().catch(console.error);
