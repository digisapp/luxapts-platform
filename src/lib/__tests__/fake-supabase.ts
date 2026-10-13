/**
 * A minimal in-memory stand-in for the Supabase admin client, enough for the
 * Stacy and listing lead code paths: select/eq/ilike/is/order/limit with
 * maybeSingle, single or await; insert (optionally .select().single());
 * update().eq(). `is`, `in`, `order` and `limit` do not filter or sort.
 * Every write is recorded so tests can assert on it.
 */

type Row = Record<string, unknown>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  inserts: { table: string; rows: Row[] }[];
  updates: { table: string; values: Row; filters: [string, unknown][] }[];
  /** Per-table error returned by insert (e.g. { code: "23505" }). */
  insertError: Record<string, { code?: string; message?: string } | undefined>;
}

let nextId = 1;

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  return { tables, inserts: [], updates: [], insertError: {} };
}

export function fakeClient(db: FakeDb) {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const preds: ((r: Row) => boolean)[] = [];
      let op: "select" | "insert" | "update" = "select";
      let values: Row = {};
      let inserted: Row[] = [];
      const matching = () =>
        (db.tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v) && preds.every((p) => p(r)));

      const exec = async (): Promise<{ data: unknown; error: unknown }> => {
        if (op === "insert") {
          const error = db.insertError[table];
          return error ? { data: null, error } : { data: inserted, error: null };
        }
        if (op === "update") {
          for (const r of matching()) Object.assign(r, values);
          db.updates.push({ table, values, filters: [...filters] });
          return { data: null, error: null };
        }
        return { data: matching(), error: null };
      };

      const first = async () => {
        const res = await exec();
        return { data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data, error: res.error };
      };

      const query: Record<string, unknown> = {
        select: () => query,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return query;
        },
        // Case-insensitive equality: the code's patterns escape their wildcards.
        ilike: (k: string, pattern: string) => {
          const want = pattern.replace(/\\(.)/g, "$1").toLowerCase();
          preds.push((r) => String(r[k] ?? "").toLowerCase() === want);
          return query;
        },
        is: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: first,
        single: first,
        insert: (rows: Row | Row[]) => {
          op = "insert";
          if (!db.insertError[table]) {
            inserted = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: `${table}-${nextId++}`, ...r }));
            (db.tables[table] ??= []).push(...inserted);
            db.inserts.push({ table, rows: inserted });
          }
          return query;
        },
        update: (v: Row) => {
          op = "update";
          values = v;
          return query;
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => exec().then(resolve, reject),
      };
      return query;
    },
  };
}
