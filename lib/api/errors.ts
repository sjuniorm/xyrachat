import { NextResponse } from "next/server";

// Stripe-like canonical error shape. Keep this stable — connectors and
// SDKs will pattern-match on `error.type` and `error.code`.
export type ApiErrorType =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "rate_limited"
  | "internal";

const STATUS_FOR: Record<ApiErrorType, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
};

export type ApiError = {
  type: ApiErrorType;
  code: string;
  message: string;
  param?: string;
};

export function apiError(err: ApiError, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { error: err },
    { status: STATUS_FOR[err.type], headers },
  );
}

export function invalidRequest(code: string, message: string, param?: string) {
  return apiError({ type: "invalid_request", code, message, param });
}
export function unauthorized(code = "unauthorized", message = "Missing or invalid API key.") {
  return apiError({ type: "unauthorized", code, message });
}
export function forbidden(code: string, message: string) {
  return apiError({ type: "forbidden", code, message });
}
export function notFound(message = "Resource not found.") {
  return apiError({ type: "not_found", code: "not_found", message });
}
export function unprocessable(code: string, message: string, param?: string) {
  return apiError({ type: "unprocessable", code, message, param });
}
export function rateLimited(retryAfter?: number) {
  return apiError(
    {
      type: "rate_limited",
      code: "rate_limited",
      message: "Too many requests. Slow down.",
    },
    retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
  );
}
export function internalError() {
  return apiError({
    type: "internal",
    code: "internal_error",
    message: "Something went wrong on our side.",
  });
}
