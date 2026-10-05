import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import {
  INCENTIVE_COLUMNS,
  compareIncentives,
  type BrokerIncentive,
  type IncentiveBuilding,
} from "@/lib/broker-incentives";
import { IncentivesManager } from "@/components/admin/incentives/IncentivesManager";

export const dynamic = "force-dynamic";

export default async function AdminIncentivesPage() {
  const supabase = createAdminClient();

  const buildingsError: { message: string | null } = { message: null };
  const [incentivesRes, buildings] = await Promise.all([
    supabase.from("broker_incentives").select(INCENTIVE_COLUMNS).order("building_name"),
    // Our listed buildings, for linking an entry to its record. Paged: the
    // table is past PostgREST's 1000-row cap.
    fetchAllRows<IncentiveBuilding>(async (from, to) => {
      const res = await supabase
        .from("buildings")
        .select("id, name, slug, status, neighborhoods:neighborhood_id (name), cities:city_id (name)")
        .neq("status", "inactive")
        .order("name")
        .order("id")
        .range(from, to);
      if (res.error) buildingsError.message = res.error.message;
      return res as unknown as { data: IncentiveBuilding[] | null; error: unknown };
    }),
  ]);

  const header = (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">Broker Incentives</h1>
      <p className="text-muted-foreground">
        What each building pays an outside broker (OP) for bringing a renter.
        Internal only; never shown on the site.
      </p>
    </div>
  );

  if (incentivesRes.error) {
    // 42P01 / PGRST205: the table is missing until migration 030 is applied.
    const missing =
      incentivesRes.error.code === "42P01" || incentivesRes.error.code === "PGRST205";
    return (
      <div className="space-y-8">
        {header}
        <p role="alert" className="text-red-400">
          {missing
            ? "The broker_incentives table doesn't exist yet. Apply supabase/migrations/030_broker_incentives.sql, then reload."
            : `Error loading incentives: ${incentivesRes.error.message}`}
        </p>
      </div>
    );
  }

  const incentives = ((incentivesRes.data ?? []) as unknown as BrokerIncentive[]).sort(
    compareIncentives
  );

  return (
    <div className="space-y-8">
      {header}
      <IncentivesManager
        initialIncentives={incentives}
        buildings={buildings}
        buildingsError={buildingsError.message}
      />
    </div>
  );
}
