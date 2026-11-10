import { useRef, useState } from "react";
import { router, type Href } from "expo-router";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronRight, ClipboardList, LayoutGrid, RefreshCw, Inbox, ArrowLeftRight, Warehouse } from "lucide-react-native";
import { useAuth } from "@/auth/use-auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/screen-state";
import { Button, Disclosure, Navigation, styles } from "@/operations/ui";
import { codeOf, text, label } from "@/operations/model";
import { formatDate } from "@/utils/format";
import { useActivity } from "@/activity/context";
import { activitySources } from "@/utils/activity";
import { WdpColors, WdpRadius, WdpSpacing, WdpType } from "@/constants/wdp-theme";
import { featureIcon } from "@/utils/ui-icons";
import {
  awaitingAssignment,
  staffNeedsAction,
  staffWorkGroups,
  staffWorkRank,
} from "@/utils/work-queue";

const sections = [
  { title: "Tiếp nhận khách", resources: ["reservations", "inquiries", "support-requests"] },
  { title: "Giao nhận & thay đổi", resources: ["appointments", "stock-movements", "renewals", "transfers", "returns"] },
  { title: "Kho & lịch sử", resources: ["maintenance"] },
];
const tabs = [
  { key: "queue", label: "Cần xử lý", Icon: ClipboardList },
  { key: "directory", label: "Danh mục", Icon: LayoutGrid },
] as const;
const pageSize = 4;
const filters = [
  { key: "all", title: "Tất cả", Icon: ClipboardList },
  { key: "reception", title: "Tiếp nhận", Icon: Inbox, resources: sections[0].resources },
  { key: "handover", title: "Giao nhận", Icon: ArrowLeftRight, resources: sections[1].resources },
  { key: "facility", title: "Kho", Icon: Warehouse, resources: sections[2].resources },
] as const;

