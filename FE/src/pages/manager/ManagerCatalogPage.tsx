import { RefreshCw } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { useApiResource } from "../../services/useApiResource";
import { ManagerAvailabilityForm } from "./ManagerAvailabilityForm";
import {
  first,
  label,
  money,
  rows,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  LoadState,
  PageHeader,
  Status,
} from "../../components/manager/PortalUi";
export function ManagerCatalogPage() {
  const { user } = useAuth();
  const resource = useApiResource<Row>("/booking/catalog", user?.id ?? "");
  const products = rows(resource.data?.products);
  const categories = new Map(
    rows(resource.data?.sizes).map((row) => [
      first(row, "id"),
      first(row, "name"),
    ]),
  );
  return (
    <section>
      <PageHeader
        title="Loại kho & bảng giá"
        description="Danh mục, kích thước và chính sách giá đang được hệ thống áp dụng."
      >
        <button
          className="button-secondary"
          onClick={resource.refresh}
          disabled={resource.loading}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <LoadState
        loading={resource.loading}
        error={resource.error}
        retry={resource.refresh}
      />
      {resource.data && (
        <>
          {products.length > 0 && (
            <ManagerAvailabilityForm key={user?.id} products={products} />
          )}
          <div className="booking-alert">
            Danh mục hiện chỉ hỗ trợ xem. Backend chưa có API chỉnh sửa loại
            kho, kích thước hoặc giá.
          </div>
          {products.length ? (
            <div className="portal-catalog-grid">
              {products.map((row) => (
                <article className="manager-section" key={first(row, "id")}>
                  <p className="eyebrow">
                    {first(row, "code")} · {label(row.condition)}
                  </p>
                  <h2>{first(row, "name")}</h2>
                  <Status value={first(row, "status").toUpperCase()} />
                  <dl className="manager-facts">
                    <div>
                      <dt>Nhóm kích thước</dt>
                      <dd>
                        {categories.get(first(row, "sizeId")) ||
                          "Chưa cập nhật"}
                      </dd>
                    </div>
                    <div>
                      <dt>Kích thước</dt>
                      <dd>{first(row, "dimensions")}</dd>
                    </div>
                    <div>
                      <dt>Diện tích / Thể tích</dt>
                      <dd>
                        {first(row, "floorArea")} / {first(row, "volume")}
                      </dd>
                    </div>
                    <div>
                      <dt>Giá thuê / tháng</dt>
                      <dd>{money(row.monthlyPrice)}</dd>
                    </div>
                    <div>
                      <dt>Số tháng cọc</dt>
                      <dd>
                        {row.depositMonths == null
                          ? "Cần xác nhận"
                          : first(row, "depositMonths")}
                      </dd>
                    </div>
                    <div>
                      <dt>Thời gian thuê tối thiểu</dt>
                      <dd>
                        {row.minRentalDays == null
                          ? "Cần xác nhận"
                          : `${first(row, "minRentalDays")} ngày`}
                      </dd>
                    </div>
                    <div>
                      <dt>Thuê theo ngày</dt>
                      <dd>
                        {row.allowDailyRental == null
                          ? "Cần xác nhận"
                          : row.allowDailyRental
                            ? "Có hỗ trợ"
                            : "Không hỗ trợ"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </>
      )}
    </section>
  );
}
