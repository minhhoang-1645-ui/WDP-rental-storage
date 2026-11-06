import { ScrollView, Text } from "react-native";
import { useAuth } from "@/auth/use-auth";
import { PageHeader } from "@/components/page-header";
import {
  FunctionMenu,
  WorkHub,
  WorkflowHint,
} from "@/components/workspace-hub";
import { Button, Navigation, Panel, styles } from "@/operations/ui";
import { ActivityItem, ActivitySummary } from "@/activity/ActivityCenter";
import { useActivity } from "@/activity/context";
import { activitySources, staffPriorityActivities } from "@/utils/activity";
import {
  awaitingAssignment,
  staffWorkGroups,
} from "@/utils/work-queue";

export default function StaffHomeScreen() {
  const { user } = useAuth();
  const activity = useActivity();
  const sources = activitySources("STAFF");
  const actionableIds = new Set(activity.entries.filter(item => item.action).map(item => item.id));
  const groups = staffWorkGroups.map((group) => {
    const items = activity.data[group.resource] ?? [];
    return {
      ...group,
      path: `/staff/${group.resource}`,
      items: items.filter(row => actionableIds.has(`${group.resource}:${String(row.id)}`)),
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
  const queue = staffPriorityActivities(activity.entries);
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
    <Navigation title="Kho tôi phụ trách" path="/staff/assigned-units" />
      <Panel title="Ưu tiên xử lý">
        <Text style={styles.copy}>
          Sắp xếp theo mức ưu tiên và lần cập nhật gần nhất, đồng bộ với thông báo.
          Chỉ hiển thị hồ sơ bạn có thể xử lý.
        </Text>
        {queue.slice(0, 6).map(item => <ActivityItem key={item.id} item={item} />)}
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
