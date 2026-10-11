import { useEffect, useState } from "react";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { allPages } from "../../services/portal";
import {
  code,
  date,
  first,
  type Row,
} from "../../components/manager/portal-data";
import { LoadState, Status } from "../../components/manager/PortalUi";

export function ManagerContractTransfers({
  contract,
  identity,
}: {
  contract: Row;
  identity: string;
}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    items?: Row[];
    error?: string;
  }>();
  const key = `${identity}:${first(contract, "id")}:${revision}`;
  const contractId = first(contract, "id"),
    contractCode = first(contract, "contractCode");
  useEffect(() => {
    const controller = new AbortController();
    allPages("/manager/transfers", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({
            key,
            items: data.items
              .filter(
                (row) =>
                  (contractId && first(row, "contract.id") === contractId) ||
                  (contractCode &&
                    first(row, "contract.contractCode") === contractCode),
              )
              .sort((a, b) =>
                first(b, "createdAt").localeCompare(first(a, "createdAt")),
              ),
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Không thể tải lịch sử chuyển kho.",
          });
      });
    return () => controller.abort();
  }, [key, contractId, contractCode]);
  const current = state?.key === key ? state : undefined;
  return (
    <section className="manager-section">
      <h2>Lịch sử chuyển kho của hợp đồng</h2>
      <LoadState
        loading={!current}
        error={current?.error ?? ""}
        retry={() => setRevision((value) => value + 1)}
      />
      {current?.items &&
        (current.items.length ? (
          <div className="manager-table-wrap">
            <table className="manager-table">
              <thead>
                <tr>
                  <th>Yêu cầu</th>
                  <th>Kho nguồn</th>
                  <th>Kho đích</th>
                  <th>Trạng thái</th>
                  <th>Hoàn tất</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((row) => (
                  <tr key={first(row, "id")}>
                    <td>
                      <Link
                        className="portal-record-link"
                        to={`/manager/operations/transfers/${encodeURIComponent(first(row, "id"))}`}
                      >
                        {code(row)}
                      </Link>
                    </td>
                    <td>{first(row, "fromUnit.unitCode") || "—"}</td>
                    <td>{first(row, "toUnit.unitCode") || "Chưa chọn"}</td>
                    <td>
                      <Status value={row.status} />
                    </td>
                    <td>{date(row.completedAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Chưa có yêu cầu chuyển kho cho hợp đồng này.</p>
        ))}
    </section>
  );
}
