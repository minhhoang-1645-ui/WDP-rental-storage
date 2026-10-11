import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { allPages, mutate } from "../../services/portal";
import { apiRequest } from "../../services/api";
import {
  first,
  label,
  type Page,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  Facts,
  LoadState,
  Modal,
  PageHeader,
  Pagination,
  Status,
} from "../../components/manager/PortalUi";

export function AdminAccountsPage({
  statusOnly = false,
}: {
  statusOnly?: boolean;
}) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<{
    key: string;
    data?: Page;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [notice, setNotice] = useState("");
  const search = params.get("search") ?? "";
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const key = `${user?.id}:${revision}`;
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    const controller = new AbortController();
    allPages("/admin/users", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Không thể tải tài khoản.",
          });
      });
    return () => controller.abort();
  }, [key]);
  const current = state?.key === key ? state : undefined;
  const items = (current?.data?.items ?? []).filter(
    (row) =>
      (!role || row.role === role) &&
      (!status || row.accountStatus === status) &&
      (!search ||
        [row.fullName, row.email, row.phone]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(search.trim().toLocaleLowerCase("vi"))),
  );
  const change = (name: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(name, value);
        else next.delete(name);
        if (name !== "page") next.delete("page");
        return next;
      },
      { replace: true },
    );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / 20)));
  return (
    <section>
      <PageHeader
        title={statusOnly ? "Trạng thái tài khoản" : "Quản lý tài khoản"}
        description={
          statusOnly
            ? "Kích hoạt hoặc vô hiệu hóa quyền truy cập của tài khoản."
            : "Cấp tài khoản nội bộ và xem thông tin người dùng."
        }
      >
        {!statusOnly && (
          <button className="button-primary" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Tạo tài khoản
          </button>
        )}
        <button
          className="button-secondary"
          onClick={refresh}
          disabled={!current}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      {notice && (
        <div className="portal-success" role="status">
          {notice}
        </div>
      )}
      <div className="portal-toolbar">
        <label className="field-label portal-search">
          Tìm tài khoản
          <input
            type="search"
            value={search}
            placeholder="Họ tên, email, số điện thoại…"
            onChange={(e) => change("search", e.target.value)}
          />
        </label>
        <label className="field-label">
          Vai trò
          <select value={role} onChange={(e) => change("role", e.target.value)}>
            <option value="">Tất cả</option>
            {["CUSTOMER", "STAFF", "MANAGER", "ADMIN"].map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Trạng thái
          <select
            value={status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="DISABLED">Đã vô hiệu hóa</option>
          </select>
        </label>
        {params.size > 0 && (
          <button className="button-secondary" onClick={() => setParams({})}>
            Xóa bộ lọc
          </button>
        )}
      </div>
      <LoadState
        loading={!current}
        error={current?.error ?? ""}
        retry={refresh}
      />
      {current?.data && (
        <>
          <div className="portal-result-heading">
            <span>{items.length} tài khoản</span>
            <small>Tìm kiếm trên toàn bộ danh sách</small>
          </div>
          {items.length ? (
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th>Liên hệ</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .slice((currentPage - 1) * 20, currentPage * 20)
                    .map((row) => (
                      <tr key={first(row, "id")}>
                        <td>
                          <strong>{first(row, "fullName")}</strong>
                          {row.id === user?.id && (
                            <small>Tài khoản của bạn</small>
                          )}
                        </td>
                        <td>
                          {first(row, "email")}
                          <small>{first(row, "phone")}</small>
                        </td>
                        <td>
                          <Status value={row.role} />
                        </td>
                        <td>
                          <Status value={row.accountStatus} />
                        </td>
                        <td>
                          <button
                            className="button-secondary"
                            onClick={() => setSelected(first(row, "id"))}
                          >
                            Xem tài khoản
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
          <Pagination
            page={currentPage}
            limit={20}
            total={items.length}
            onChange={(v) => change("page", String(v))}
          />
        </>
      )}
      {creating && (
        <CreateUser
          onClose={() => setCreating(false)}
          onSuccess={(row) => {
            setCreating(false);
            setNotice(`Đã tạo tài khoản ${first(row, "fullName")}.`);
            refresh();
          }}
        />
      )}
      {selected && (
        <AccountDetail
          id={selected}
          onClose={() => setSelected(undefined)}
          onSuccess={(message) => {
            setNotice(message);
            refresh();
          }}
        />
      )}
    </section>
  );
}
function CreateUser({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (row: Row) => void;
}) {
  const [role, setRole] = useState("STAFF");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const data = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      onSuccess(
        await mutate("/admin/users", "POST", {
          fullName: String(data.get("fullName")).trim(),
          email: String(data.get("email")).trim(),
          phone: String(data.get("phone")).trim(),
          password: String(data.get("password")),
          role,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể tạo tài khoản.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title="Cấp tài khoản nội bộ" onClose={onClose} busy={busy}>
      <form className="portal-form" onSubmit={submit}>
        <p>Tạo tài khoản cho nhân viên hoặc quản lý cơ sở.</p>
        {error && (
          <div className="booking-alert is-error" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={busy}>
          <label className="field-label">
            Họ và tên
            <input
              name="fullName"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label className="field-label">
            Email
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </label>
          <label className="field-label">
            Số điện thoại
            <input
              type="tel"
              name="phone"
              required
              minLength={8}
              maxLength={25}
              autoComplete="tel"
            />
          </label>
          <label className="field-label">
            Vai trò
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="STAFF">Nhân viên</option>
              <option value="MANAGER">Quản lý</option>
            </select>
          </label>
          <label className="field-label">
            Mật khẩu ban đầu
            <div className="portal-password">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
        </fieldset>
        <div className="portal-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          <button className="button-primary" disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function AccountDetail({
  id,
  onClose,
  onSuccess,
}: {
  id: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const { user } = useAuth();
  const [row, setRow] = useState<Row>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Row>(`/admin/users/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setRow(value);
      })
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Không thể tải tài khoản.",
          );
      });
    return () => controller.abort();
  }, [id, revision]);
  const changeStatus = async () => {
    if (!row || !confirmed || lock.current || id === user?.id) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await mutate(
        `/admin/users/${encodeURIComponent(id)}/status`,
        "PATCH",
        {
          accountStatus: row.accountStatus === "ACTIVE" ? "DISABLED" : "ACTIVE",
        },
      );
      setRow(updated);
      setConfirmed(false);
      onSuccess(
        `Đã cập nhật trạng thái tài khoản ${first(updated, "fullName")}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể cập nhật tài khoản.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title="Thông tin tài khoản" onClose={onClose} busy={busy}>
      <div className="portal-form">
        {error && (
          <div className="booking-alert is-error" role="alert">
            {error}
            <button
              onClick={() => {
                setError("");
                setRevision((v) => v + 1);
              }}
            >
              Thử lại
            </button>
          </div>
        )}
        {row ? (
          <>
            <div className="portal-account-heading">
              <ShieldCheck size={25} />
              <strong>{first(row, "fullName")}</strong>
              <Status value={row.accountStatus} />
            </div>
            <Facts
              items={[
                ["Email", first(row, "email")],
                ["Số điện thoại", first(row, "phone") || "Chưa cập nhật"],
                ["Vai trò", label(row.role)],
                ["Mã tài khoản", first(row, "id")],
              ]}
            />
            {row.role === "STAFF" && (
              <small>Mã tài khoản dùng để phân công hỗ trợ và bảo trì.</small>
            )}
            {id === user?.id ? (
              <p>Bạn đang dùng tài khoản này.</p>
            ) : (
              <>
                <p>
                  {row.accountStatus === "ACTIVE"
                    ? "Vô hiệu hóa sẽ chặn đăng nhập và truy cập. Hồ sơ nghiệp vụ vẫn được giữ lại."
                    : "Kích hoạt lại quyền đăng nhập cho tài khoản này."}
                </p>
                <label className="portal-checkbox">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    disabled={busy}
                  />
                  Xác nhận{" "}
                  {row.accountStatus === "ACTIVE" ? "vô hiệu hóa" : "kích hoạt"}{" "}
                  tài khoản
                </label>
                <button
                  className={
                    row.accountStatus === "ACTIVE"
                      ? "button-secondary portal-danger"
                      : "button-primary"
                  }
                  disabled={!confirmed || busy}
                  onClick={changeStatus}
                >
                  {busy
                    ? "Đang lưu…"
                    : row.accountStatus === "ACTIVE"
                      ? "Vô hiệu hóa tài khoản"
                      : "Kích hoạt tài khoản"}
                </button>
              </>
            )}
          </>
        ) : (
          !error && <p role="status">Đang tải thông tin…</p>
        )}
      </div>
    </Modal>
  );
}
