export function WorkSummary({ metrics }: { metrics: { label: string; value?: number }[] }) {
  return <dl className="work-summary" aria-label="Tổng quan công việc">
    {metrics.map(({ label, value }) => <div key={label}>
      <dt>{label}</dt>
      <dd>{value ?? <span aria-label="Chưa có số liệu">—</span>}</dd>
    </div>)}
  </dl>;
}
