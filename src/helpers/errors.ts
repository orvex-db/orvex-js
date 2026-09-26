export type OrvexErrorCode =
  // Client
  | "MISSING_REQUIRED_PARAMETERS"
  | "INVALID_RESPONSE"

  // Auth
  | "INVALID_KEY"
  | "INVALID_REFRESH"
  | "INVALID_LOGIN_RESPONSE"
  | "INVALID_REFRESH_RESPONSE"
  | "SESSION_NOT_FOUND"
  | "SESSION_REVOKED"
  | "USER_DISABLED"

  // Query
  | "QUERY_FAILED"
  | "INVALID_TOKEN"
  | "NO_TOKEN"
  | "MALFORMED_TOKEN"

  // Batch
  | "EMPTY_BATCH"
  | "BATCH_TOO_LARGE"
  | "INVALID_STATEMENT"
  | "STATEMENT_FAILED"

  // Node / DB
  | "NODE_NOT_FOUND"
  | "NODE_UNREACHABLE"

  // Quota
  | "QUOTA_READS_PER_NODE"
  | "QUOTA_WRITES_PER_NODE"
  | "QUOTA_READS_ACCOUNT"
  | "QUOTA_WRITES_ACCOUNT"

  // Network
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR"
  | string;

export class OrvexError extends Error {
  code:   OrvexErrorCode;
  status: number;
  data:   any;

  constructor(opts: {
    message: string;
    code:    OrvexErrorCode;
    status:  number;
    data?:   any;
  }) {
    super(opts.message);
    this.name   = "OrvexError";
    this.code   = opts.code;
    this.status = opts.status;
    this.data   = opts.data;
  }
}