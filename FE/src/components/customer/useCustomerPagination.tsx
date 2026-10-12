import { useSearchParams } from "react-router-dom";
import { Pagination } from "../manager/PortalUi";

export function useCustomerPagination<T>(records: T[]) {
  const [params, setParams] = useSearchParams();
  const page = Math.min(
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
    Math.max(1, Math.ceil(records.length / 20)),
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
    items: records.slice((page - 1) * 20, page * 20),
    reset: () => change(1),
    pagination:
      records.length > 20 ? (
        <Pagination
          page={page}
          limit={20}
          total={records.length}
          onChange={change}
        />
      ) : null,
  };
}
