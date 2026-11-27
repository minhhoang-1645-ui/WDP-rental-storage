import { useEffect, useId, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { LoadState } from '../manager/PortalUi';
import { PolicyTabs } from './PolicyTabs';
import './applied-policies.css';
import '../../pages/operations/operations-policies.css';

export type PolicyEffectivity = {
  effectiveFrom: string | null;
  isDefault: boolean;
  effectiveVersion?: number;
};
type PolicyRow = PolicyEffectivity & { key: string; title: string; description?: string; display: string };
export type PolicyGroup = { label: string; icon: LucideIcon; keys: string[] };
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh',
});

export function useAppliedPolicyCatalog<T>() {
  const { user } = useAuth();
  const resource = useApiResource<T>(user ? '/business-policies/applied' : null, [user?.id, user?.role].join(':'), true);
  const { refresh } = resource;
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);
  return resource;
}

export function AppliedPolicyTable({ groups, policies, resource, description, showVersion = false }: {
  groups: PolicyGroup[];
  policies: PolicyRow[];
  resource: { loading: boolean; error: string; status: number | null; refresh: () => void };
  description: string;
  showVersion?: boolean;
}) {
  const id = useId();
  const { hash } = useLocation();
  const linkedTab = groups.findIndex(group => group.keys.includes(hash.slice(1)));
  const [tab, setTab] = useState(Math.max(0, linkedTab));
  useEffect(() => {
    if (linkedTab >= 0) setTab(linkedTab);
  }, [linkedTab, hash]);
  const rowsByKey = new Map(policies.map(policy => [policy.key, policy]));
  const error = resource.error && (resource.status === 403 ? 'Tài khoản hiện không có quyền tra cứu chính sách.'
    : 'Hiện chưa tải được chính sách. Vui lòng thử lại.');

  return <section className="policy-page internal-applied-policy">
    <header className="policy-page-heading"><h1>Chính sách áp dụng</h1><p>{description}</p></header>
    <div className="policy-catalog">
      <PolicyTabs id={id} label="Nhóm chính sách" tabs={groups} current={tab} onChange={setTab} />
      {groups.map((group, index) => {
        const entries = group.keys.flatMap(key => rowsByKey.get(key) ?? []);
        return <section key={group.label} id={id + '-panel-' + index} role="tabpanel"
          aria-labelledby={id + '-tab-' + index} hidden={tab !== index}>
          {tab === index && <>
            <LoadState loading={resource.loading} error={error} retry={resource.refresh} />
            {!resource.loading && !error && (entries.length ? <div className="policy-table-scroll">
              <table className="policy-table" aria-label={group.label}>
                <thead><tr><th scope="col">Chính sách</th><th scope="col">Giá trị đang áp dụng</th><th scope="col">Hiệu lực</th></tr></thead>
                <tbody>{entries.map(policy => {
                  const from = policy.effectiveFrom ? Date.parse(policy.effectiveFrom) : NaN;
                  return <tr key={policy.key} id={policy.key}>
                    <th scope="row">{policy.title}{policy.description && <small>{policy.description}</small>}</th>
                    <td className="policy-active-value">{policy.display}</td>
                    <td>{Number.isFinite(from) ? <time dateTime={policy.effectiveFrom!}>Áp dụng từ {dateTime.format(from)} (UTC+7)</time>
                      : policy.isDefault ? <span className="policy-default-badge">Mặc định</span> : '—'}
                    {showVersion && (policy.effectiveVersion ?? 0) > 0 && <small>Phiên bản {policy.effectiveVersion}</small>}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div> : <p className="policy-empty">Nhóm này chưa có chính sách để hiển thị.</p>)}
          </>}
        </section>;
      })}
    </div>
  </section>;
}
