import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { isValidUUID, safeParseInt } from "@/lib/utils";
import { filtersFromParams, sortFromParam } from "@/lib/crm/filters";
import { contactsAt, listContext } from "@/lib/crm/service";

/**
 * "Next" while working through a list. Given the current contact and its
 * position, returns the one after it (without an id, the first). Working a
 * list changes it: logging a call takes someone off "Never contacted", and
 * everyone behind them moves up a place. So if the row at the current
 * position is no longer the current contact, that row is the next one.
 * (workSortFor keeps logged contacts from jumping ahead instead.)
 */
export async function GET(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);

  const params = new URL(req.url).searchParams;
  // No id: start of the list.
  const current = params.get("id");
  if (current !== null && !isValidUUID(current)) return apiError("Invalid contact id.");
  const index = current === null ? 0 : safeParseInt(params.get("i"), 0, 0, 1_000_000);

  try {
    const { ids, total } = await contactsAt(
      createAdminClient(),
      filtersFromParams(params),
      sortFromParam(params.get("sort")),
      index,
      listContext()
    );
    const [atIndex, after] = ids;
    if (current !== null && atIndex === current) {
      return NextResponse.json(after ? { id: after, index: index + 1, total } : { id: null, total });
    }
    return NextResponse.json(atIndex ? { id: atIndex, index, total } : { id: null, total });
  } catch (err) {
    console.error("NYC next contact error:", err);
    return apiError("Could not find the next contact.", 500);
  }
}
