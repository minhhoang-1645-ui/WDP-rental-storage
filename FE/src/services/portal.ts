import { apiRequest } from "./api";
import { AUTH_TOKEN_KEY } from "../data/booking";
import type { Page, Row } from "../components/manager/portal-data";

// Fetch every page for endpoints that do not implement search/filter or aggregates.
export async function allPages<T = Row>(
  path: string,
  signal?: AbortSignal,
  expectedToken: string | null = localStorage.getItem(AUTH_TOKEN_KEY),
): Promise<Page<T>> {
  const [pathname, search = ""] = path.split("?", 2);
  const params = new URLSearchParams(search);
  params.set("limit", "100");
  params.set("page", "1");
  const head = await apiRequest<Page<T>>(`${pathname}?${params}`, {
    signal, expectedToken,
  });
  if (!head || !Array.isArray(head.items) || !Number.isSafeInteger(head.total) || head.total < 0 || !Number.isSafeInteger(head.limit) || head.limit < 1) throw new Error('Danh sách trả về không hợp lệ.');
  const items = [...head.items];
  for (let page = 2; page <= Math.ceil(head.total / head.limit); page++) {
    params.set("page", String(page));
    const next = await apiRequest<Page<T>>(`${pathname}?${params}`, { signal, expectedToken });
    if (!next || !Array.isArray(next.items)) throw new Error('Danh sách trả về không hợp lệ.');
    items.push(...next.items);
  }
  return { ...head, items };
}
const retryKeys = new Map<string, string>();
export async function mutate<T = Row>(
  path: string,
  method: "POST" | "PATCH",
  input?: Row,
  idempotent = false,
): Promise<T> {
  const body = input === undefined ? undefined : JSON.stringify(input);
  const fingerprint = `${localStorage.getItem(AUTH_TOKEN_KEY)}:${method}:${path}:${body ?? ""}`;
  const key = idempotent
    ? (retryKeys.get(fingerprint) ?? `portal-${crypto.randomUUID()}`)
    : "";
  if (key) retryKeys.set(fingerprint, key);
  const result = await apiRequest<T>(path, {
    method,
    body,
    ...(key ? { headers: { "Idempotency-Key": key } } : {}),
  });
  retryKeys.delete(fingerprint);
  return result;
}
