import { PortalError, PortalLoading } from "./CustomerPortalUi";

export function CustomerFormSources({
  resources,
  retry,
}: {
  resources: Array<{ loading: boolean; error: string }>;
  retry: () => void;
}) {
  const error = resources.find((resource) => resource.error)?.error;
  if (error) return <PortalError message={error} onRetry={retry} />;
  return resources.some((resource) => resource.loading) ? (
    <PortalLoading label="Đang tải hồ sơ đủ điều kiện…" />
  ) : null;
}
