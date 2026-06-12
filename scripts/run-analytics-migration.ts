import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// Alternative: Just verify tables can be created by testing inserts
async function verifyAndCreateTables() {
  console.log("Verifying analytics tables...\n");

  // Test if tables exist by trying to select from them
  const tables = ["page_views", "building_views", "analytics_events", "user_sessions"];

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(1);

    if (error?.code === "42P01") {
      console.log(`❌ Table '${table}' does not exist - needs migration`);
    } else if (error) {
      console.log(`⚠️  Table '${table}': ${error.message}`);
    } else {
      console.log(`✅ Table '${table}' exists`);
    }
  }

  // Test RPC functions
  const { error: rpcError } = await supabase.rpc("get_visitor_stats", { days_back: 7 });
  if (rpcError?.code === "42883") {
    console.log(`❌ Function 'get_visitor_stats' does not exist - needs migration`);
  } else if (rpcError) {
    console.log(`⚠️  Function 'get_visitor_stats': ${rpcError.message}`);
  } else {
    console.log(`✅ Function 'get_visitor_stats' exists`);
  }
}

async function main() {
  await verifyAndCreateTables();

  console.log("\n" + "=".repeat(60));
  console.log("To apply the migration, run the SQL directly in Supabase:");
  console.log("1. Open: https://supabase.com/dashboard/project/csgesvqzvqfhepksbory/sql/new");
  console.log("2. Copy contents of: supabase/migrations/007_analytics.sql");
  console.log("3. Click 'Run'");
  console.log("=".repeat(60));
}

main().catch(console.error);
