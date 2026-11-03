import { createElement, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Disclosure, Field, Navigation, styles } from '@/operations/ui';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { featureIcon } from '@/utils/ui-icons';
import { shortLabel } from '@/utils/ui-labels';

export interface WorkspaceAction { title: string; path: string; description: string; count?: number | string }
export function WorkHub({ title, actions }: { title: string; description: string; actions: WorkspaceAction[] }) {
  return <View style={{ gap: WdpSpacing.xs }}><Text accessibilityRole="header" style={styles.title}>{shortLabel(title)}</Text>
    <View style={local.group}>{actions.map(action => {
      const Icon = featureIcon(action.path);
      return <Pressable key={action.path} accessibilityRole="button" accessibilityLabel={`${action.title}${action.count !== undefined ? `, ${action.count} hồ sơ` : ''}`}
        onPress={() => router.push(action.path as Href)} style={({ pressed }) => [local.action, pressed && styles.pressed]}>
        <View style={local.icon}>{createElement(Icon, { size: 21, color: WdpColors.navy })}</View>
        <Text style={[styles.label, { flex: 1, fontSize: 15 }]}>{shortLabel(action.title)}</Text>
        {action.count !== undefined && action.count !== 0 && <Text style={local.count}>{action.count}</Text>}
        <ChevronRight size={18} color={WdpColors.muted} />
      </Pressable>;
    })}</View>
  </View>;
}
export function FunctionMenu({ groups }: { groups: { title: string; items: WorkspaceAction[] }[] }) {
  const [search, setSearch] = useState('');
  const [openGroup, setOpenGroup] = useState(groups[0]?.title ?? '');
  const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
  const matching = groups.map(group => ({ ...group, items: group.items.filter(item => normalize(`${group.title} ${item.title} ${item.description}`).includes(normalize(search.trim()))) })).filter(group => group.items.length);
  return <View style={{ gap: WdpSpacing.sm }}>
    <Field title="Tìm chức năng" value={search} onChange={setSearch} maxLength={80} />
    {matching.map(group => <FunctionGroup key={group.title} title={group.title} items={group.items} open={Boolean(search.trim()) || openGroup === group.title} onToggle={() => { setSearch(''); setOpenGroup(value => value === group.title ? '' : group.title); }} />)}
    {!matching.length && <Text style={styles.copy}>Không tìm thấy. Thử từ khóa khác.</Text>}
  </View>;
}
function FunctionGroup({ title, items, open, onToggle }: { title: string; items: WorkspaceAction[]; open: boolean; onToggle: () => void }) {
  const Icon = featureIcon(title);
  return <View style={local.group}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title} onPress={onToggle}
      style={({ pressed }) => [local.action, { backgroundColor: WdpColors.soft }, pressed && { opacity: 0.75 }]}>
      {createElement(Icon, { size: 22, color: WdpColors.navy })}<Text style={[styles.title, { flex: 1, fontSize: 15 }]}>{title}</Text>
      {open ? <ChevronDown size={18} color={WdpColors.muted} /> : <ChevronRight size={18} color={WdpColors.muted} />}
    </Pressable>
    {open && items.map(item => <View key={item.path} style={local.divider}><Navigation compact title={item.title} path={item.path} /></View>)}
  </View>;
}
export function WorkflowHint({ text }: { text: string }) {
  if (!text) return null;
  return <Disclosure title="Hướng dẫn"><Text style={styles.copy}>{text}</Text></Disclosure>;
}
const local = StyleSheet.create({
  group: { backgroundColor: WdpColors.surface, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 14, overflow: 'hidden' },
  action: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { backgroundColor: WdpColors.soft, borderRadius: 10, padding: 8 },
  count: { color: WdpColors.navy, fontWeight: '700', fontSize: 13, minWidth: 24, textAlign: 'center' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: WdpColors.border },
});
