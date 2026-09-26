import { OrvexError } from "./helpers/errors";

export interface ClientConfig {
  org:           string;
  authToken:     string;
  queryTimeout?: number;
  authTimeout?:  number;
  maxBatchSize?: number;
  maxRetries?:   number;
}

export interface LoginResponse {
  path:         string;
  jwt:          string;
  refreshToken: string;
  expiresIn:    number;
}

export interface ApiErrorBody {
  error?: string;
  code?:  string;
  [key: string]: any;
}

export interface ExecuteResult<T = any> {
  type: "read" | "write";
  rows: T[];
  totalRows: number;
  truncated: boolean;
  rowsAffected: number;
  lastInsertRowid: number | undefined;
  all(): T[];
  get(): T | undefined;
  run(): {
    rowsAffected:    number;
    lastInsertRowid: number | undefined;
  };
}

export interface BatchStatement {
  sql:     string;
  params?: any[];
  args?: any[];
}

export interface BatchItemResult {
  index:   number;
  ok:      boolean;
  result?: any;
  error?:  OrvexError;
}

export interface BatchResult {
results: BatchItemResult[];
  ok: boolean;
  totalChanges: number;
  succeeded: number;
  failed: number;
  errors: OrvexError[];
  reads: number;
  writes: number;
}

export interface BatchOptions {
  maxSize?: number;
  transaction?: boolean;
  onProgress?: (done: number, total: number) => void;
}