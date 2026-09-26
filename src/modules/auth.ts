import { OrvexError } from "../helpers/errors";
import type { LoginResponse, ApiErrorBody } from "../types";

const LOGIN_TIMEOUT   = 10_000;
const REFRESH_TIMEOUT = 10_000;
const LOGOUT_TIMEOUT  = 10_000;

export async function login(
  apiUrl:    string,
  authToken: string,
  org:       string,
): Promise<LoginResponse> {
  const res = await fetch(new URL("pipeline/connect", apiUrl), {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ token: authToken, org }),
    signal:  AbortSignal.timeout(LOGIN_TIMEOUT),
  });

  const body: any = await res.json().catch(() => ({}));

  if (!res.ok || body.error) throw buildError(body, res.status);

  if (!body.jwt || !body.refreshToken || !body.expiresIn) {
    throw new OrvexError({
      message: "Invalid login response from server.",
      code:    "INVALID_LOGIN_RESPONSE",
      status:  500,
      data:    { body },
    });
  }

  return body as LoginResponse;
}

export async function refresh(
  apiUrl:       string,
  refreshToken: string,
): Promise<LoginResponse> {
  const res = await fetch(new URL("pipeline/renew", apiUrl), {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ refreshToken }),
    signal:  AbortSignal.timeout(REFRESH_TIMEOUT),
  });

  const body: any = await res.json().catch(() => ({}));

  if (!res.ok || body.error) throw buildError(body, res.status);

  if (!body.jwt || !body.refreshToken || !body.expiresIn) {
    throw new OrvexError({
      message: "Invalid refresh response from server.",
      code:    "INVALID_REFRESH_RESPONSE",
      status:  500,
      data:    { body },
    });
  }

  return body as LoginResponse;
}

export async function logout(
  apiUrl:       string,
  refreshToken: string,
): Promise<void> {
  await fetch(new URL("pipeline/disconnect", apiUrl), {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ refreshToken }),
    signal:  AbortSignal.timeout(LOGOUT_TIMEOUT),
  }).catch(() => {});
}

function buildError(body: ApiErrorBody, status: number): OrvexError {
  return new OrvexError({
    message: body?.error ?? "Request failed",
    code:    body?.code  ?? "UNKNOWN_ERROR",
    status:  status      ?? 500,
    data:    body,
  });
}