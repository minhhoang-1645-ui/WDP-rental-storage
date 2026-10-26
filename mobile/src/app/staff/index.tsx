import { ScrollView, Text } from "react-native";
import { useAuth } from "@/auth/use-auth";
import { PageHeader } from "@/components/page-header";
import {
  FunctionMenu,
  WorkHub,
  WorkflowHint,
} from "@/components/workspace-hub";
import { Button, Navigation, Panel, styles } from "@/operations/ui";
import { codeOf, text, label } from "@/operations/model";
import { formatDate } from "@/utils/format";
import { ActivitySummary } from "@/activity/ActivityCenter";
import { useActivity } from "@/activity/context";
import { activitySources } from "@/utils/activity";
import {
  awaitingAssignment,
  staffNeedsAction,
  staffWorkGroups,
  staffWorkRank,
} from "@/utils/work-queue";

export default function StaffHomeScreen() {
  const { user } = useAuth();
  const activity = useActivity();
  const sources = activitySources("STAFF");
  const groups = staffWorkGroups.map((group) => {
    const items = activity.data[group.resource] ?? [];
    return {
      ...group,
      path: `/staff/${group.resource}`,
      items: items.filter((row) =>
        staffNeedsAction(group.resource, row, user?.id ?? ""),
      ),
      waiting: items.filter((row) => awaitingAssignment(group.resource, row))
        .length,
      unavailable:
        activity.loading ||
        !activity.data[group.resource] ||
        activity.failed.includes(
          sources.find((source) => source.kind === group.resource)!.title,
        ),
    };
  });
  const queue = groups
    .flatMap((group) =>
      group.items.map((item) => ({
        item,
        group,
        path: `${group.path}/${encodeURIComponent(String(item.id))}`,
      })),
    )
    .sort(
      (a, b) =>
        staffWorkRank(a.group.resource, a.item) -
          staffWorkRank(b.group.resource, b.item) ||
        (Date.parse(text(a.item, "scheduledAt", "createdAt")) || 0) -
          (Date.parse(text(b.item, "scheduledAt", "createdAt")) || 0),
    );
  const waiting = groups.reduce((sum, group) => sum + group.waiting, 0);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
    >
      <PageHeader
        eyebrow="Nhân viên kho"
        title="Bàn làm việc"
        description={`Chào ${user?.fullName ?? "bạn"}. Tiếp nhận yêu cầu và cập nhật kết quả theo phần việc của bạn.`}
      />
      <Button
        title={activity.checking ? "Đang cập nhật…" : "Làm mới công việc"}
        onPress={activity.refresh}
        disabled={activity.checking}
      />
      <ActivitySummary />
      <Panel title="Ưu tiên xử lý">
        <Text style={styles.copy}>
          Việc ưu tiên cao và lịch đã đến giờ được đưa lên trước. Chỉ hiển thị
          hồ sơ bạn có thể xử lý.
        </Text>
        {queue.slice(0, 6).map(({ item, path, group }) => (
          <Navigation
            key={path}
            title={codeOf(item)}
            description={`${group.title} · ${label(item.status)}${item.scheduledAt ? ` · ${formatDate(String(item.scheduledAt), true)}` : ""}`}
            path={path}
          />
        ))}
        {!queue.length && (
          <Text style={styles.copy}>
            {activity.loading
              ? "Đang cập nhật công việc…"
              : activity.failed.length
                ? "Chưa tải đủ dữ liệu. Mở từng nhóm bên dưới hoặc thử Làm mới."
                : "Bạn chưa có việc cần xử lý trong các nhóm hiện tại."}
          </Text>
        )}
        {waiting > 0 && (
          <Text style={styles.copy}>
            {waiting} hồ sơ đang chờ quản lý phân công, chưa tính vào việc bạn
            cần xử lý.
          </Text>
        )}
      </Panel>
      <WorkHub
        title="Các nhóm công việc"
        description="Số hồ sơ cần bạn xử lý. Mở danh sách để xem cả lịch sử."
        actions={groups.map((group) => ({
          title: group.title,
          path: group.path,
          description:
            group.description +
            (group.waiting ? ` Có ${group.waiting} hồ sơ chờ phân công.` : ""),
          count: group.unavailable ? "—" : group.items.length,
        }))}
      />
      <WorkflowHint text="Quản lý phân công hỗ trợ, bảo trì và giao nhận hàng. Các khoản thu và tiền cọc do quản lý đối chiếu." />
      <FunctionMenu
        groups={[
          {
            title: "Tra cứu & lịch sử",
            items: [
              {
                title: "Công việc vận hành",
                path: "/staff/tasks",
                description:
                  "Xem lịch sử bảo trì, hỗ trợ, trả kho và chuyển kho.",
              },
              {
                title: "Kho đang sử dụng",
                path: "/staff/rentals",
                description: "Tra cứu khách, hợp đồng và vị trí kho.",
              },
            ],
          },
        ]}
      />
      <Navigation title="Tài khoản và đăng xuất" path="/staff/account" />
    </ScrollView>
  );
}