export default function StaffHomeScreen() {
  const { user } = useAuth();
  const activity = useActivity();
  const [tab, setTab] = useState<"queue" | "directory">("queue");
  const [filter, setFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const listRef = useRef<FlatList>(null);
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
        sources.some((source) =>
          source.kind === group.resource && activity.failed.includes(source.title),
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
  const incomplete = groups.some((group) => group.unavailable);
  const activeFilter = filters.find(item => item.key === filter) ?? filters[0];
  const filteredQueue = queue.filter(({ group }) => !("resources" in activeFilter) || activeFilter.resources.includes(group.resource));
  const visibleQueue = filteredQueue.slice(0, visibleCount);

  return (
    <View style={local.screen}>
      <View style={local.header}>
        <View style={local.tabs} accessibilityRole="tablist">
          {tabs.map(({ key, label: title, Icon }) => {
            const selected = tab === key;
            const color = selected ? WdpColors.navy : WdpColors.muted;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(key)}
                style={[local.tab, selected && local.activeTab]}
              >
                <Icon size={18} color={color} />
                <Text style={[local.tabText, { color }]}>{title}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Làm mới công việc"
          accessibilityState={{ disabled: activity.checking, busy: activity.checking }}
          disabled={activity.checking}
          onPress={activity.refresh}
          style={[local.refresh, activity.checking && local.busy]}
        >
          <RefreshCw size={19} color={WdpColors.navy} />
        </Pressable>
      </View>

      {tab === "queue" ? (
        <View style={local.queue}>
          <View style={local.frame}>
            <View style={local.summary}>
              <Text accessibilityRole="header" style={local.summaryTitle}>
                {queue.length > 0 ? `${queue.length} việc cần xử lý` : "Việc cần xử lý"}
              </Text>
              {waiting > 0 && <Text style={styles.copy}>{waiting} hồ sơ chờ phân công</Text>}
              {!activity.loading && incomplete && queue.length > 0 && (
                <Text style={styles.copy}>Một số nhóm chưa tải được. Bấm làm mới để thử lại.</Text>
              )}
            </View>
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.filters}>
                {filters.map(({ key, title, Icon }) => {
                  const selected = filter === key;
                  return (
                    <Pressable key={key} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected }} onPress={() => {
                      setFilter(key);
                      setVisibleCount(pageSize);
                      listRef.current?.scrollToOffset({ offset: 0, animated: false });
                    }} style={[local.filter, selected && local.filterSelected]}>
                      <Icon size={16} color={selected ? WdpColors.surface : WdpColors.navy} />
                      <Text style={[local.filterText, selected && local.filterTextSelected]}>{title}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <FlatList
              ref={listRef}
              data={visibleQueue}
              keyExtractor={({ path }) => path}
              style={local.list}
              contentContainerStyle={local.listContent}
              ListEmptyComponent={
              <View style={local.empty}>
                {activity.loading ? (
                  <LoadingState layout="list" />
                ) : incomplete ? (
                  <ErrorState message="Chưa tải đủ công việc. Bạn vẫn có thể mở từng nhóm trong Danh mục." onRetry={activity.refresh} />
                ) : (
                  <EmptyState title="Chưa có việc trong nhóm này" message="Chọn nhóm khác để xem công việc." />
                )}
              </View>
              }
              renderItem={({ item: { item, path, group } }) => {
            const Icon = featureIcon(group.resource);
            const code = codeOf(item);
            const rank = staffWorkRank(group.resource, item);
            const status = rank === 0 ? "Ưu tiên cao" : rank === 1 ? "Đến giờ" : label(item.status);
            const metadata = item.scheduledAt ? `${code} · ${formatDate(String(item.scheduledAt), true)}` : code;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${group.title}, ${metadata}, ${status}`}
                onPress={() => router.push(path as Href)}
                style={({ pressed }) => [local.row, pressed && styles.pressed]}
              >
                <View style={local.rowIcon}><Icon size={18} color={WdpColors.navy} /></View>
                <View style={local.rowCopy}>
                  <Text style={local.rowTitle}>{group.title}</Text>
                  <Text style={local.rowMeta} numberOfLines={2}>{metadata}</Text>
                </View>
                <Text style={[local.status, rank < 2 && local.urgent]}>{status}</Text>
                <ChevronRight size={16} color={WdpColors.muted} />
              </Pressable>
            );
              }}
            />
            {filteredQueue.length > 0 && (
              <View style={local.more}>
                <View style={local.moreHeading}>
                  <Text accessibilityLiveRegion="polite" style={local.counter}>Đang hiện {visibleQueue.length} / {filteredQueue.length} việc</Text>
                  {visibleCount > pageSize && <Pressable accessibilityRole="button" onPress={() => {
                    setVisibleCount(pageSize);
                    listRef.current?.scrollToOffset({ offset: 0, animated: false });
                  }} style={local.collapse}><Text style={local.filterText}>Thu gọn</Text></Pressable>}
                </View>
                {visibleQueue.length < filteredQueue.length && <Button title={`Xem thêm ${Math.min(pageSize, filteredQueue.length - visibleQueue.length)} việc`} variant="secondary" onPress={() => setVisibleCount(count => count + pageSize)} />}
              </View>
            )}
          </View>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
          {sections.map(({ title, resources }) => (
            <Disclosure key={title} title={title}>
              {groups.filter((group) => resources.includes(group.resource)).map((group) => (
                <Navigation
                  key={group.path}
                  compact
                  title={group.title}
                  description={!group.unavailable && group.items.length > 0 ? `${group.items.length} việc cần xử lý` : undefined}
                  path={group.path}
                />
              ))}
              {title === "Kho & lịch sử" && (
                <>
                  <Navigation compact title="Kho tôi phụ trách" path="/staff/assigned-units" />
                  <Navigation compact title="Kho đang sử dụng" path="/staff/rentals" />
                  <Navigation compact title="Lịch sử vận hành" path="/staff/tasks" />
                </>
              )}
            </Disclosure>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", gap: WdpSpacing.xs, padding: WdpSpacing.md, paddingBottom: 0 },
  tabs: { flex: 1, flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: WdpColors.border },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: WdpSpacing.xxs, minHeight: 44, padding: WdpSpacing.xxs, borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTab: { borderBottomColor: WdpColors.navy },
  tabText: { ...WdpType.secondary, fontWeight: "700", flexShrink: 1, textAlign: "center" },
  refresh: { minWidth: 44, alignItems: "center", justifyContent: "center" },
  busy: { opacity: 0.5 },
  queue: { flex: 1, padding: WdpSpacing.md, paddingBottom: 100 },
  frame: { flex: 1, backgroundColor: WdpColors.surface, borderWidth: 1, borderColor: WdpColors.border, borderRadius: WdpRadius.md, overflow: "hidden" },
  filters: { gap: WdpSpacing.xs, paddingHorizontal: WdpSpacing.sm, paddingBottom: WdpSpacing.sm },
  filter: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: WdpSpacing.xxs, paddingHorizontal: WdpSpacing.sm, borderRadius: WdpRadius.full, backgroundColor: WdpColors.soft },
  filterSelected: { backgroundColor: WdpColors.navy },
  filterText: { ...WdpType.secondary, fontSize: 14, fontWeight: "600", color: WdpColors.navy },
  filterTextSelected: { color: WdpColors.surface },
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  summary: { gap: WdpSpacing.xxs, padding: WdpSpacing.sm },
  summaryTitle: { ...WdpType.cardTitle, color: WdpColors.navy },
  empty: { padding: WdpSpacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: WdpSpacing.xs, minHeight: 64, padding: WdpSpacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: WdpColors.border },
  rowIcon: { padding: WdpSpacing.xs, borderRadius: WdpRadius.sm, backgroundColor: WdpColors.soft },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { ...WdpType.body, fontSize: 16, fontWeight: "700", color: WdpColors.text },
  rowMeta: { ...WdpType.secondary, fontSize: 14, color: WdpColors.muted },
  status: { ...WdpType.secondary, fontSize: 14, maxWidth: "27%", textAlign: "right", color: WdpColors.muted },
  urgent: { color: WdpColors.danger, fontWeight: "700" },
  more: { gap: WdpSpacing.xs, padding: WdpSpacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: WdpColors.border },
  moreHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" },
  counter: { ...WdpType.secondary, fontSize: 14, color: WdpColors.muted },
  collapse: { minHeight: 44, paddingHorizontal: WdpSpacing.xs, justifyContent: "center" },
});
