import { isOverdueInvoice } from "@/utils/work-queue";
import { ReportPie } from "@/components/report-pie";
import { FormInput } from './form';
import { pieColors } from "@/utils/report-pie";
import { useState } from "react";
import { DateField } from "@/components/date-field";
import {
  buildReport,
  reportMoney as money,
  reportDay,
  reportRange,
  reportType,
  reportBucketLabel,
  type ReportGroup,
  type ReportPeriod,
} from "@/utils/reporting";
import { ScrollView, Text, View } from "react-native";
import { useAuth } from "@/auth/use-auth";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/screen-state";
import { operationRoot, rows, type Row } from "./model";
import { RecordView } from "./record-view";
import { useResource } from "./use-resource";
import { Button, Facts, Navigation, Panel, styles } from "./ui";

export function Reports() {
  const { user } = useAuth();
  const root = operationRoot(user?.role ?? "");
  const summary = useResource<Row>("/manager/dashboard/summary");
  const invoices = useResource<Row>("/manager/invoices", true);
  const payments = useResource<Row>("/manager/payments", true);
  const bookings = useResource<Row>("/manager/reservations", true);
  const inventory = useResource<Row>("/manager/units", true);
  const [from, setFrom] = useState(
      () => reportRange("month", reportDay(new Date().toISOString())).from,
    ),
    [to, setTo] = useState(
      () => reportRange("month", reportDay(new Date().toISOString())).to,
    ),
    [period, setPeriod] = useState<ReportPeriod>("month"),
    [group, setGroup] = useState<ReportGroup>("month"),
    [typeId, setTypeId] = useState("");
  const result = buildReport(
    rows(invoices.data?.items),
    rows(payments.data?.items),
    rows(bookings.data?.items),
    { from, to, group, typeId },
  );
  const types = [
    ...new Map(
      [
        ...rows(invoices.data?.items),
        ...rows(bookings.data?.items),
        ...rows(inventory.data?.items),
      ].map((item) => {
        const type = reportType(item);
        return [type.id, type] as const;
      }),
    ).values(),
  ];
  const selectPeriod = (value: ReportPeriod) => {
    const range = reportRange(value, reportDay(new Date().toISOString()));
    setPeriod(value);
    setFrom(range.from);
    setTo(range.to);
    if (value !== "all" && value !== "custom") setGroup(value);
  };
  const maxRent = Math.max(
      1,
      ...result.categories.map((item) => item.rent).filter(Number.isFinite),
    ),
    maxRequests = Math.max(
      1,
      ...result.categories.map((item) => item.requests),
    );
  const refresh = () => {
    inventory.refresh();
    summary.refresh();
    invoices.refresh();
    payments.refresh();
    bookings.refresh();
  };
  const loading =
    summary.loading ||
    invoices.loading ||
    payments.loading ||
    bookings.loading ||
    inventory.loading;
  const error =
    summary.error ||
    invoices.error ||
    payments.error ||
    bookings.error ||
    inventory.error;
  const validInvoices = result.invoices;
  const units = rows(inventory.data?.items).filter(
    (item) => !typeId || reportType(item).id === typeId,
  );

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
    >
      <PageHeader
        eyebrow="Quản lý vận hành"
        title="Báo cáo vận hành"
        description="Tổng hợp toàn bộ hóa đơn, khoản thu và tình hình sử dụng kho."
      />
      <Navigation title="Về tổng quan" path={root} />
      <Button title="Làm mới báo cáo" onPress={refresh} disabled={loading} />
      <Panel title="Chọn thời gian">
        <View style={styles.row}>
          {(
            [
              ["day", "Hôm nay"],
              ["week", "Tuần này"],
              ["month", "Tháng này"],
              ["year", "Năm nay"],
              ["all", "Tất cả"],
            ] as const
          ).map(([value, title]) => (
            <Button
              key={value}
              title={title}
              variant={period === value ? "primary" : "secondary"}
              onPress={() => selectPeriod(value)}
            />
          ))}
        </View>
        <DateField
          title="Từ ngày"
          value={from}
          onChange={(value) => {
            setFrom(value);
            setPeriod("custom");
          }}
        />
        <DateField
          title="Đến ngày"
          value={to}
          onChange={(value) => {
            setTo(value);
            setPeriod("custom");
          }}
        />
        <Text style={styles.label}>Gom biểu đồ theo</Text>
        <View style={styles.row}>
          {(
            [
              ["day", "Ngày"],
              ["week", "Tuần"],
              ["month", "Tháng"],
              ["year", "Năm"],
            ] as const
          ).map(([value, title]) => (
            <Button
              key={value}
              title={title}
              variant={group === value ? "primary" : "secondary"}
              onPress={() => setGroup(value)}
            />
          ))}
        </View>
        <FormInput field={{ name: 'reportType', title: 'Loại kho báo cáo', required: true, compactChoices: true, choices: [{ value: '__all_types__', label: 'Tất cả loại kho' }, ...types.map(type => ({ value: type.id, label: type.name }))] }} value={typeId || '__all_types__'} onChange={value => setTypeId(value === '__all_types__' ? '' : value)} busy={false} />
      </Panel>
      {from && to && from > to ? (
        <Text style={styles.error}>
          Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.
        </Text>
      ) : loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          {result.missingAmounts + result.missingPayments > 0 && (
            <Text style={styles.error}>
              Một số hồ sơ thiếu số tiền hợp lệ. Chỉ số liên quan ghi “Chưa đủ
              số liệu”; hãy kiểm tra trước khi dùng báo cáo.
            </Text>
          )}
          <ReportPie
            title="Lượt đặt theo loại kho"
            description="Tỷ lệ lượt gửi đặt trong thời gian đã chọn. Một đơn nhiều kho vẫn tính một lượt."
            data={result.categories.map((item, index) => ({
              id: item.id,
              label: item.name,
              value: item.requests,
              color: pieColors[index % pieColors.length],
            }))}
          />
          <ReportPie
            title="Tiền thuê theo loại kho"
            description="Tỷ trọng tiền thuê trên hóa đơn phát hành trong thời gian đã chọn; không gồm cọc, dịch vụ và phí."
            formatValue={money}
            unit=""
            data={result.categories.map((item, index) => ({
              id: item.id,
              label: item.name,
              value: item.rent,
              color: pieColors[index % pieColors.length],
            }))}
          />
          <ReportPie
            title="Tình trạng kho hiện tại"
            description="Tình trạng khi tải báo cáo theo loại kho đã chọn; không phải tình trạng của một ngày trong quá khứ."
            unit="kho"
            data={[
              { id: "OCCUPIED", label: "Đang dùng", color: "#355a8d" },
              { id: "AVAILABLE", label: "Sẵn sàng", color: "#398779" },
              { id: "RESERVED", label: "Đang giữ", color: "#c78138" },
              { id: "MAINTENANCE", label: "Bảo trì", color: "#b95f68" },
            ].map((item) => ({
              ...item,
              value: units.filter((row) => row.status === item.id).length,
            }))}
          />
          <Panel title="Tiền thuê và lượt đặt theo loại kho">
            <Text style={styles.copy}>
              Tiền thuê trên hóa đơn không gồm cọc, dịch vụ; chưa có nghĩa đã
              nhận đủ tiền. Một đơn tính là một lượt gửi đặt kho.
            </Text>
            {result.categories.map((item) => (
              <View key={item.id} style={{ gap: 8 }}>
                <Text style={styles.label}>{item.name}</Text>
                <Text style={styles.copy}>
                  {item.requests} lượt gửi · {item.confirmed} đã xác nhận
                </Text>
                <View style={{ height: 10, backgroundColor: "#edf1f7" }}>
                  <View
                    style={{
                      height: 10,
                      width: `${(item.requests / maxRequests) * 100}%`,
                      backgroundColor: "#355a8d",
                    }}
                  />
                </View>
                <Text style={styles.copy}>{money(item.rent)} tiền thuê</Text>
                <View style={{ height: 10, backgroundColor: "#edf1f7" }}>
                  <View
                    style={{
                      height: 10,
                      width: `${Number.isFinite(item.rent / maxRent) ? (item.rent / maxRent) * 100 : 0}%`,
                      backgroundColor: "#397b78",
                    }}
                  />
                </View>
              </View>
            ))}
          </Panel>
          <Panel title="Theo thời gian">
            {result.times.map((item) => (
              <View key={item.date}>
                <Text style={styles.label}>
                  {reportBucketLabel(item.date, group)}
                </Text>
                <Text style={styles.copy}>
                  Tiền thuê: {money(item.rent)} · Tiền đã nhận:{" "}
                  {money(item.received)} · {item.bookings} lượt đặt
                </Text>
              </View>
            ))}
            {!result.times.length && (
              <Text style={styles.copy}>Chưa có số liệu phù hợp.</Text>
            )}
          </Panel>
          {summary.data && (
            <Panel title="Tình hình hiện tại của cơ sở">
              <RecordView row={summary.data} root={root} />
            </Panel>
          )}
          <Panel title="Hóa đơn và khoản thu">
            <Facts
              values={[
                ["Số hóa đơn còn hiệu lực", validInvoices.length],
                ["Tiền thuê trên hóa đơn", money(result.rent)],
                ["Tiền cọc trên hóa đơn", money(result.deposit)],
                ["Tổng giá trị hóa đơn", money(result.total)],
                ["Đã thanh toán trên hóa đơn", money(result.paid)],
                ["Còn lại (gồm kỳ chưa đến hạn)", money(result.debt)],
                [
                  "Đã quá hạn, chưa trả",
                  money(
                    validInvoices
                      .filter((row) => isOverdueInvoice(row))
                      .reduce((sum, row) => sum + Number(row.balanceDue), 0),
                  ),
                ],
                ["Khoản thu đã ghi nhận", money(result.received)],
              ]}
            />
            <Text style={styles.copy}>
              Bỏ qua hóa đơn đã hủy. Giá trị hóa đơn là tổng tiền thuê, cọc,
              dịch vụ và phí; đã thanh toán và dư nợ lấy từ từng hóa đơn. Báo
              cáo không tính lợi nhuận hay dự báo.
            </Text>
            <Text style={styles.copy}>
              Khoản thu gồm tiền thuê, tiền cọc và khoản phí theo hóa đơn; không
              được coi toàn bộ là doanh thu thuê kho.
            </Text>
          </Panel>
        </>
      )}
    </ScrollView>
  );
}
