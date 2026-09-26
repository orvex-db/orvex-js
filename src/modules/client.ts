import { OrvexError } from "../helpers/errors";
import * as auth from "./auth";
import { execute, batch, isUnauthorized } from "./workers";

import type {
  ClientConfig,
  ExecuteResult,
  BatchStatement,
  BatchOptions,
  BatchResult,
} from "../types";

export const baseURL = "https://api.vaibhavrun.space/v1/";

const DEFAULTS = {
  queryTimeout: 30_000,
  authTimeout: 10_000,
  refreshBufferS: 60,
  maxBatchSize: 100,
  maxRetries: 1,
} as const;

/** Fully-resolved config (defaults applied). */
type ResolvedConfig = Required<
  Pick<
    ClientConfig,
    | "org"
    | "authToken"
    | "queryTimeout"
    | "authTimeout"
    | "maxBatchSize"
    | "maxRetries"
  >
>;

export class Client {
  /** Immutable, fully-resolved user config. */
  public readonly config: ResolvedConfig;

  // ---- private session state ----
  private region: string | null = null;
  private rawToken: string | null = null;
  private refreshToken: string | null = null;
  private rawTokenExp: number = 0;
  private refreshing: Promise<void> | null = null;
  private readonly init: Promise<void>;

  constructor(config: ClientConfig) {
    const {
      org,
      authToken,
      queryTimeout = DEFAULTS.queryTimeout,
      authTimeout = DEFAULTS.authTimeout,
      maxBatchSize = DEFAULTS.maxBatchSize,
      maxRetries = DEFAULTS.maxRetries,
    } = config ?? {};

    if (!org || !authToken) {
      throw new OrvexError({
        message: "Missing required parameters: org and authToken are required.",
        code: "MISSING_REQUIRED_PARAMETERS",
        status: 400,
      });
    }

    this.config = {
      org,
      authToken,
      queryTimeout,
      authTimeout,
      maxBatchSize,
      maxRetries,
    };

    this.init = this.ensureJWT().then(() => undefined);
    this.init.catch(() => {});
  }

  /** Single query with .all(), .get(), .run() helpers. */
  async execute<T = any>(
    sql: string,
    params: any[] = [],
  ): Promise<ExecuteResult<T>> {
    return this.withAuth((jwt) => execute(this.region!, jwt, sql, params));
  }

  /** Batch — sequential calls. */
  async batch(
    statements: BatchStatement[],
    options: BatchOptions = {},
  ): Promise<BatchResult> {
    const opts = {
      ...options,
      maxSize: options.maxSize ?? this.config.maxBatchSize,
    };
    return this.withAuth((jwt) =>
      batch(this.region!, jwt, statements, opts, () => this.ensureJWT()),
    );
  }

  /** End session — revoke refresh token. */
  async close(): Promise<void> {
    if (this.refreshToken) {
      await auth.logout(baseURL, this.refreshToken);
    }
    this.region = null;
    this.rawToken = null;
    this.refreshToken = null;
    this.rawTokenExp = 0;
  }

  private async withAuth<T>(fn: (jwt: string) => Promise<T>): Promise<T> {
    let jwt = await this.ensureJWT();
    let attempts = 0;

    while (true) {
      try {
        return await fn(jwt);
      } catch (err: any) {
        if (!isUnauthorized(err) || attempts >= this.config.maxRetries) {
          throw err;
        }
        attempts++;
        this.rawToken = null;
        this.rawTokenExp = 0;
        jwt = await this.ensureJWT();
      }
    }
  }

  private async ensureJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    if (this.rawToken && now < this.rawTokenExp - DEFAULTS.refreshBufferS) {
      return this.rawToken;
    }

    // single-flight: if a refresh/login is already in progress, wait for it
    if (this.refreshing) {
      await this.refreshing;
      return this.rawToken!;
    }

    this.refreshing = (async () => {
      if (this.refreshToken) {
        try {
          await this.doRefresh();
          return;
        } catch {
          // fall through to login
        }
      }
      await this.doLogin();
    })();

    try {
      await this.refreshing;
    } finally {
      this.refreshing = null;
    }

    return this.rawToken!;
  }

  private async doLogin(): Promise<void> {
    const data = await auth.login(
      baseURL,
      this.config.authToken,
      this.config.org,
    );
    this.applyAuth(data);
  }

  private async doRefresh(): Promise<void> {
    const data = await auth.refresh(baseURL, this.refreshToken!);
    this.applyAuth(data);
  }

  private applyAuth(data: {
    path: string;
    jwt: string;
    refreshToken: string;
    expiresIn: number;
  }): void {
    this.region = data.path;
    this.rawToken = data.jwt;
    this.refreshToken = data.refreshToken;
    this.rawTokenExp = Math.floor(Date.now() / 1000) + data.expiresIn;
  }
}
