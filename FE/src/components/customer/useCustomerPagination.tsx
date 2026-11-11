import { useSearchParams } from "react-router-dom";
import { internalPageSize } from "../../utils/internal-pagination";
import { Pagination } from "../manager/PortalUi";

export function useCustomerPagination<T>(records: T[]) {
  const [params, setParams] = useSearchParams();
  const limit = internalPageSize(params);
  const page = Math.min(
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
    Math.max(1, Math.ceil(records.length / limit)),
  );
  const change = (value: number) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value > 1) next.set("page", String(value));
        else next.delete("page");
        return next;
      },
      { replace: true },
    );
  return {
    items: records.slice((page - 1) * limit, page * limit),
    reset: () => change(1),
    pagination:
      records.length > 5 ? (
        <Pagination
          page={page}
          limit={limit}
          onLimitChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set("limit", String(value)); next.delete("page"); return next; }, { replace: true })}
          total={records.length}
          onChange={change}
        />
      ) : null,
  };
}
