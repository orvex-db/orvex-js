import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import type {
  SqliteRemoteDatabase,
  AsyncRemoteCallback,
} from "drizzle-orm/sqlite-proxy";

interface OrvexClient {
  execute<T = any>(sql: string, params: any[]): Promise<{ rows: T[] }>;
  batch(statements: { sql: string; args: any[] }[]): Promise<{ data: any[] }>;
}

export function createDrizzle< TSchema extends Record<string, unknown> = Record<string, never> > (
  client: OrvexClient,
  schema?: TSchema,
): SqliteRemoteDatabase<TSchema> {
  //basic sql callbacks!
  const callback: AsyncRemoteCallback = async (sql, params, method) => {
    const result = await client.execute(sql, params);
    if (method === "run") {
      return { rows: [] };
    }
    const rows = result.rows.map((row: any) =>
      Array.isArray(row) ? row : Object.values(row),
    );
    return { rows };
  };

  //batch sql callbacks!
  const batchCallback = async ( queries: { sql: string; params: any[]; method: string }[] ) => {
    const statements = queries.map((q) => ({
      sql: q.sql,
      args: q.params,
    }));

    const response = await client.batch(statements);
    return response.data.map((entry: any) => {
      if (entry.type === "run") return { rows: [] };
      const data = entry.data ?? [];
      return {
        rows: data.map((row: any) =>
          Array.isArray(row) ? row : Object.values(row),
        ),
      };
    });
  };

  return drizzleProxy(callback, batchCallback, { schema });
}