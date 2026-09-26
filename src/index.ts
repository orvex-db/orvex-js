import { Client } from "./modules/client";
export { OrvexError } from "./helpers/errors";
import type { ClientConfig } from "./types";

export function createClient(config: ClientConfig): Client {
  return new Client(config);
}

export type {
  ClientConfig,
  LoginResponse,
  ApiErrorBody,
  ExecuteResult,
  BatchStatement,
  BatchItemResult,
  BatchResult,
  BatchOptions
} from "./types";

export const VERSION = "0.1.1";