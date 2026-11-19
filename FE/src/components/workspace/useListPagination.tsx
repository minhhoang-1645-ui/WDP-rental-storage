import { useSearchParams } from "react-router-dom";
import { internalPageSize, PAGE_SIZE_OPTIONS } from "../../utils/internal-pagination";
import { InternalPagination } from "./InternalPagination";

export function useListPagination<T>(records: T[], keys = { page: "page", limit: "limit" }) {
  const [params, setParams] = useSearchParams();
  const limit = internalPageSize(params, keys.limit);
  const page = Math.min(
    Math.max(1, Math.floor(Number(params.get(keys.page)) || 1)),
    Math.max(1, Math.ceil(records.length / limit)),
  );
  const change = (value: number) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value > 1) next.set(keys.page, String(value));
        else next.delete(keys.page);
        return next;
      },
      { replace: true },
    );
  return {
    items: records.slice((page - 1) * limit, page * limit),
    reset: () => change(1),
    pagination:
      records.length > PAGE_SIZE_OPTIONS[0] ? (
        <InternalPagination
          page={page}
          limit={limit}
          onLimitChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set(keys.limit, String(value)); next.delete(keys.page); return next; }, { replace: true })}
          total={records.length}
          onChange={change}
        />
      ) : null,
  };
}
