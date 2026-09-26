import { OrvexError } from "../helpers/errors";
import { baseURL } from "./client";

const QUERY_TIMEOUT   = 30_000;
const MAX_SQL_LENGTH  = 50_000;
const MAX_ARGS        = 500;
const regionBase = baseURL.replace("v1/", "");


export async function post(
  region: string,
  path:   string,
  jwt:    string,
  body:   any,
): Promise<any> {
  const res = await fetch(`${regionBase}${region}${path}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(QUERY_TIMEOUT),
  });

  const payload: any = await res.json().catch(() => ({}));

  if (!res.ok || payload?.error) {
    throw new OrvexError({
      message: payload?.error ?? "Query failed",
      code:    payload?.code  ?? "QUERY_FAILED",
      status:  res.status,
      data:    payload,
    });
  }

  return payload;
}

function wrapResult(body: any) {
  const data = body?.data;

  // ── READ ──────────────────────────────────────────────
  // body = { data: [...], truncated, totalRows }
  if (Array.isArray(data)) {
    const rows: any[] = data;

    return {
      type:            "read",
      rows,
      totalRows:       body?.totalRows ?? rows.length,
      truncated:       body?.truncated ?? false,
      rowsAffected:    0,
      lastInsertRowid: undefined,
      all() { return rows; },
      get() { return rows[0]; },
      run() { return { rowsAffected: 0, lastInsertRowid: undefined }; },
    };
  }

  // ── WRITE ─────────────────────────────────────────────
  // body = { data: { changes, lastInsertRowid } }
  const changes = data?.changes ?? 0;
  const lastId  = data?.lastInsertRowid;

  return {
    type:            "write",
    rows:            [],
    totalRows:       0,
    truncated:       false,
    rowsAffected:    changes,
    lastInsertRowid: lastId,
    all() { return []; },
    get() { return undefined; },
    run() { return { rowsAffected: changes, lastInsertRowid: lastId }; },
  };
}

// ─────────────────────────────────────────────────────────
// Single query → raw body
// ─────────────────────────────────────────────────────────
export async function runQuery(
  region: string,
  jwt:    string,
  sql:    string,
  params: any[] = [],
): Promise<any> {
  return post(region, "/v1/pipeline", jwt, { sql, args: params });
}

// ─────────────────────────────────────────────────────────
// Single query → wrapped result (.all/.get/.run)
// ─────────────────────────────────────────────────────────
export async function execute(
  region: string,
  jwt:    string,
  sql:    string,
  params: any[] = [],
): Promise<any> {
  const body = await runQuery(region, jwt, sql, params);
  return wrapResult(body);
}

// ─────────────────────────────────────────────────────────
// Batch → /v1/pipeline/batch (one HTTP request)
// ─────────────────────────────────────────────────────────
export async function batch(
  region:     string,
  jwt:        string,
  statements: any[],
  options:    any = {},
  ensureJWT?: () => Promise<string>,
): Promise<any> {
  const maxSize     = options.maxSize     ?? 100;
  const transaction = options.transaction ?? true;

  // ─── Validation ───────────────────────────────────────
  if (!Array.isArray(statements) || statements.length === 0) {
    throw new OrvexError({
      message: "batch() requires at least one statement.",
      code:    "EMPTY_BATCH",
      status:  400,
    });
  }

  if (statements.length > maxSize) {
    throw new OrvexError({
      message: `batch() max ${maxSize} statements, got ${statements.length}.`,
      code:    "BATCH_TOO_LARGE",
      status:  400,
      data:    { size: statements.length, max: maxSize },
    });
  }

  for (let i = 0; i < statements.length; i++) {
    const s = statements[i];

    if (!s?.sql || typeof s.sql !== "string") {
      throw new OrvexError({
        message: `Statement at index ${i} is missing 'sql'.`,
        code:    "INVALID_STATEMENT",
        status:  400,
        data:    { index: i },
      });
    }
    if (s.sql.length > MAX_SQL_LENGTH) {
      throw new OrvexError({
        message: `Statement at index ${i}: SQL too long.`,
        code:    "SQL_TOO_LONG",
        status:  400,
        data:    { index: i },
      });
    }
    if (s.sql.includes(";")) {
      throw new OrvexError({
        message: `Statement at index ${i}: semicolons not allowed in batch.`,
        code:    "SEMICOLON_NOT_ALLOWED",
        status:  400,
        data:    { index: i },
      });
    }
    const params = s.params ?? s.args ?? [];
    if (!Array.isArray(params)) {
      throw new OrvexError({
        message: `Statement at index ${i}: args must be an array.`,
        code:    "INVALID_ARGS",
        status:  400,
        data:    { index: i },
      });
    }
    if (params.length > MAX_ARGS) {
      throw new OrvexError({
        message: `Statement at index ${i}: too many args.`,
        code:    "TOO_MANY_ARGS",
        status:  400,
        data:    { index: i },
      });
    }
  }

  // ─── Build body — matches node's /v1/pipeline/batch ──
  const body = {
    statements: statements.map((s) => ({
      sql:  s.sql,
      args: s.params ?? s.args ?? [],
    })),
    transaction,
  };

  // ─── Send (retry once on 401) ─────────────────────────
  let currentJwt = jwt;
  let response: any;

  const doBatch = () => post(region, "/v1/pipeline/batch", currentJwt, body);

  try {
    response = await doBatch();
  } catch (err: any) {
    if (!isUnauthorized(err) || !ensureJWT) throw err;
    currentJwt = await ensureJWT();
    response = await doBatch();
  }

  const rawData: any[] = response?.data ?? [];

  const results: any[] = rawData.map((entry: any, i: number) => {
    if (entry.type === "read") {
      return {
        index: i,
        ok:    true,
        result: {
          type:      "read",
          rows:      entry.data ?? [],
          totalRows: entry.totalRows ?? (entry.data?.length ?? 0),
          truncated: entry.truncated ?? false,
        },
      };
    }
    return {
      index: i,
      ok:    true,
      result: {
        type:            "write",
        rowsAffected:    entry.data?.changes ?? 0,
        lastInsertRowid: entry.data?.lastInsertRowid,
      },
    };
  });

  const totalChanges = results.reduce(
    (sum, r) => sum + ((r.result as any)?.rowsAffected ?? 0),
    0,
  );

  if (options.onProgress) {
    options.onProgress(statements.length, statements.length);
  }

  return {
    results,
    ok:           true,
    totalChanges,
    succeeded:    results.length,
    failed:       0,
    errors:       [],
    reads:        response?.reads  ?? 0,
    writes:       response?.writes ?? 0,
  };
}

export function isUnauthorized(err: any): boolean {
  return err?.status === 401 || err?.code === "INVALID_TOKEN";
}