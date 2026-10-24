import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { apiRequest } from "./api";
import { allPages } from "./portal";
import type { Page, Row } from "../components/manager/portal-data";
import { hasDraft, useLiveRefresh } from './live-events';
export type PortalSnapshot = {
  asOf: number;
  summary: Row;
  units: Page;
  invoices: Page;
  reservations: Page;
  appointments: Page;
  payments: Page;
};
export function usePortalSnapshot() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: PortalSnapshot;
    error?: string;
  }>();
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useLiveRefresh('/manager/*', refresh);
  const key = `${user?.id}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiRequest<Row>("/manager/dashboard/summary", {
        signal: controller.signal,
      }),
      allPages("/manager/units", controller.signal),
      allPages("/manager/invoices", controller.signal),
      allPages("/manager/reservations", controller.signal),
      allPages("/manager/appointments", controller.signal),
      allPages("/manager/payments", controller.signal),
    ])
      .then(
        ([summary, units, invoices, reservations, appointments, payments]) => {
          if (!controller.signal.aborted)
            setState({
              key,
              data: {
                asOf: Date.now(),
                summary,
                units,
                invoices,
                reservations,
                appointments,
                payments,
              },
            });
        },
      )
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              error instanceof Error ? error.message : "Không thể tải báo cáo.",
          });
      });
    return () => controller.abort();
  }, [key]);
  useEffect(() => {
    const focus = () => { if (!hasDraft()) refresh(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  const current = state?.key === key ? state : undefined;
  return {
    data: current?.data,
    error: current?.error ?? "",
    loading: !current,
    refresh,
  };
}
