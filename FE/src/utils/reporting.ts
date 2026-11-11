type Row = Record<string, any>;
export type ReportGroup = "day" | "week" | "month" | "year";
export type ReportPeriod = ReportGroup | "all" | "custom";
export function reportMoney(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(value)
    : "Chưa đủ số liệu";
}
const dateOnly = (value: string) => new Date(value + "T00:00:00Z");
export function reportDay(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return "";
  return new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 10);
}
export function reportRange(period: ReportPeriod, today: string) {
  const date = dateOnly(today),
    year = date.getUTCFullYear(),
    month = date.getUTCMonth();
  if (period === "all" || period === "custom") return { from: "", to: "" };
  if (period === "day") return { from: today, to: today };
  if (period === "month")
    return {
      from: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
      to: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
    };
  if (period === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
}
function bucket(day: string, group: ReportGroup) {
  if (group === "month") return day.slice(0, 7);
  if (group === "year") return day.slice(0, 4);
  if (group === "week") return reportRange("week", day).from;
  return day;
}
export function reportBucketLabel(value: string, group: ReportGroup) {
  if (group === "year") return value;
  if (group === "month") return value.slice(5, 7) + "/" + value.slice(0, 4);
  const label =
    value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4);
  return group === "week" ? "Tuần từ " + label : label;
}
export function reportType(row: Row): { id: string; name: string } {
  const type = row.storageType ?? row.product ?? row.reservation?.storageType ?? row.reservation?.product ?? {};
  return {
    id: type.id ?? "unknown",
    name: type.name ?? "Chưa xác định loại kho",
  };
}
export function buildReport(
  invoices: Row[],
  payments: Row[],
  reservations: Row[],
  options: { from: string; to: string; group: ReportGroup; typeId: string },
) {
  const accepts = (row: Row, field: string) => {
    const day = reportDay(row[field]);
    return (
      Boolean(day) &&
      (!options.from || day >= options.from) &&
      (!options.to || day <= options.to) &&
      (!options.typeId || reportType(row).id === options.typeId)
    );
  };
  const issued = invoices.filter((row) => accepts(row, "issuedAt"));
  const valid = issued.filter((row) => row.status !== "VOID");
  const invoiceById = new Map(invoices.map((row) => [row.id, row]));
  const received = payments.filter((row) => {
    const day = reportDay(row.receivedAt);
    return (
      (!options.typeId ||
        reportType(invoiceById.get(row.invoice?.id) ?? row.invoice ?? row)
          .id === options.typeId) &&
      Boolean(day) &&
      (!options.from || day >= options.from) &&
      (!options.to || day <= options.to)
    );
  });
  const bookings = reservations.filter((row) => accepts(row, "createdAt"));
  const categories = new Map<
    string,
    {
      id: string;
      name: string;
      requests: number;
      confirmed: number;
      units: number;
      rent: number;
    }
  >();
  const times = new Map<
    string,
    { date: string; rent: number; received: number; bookings: number }
  >();
  const category = (row: Row) => {
    const type = reportType(row);
    if (!categories.has(type.id))
      categories.set(type.id, {
        ...type,
        requests: 0,
        confirmed: 0,
        units: 0,
        rent: 0,
      });
    return categories.get(type.id)!;
  };
  const time = (value: unknown) => {
    const key = bucket(reportDay(value), options.group);
    if (!times.has(key))
      times.set(key, { date: key, rent: 0, received: 0, bookings: 0 });
    return times.get(key)!;
  };
  const amount = (row: Row, key: string) =>
    typeof row[key] === "number" &&
    Number.isSafeInteger(row[key]) &&
    row[key] >= 0
      ? row[key]
      : Number.NaN;
  for (const row of bookings) {
    const group = category(row);
    group.requests++;
    if (row.status === "CONFIRMED") group.confirmed++;
    group.units += amount(row, "quantity");
    time(row.createdAt).bookings++;
  }
  for (const row of valid) {
    category(row).rent += amount(row, "rentalAmount");
    time(row.issuedAt).rent += amount(row, "rentalAmount");
  }
  for (const row of received)
    time(row.receivedAt).received += amount(row, "amount");
  return {
    invoices: valid,
    payments: received,
    bookings,
    voidCount: issued.length - valid.length,
    categories: [...categories.values()].sort(
      (a, b) => b.requests - a.requests || a.name.localeCompare(b.name, "vi"),
    ),
    times: [...times.values()].sort((a, b) => a.date.localeCompare(b.date)),
    rent: valid.reduce((n, row) => n + amount(row, "rentalAmount"), 0),
    deposit: valid.reduce((n, row) => n + amount(row, "depositAmount"), 0),
    received: received.reduce((n, row) => n + amount(row, "amount"), 0),
    total: valid.reduce((n, row) => n + amount(row, "totalAmount"), 0),
    paid: valid.reduce((n, row) => n + amount(row, "amountPaid"), 0),
    debt: valid.reduce((n, row) => n + amount(row, "balanceDue"), 0),
    missingPayments: received.filter(
      (row) => !Number.isFinite(amount(row, "amount")),
    ).length,
    missingAmounts: valid.filter((row) =>
      [
        "rentalAmount",
        "depositAmount",
        "totalAmount",
        "amountPaid",
        "balanceDue",
      ].some(
        (key) =>
          typeof row[key] !== "number" ||
          !Number.isSafeInteger(row[key]) ||
          row[key] < 0,
      ),
    ).length,
  };
}
