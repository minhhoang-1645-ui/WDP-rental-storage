import { EntitySelect } from '../EntitySelect';
import { InternalPagination } from '../workspace/InternalPagination';
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { LoadingSkeleton, type SkeletonLayout } from "../LoadingSkeleton";
import { useAuth } from "../../auth/auth-context";
import { apiRequest } from "../../services/api";
import { allPages } from "../../services/portal";
import { code, first, label, type Page, type Row } from "./portal-data";
import { normalizeSearch } from '../../utils/notification-tools';

export function Status({ value, text }: { value: unknown; text?: string }) {
  const status = typeof value === "string" ? value : "";
  return (
    <span className={`manager-status is-${status.toLowerCase()}`}>
      {text ?? label(status)}
    </span>
  );
}
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const { user } = useAuth();
  const workspace = user?.role === 'ADMIN' ? 'QUẢN TRỊ' : user?.role === 'MANAGER' ? 'QUẢN LÝ' : user?.role === 'STAFF' ? 'NHÂN VIÊN' : 'TÀI KHOẢN';
  return (
    <header className="manager-page-header">
      <div>
        <p className="eyebrow">NESTBOX STORAGE / {workspace}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="portal-actions">{children}</div>
    </header>
  );
}
export function LoadState({
  loading,
  error,
  retry,
  layout,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  layout?: SkeletonLayout;
}) {
  return loading ? (
    <LoadingSkeleton layout={layout} />
  ) : error ? (
    <div className="booking-alert is-error" role="alert">
      {error}
      <button className="button-secondary" onClick={retry}>
        Thử lại
      </button>
    </div>
  ) : null;
}
export function Empty({
  title = "Không tìm thấy dữ liệu",
  description = "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="manager-empty">
      <Search size={28} />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
export function Pagination({
  page,
  limit,
  total,
  onChange,
  disabled = false,
  onLimitChange,
}: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  onLimitChange?: (limit: number) => void;
}) {
  return <InternalPagination page={page} limit={limit} total={total} onChange={onChange} disabled={disabled} onLimitChange={onLimitChange} />;
}
export function Modal({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="portal-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Đóng"
          onClick={onClose}
          disabled={busy}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="manager-facts">
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function RecordPicker({
  path,
  value,
  onChange,
  title,
  local = false,
  accept,
  describe = code,
  disabled = false,
}: {
  path: string | null;
  value: string;
  onChange: (value: string, record?: Row) => void;
  title: string;
  local?: boolean;
  accept?: (row: Row) => boolean;
  describe?: (row: Row) => string;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [state, setState] = useState<{
    key: string;
    data?: Page;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0);
  const [picked, setPicked] = useState<Row>();
  const key = `${user?.id}:${path}:${local ? "" : search}:${page}:${limit}:${revision}`;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const url = `${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=${limit}&search=${encodeURIComponent(search.trim())}`;
      const request = local
        ? allPages(path, controller.signal)
        : apiRequest<Page>(url, { signal: controller.signal });
      request
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
                  : "Không thể tải lựa chọn.",
            });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, path, local, page, limit, search]);
  const current = state?.key === key ? state : undefined;
  const choices = (current?.data?.items ?? []).filter(
    (row) =>
      (!accept || accept(row)) &&
      (!local ||
        normalizeSearch(JSON.stringify(row)).includes(normalizeSearch(search))),
  );
  const selected =
    choices.find((row) => first(row, "id") === value) ??
    (picked && first(picked, "id") === value ? picked : undefined);
  return (
    <div className="portal-picker">
      <label className="field-label">
        {title}
        <input
          type="search"
          placeholder="Tìm để chọn…"
          aria-label={`Tìm ${title.toLowerCase()}`}
          value={search}
          disabled={disabled || !path}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </label>
      {path && !current && <small role="status">Đang tải lựa chọn…</small>}
      {current?.error && (
        <div role="alert">
          {current.error}
          <button type="button" onClick={() => setRevision((v) => v + 1)}>
            Thử lại
          </button>
        </div>
      )}
      <EntitySelect
        aria-label={title}
        value={value}
        disabled={disabled || !current?.data}
        onValueChange={(selectedValue) => {
          const record = choices.find(
            (row) => first(row, "id") === selectedValue,
          );
          setPicked(record);
          onChange(selectedValue, record);
        }}
      >
        <option value="">Chọn {title.toLowerCase()}</option>
        {selected && !choices.includes(selected) && (
          <option value={value}>{describe(selected)}</option>
        )}
        {choices.map((row) => (
          <option key={first(row, "id")} value={first(row, "id")}>
            {describe(row)}
          </option>
        ))}
      </EntitySelect>
      {current?.data && !choices.length && (
        <small>Không có lựa chọn phù hợp.</small>
      )}
      {!local && current?.data && current.data.total > 5 && (
        <Pagination
          page={page}
          limit={limit}
          onLimitChange={value => { setLimit(value); setPage(1); }}
          total={current.data.total}
          onChange={setPage}
        />
      )}
    </div>
  );
}
