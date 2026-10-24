import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { allPages } from "./portal";
import type { Page } from "../components/manager/portal-data";
import { hasDraft, useLiveRefresh } from './live-events';

export function usePaginatedResource<T>(
  path: string,
  identity = "",
  refreshOnFocus = false,
) {
  const [revision, setRevision] = useState(0);
  const key = `${identity}:${path}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data: Page<T> | null;
    error: string;
    status: number | null;
    asOf: number;
  }>();
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useLiveRefresh(path, refresh);
  useEffect(() => {
    if (!refreshOnFocus) return;
    const focus = () => { if (!hasDraft()) refresh(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refreshOnFocus, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    allPages<T>(path, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ key, data, error: "", status: null, asOf: Date.now() });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            data: null,
            error:
              error instanceof Error ? error.message : "Không thể tải dữ liệu.",
            status: error instanceof ApiError ? error.status : null,
            asOf: Date.now(),
          });
      });
    return () => controller.abort();
  }, [path, key]);
  const current = result?.key === key ? result : undefined;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    status: current?.status ?? null,
    loading: !current,
    asOf: current?.asOf ?? 0,
    refresh,
  };
}
