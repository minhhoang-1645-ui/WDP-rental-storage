import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Field, Navigation, Panel, styles } from '@/operations/ui';
import { WdpColors, WdpRadius } from '@/constants/wdp-theme';

export interface WorkspaceAction { title: string; path: string; description: string; count?: number | string }
export function WorkHub({ title, description, actions }: { title: string; description: string; actions: WorkspaceAction[] }) {
  return <View style={{ gap: 10 }}><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.copy}>{description}</Text>{actions.map(action => <Pressable key={action.path} accessibilityRole="button" accessibilityLabel={`${action.title}${action.count !== undefined ? `, ${action.count} hồ sơ` : ''}`} onPress={() => router.push(action.path as Href)} style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && styles.pressed]}><View style={{ flex: 1, gap: 6 }}><Text style={styles.navigationTitle}>{action.title}</Text><Text style={styles.copy}>{action.description}</Text></View>{action.count !== undefined && <Text style={{ minWidth: 28, textAlign: 'center', color: typeof action.count === 'number' && action.count > 0 ? WdpColors.surface : WdpColors.navy, backgroundColor: typeof action.count === 'number' && action.count > 0 ? WdpColors.teal : WdpColors.soft, padding: 6, borderRadius: WdpRadius.sm, fontWeight: '700', fontSize: 13, overflow: 'hidden' }}>{action.count}</Text>}<View accessibilityElementsHidden style={styles.navigationArrow}><ChevronRight size={16} color={WdpColors.teal} strokeWidth={2.5} /></View></Pressable>)}</View>;
}
export function FunctionMenu({ groups }: { groups: { title: string; items: WorkspaceAction[] }[] }) {
  const [search, setSearch] = useState('');
  const normalize = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
  const matching = groups.map(group => ({ ...group, items: group.items.filter(item => normalize(`${item.title} ${item.description}`).includes(normalize(search.trim()))) })).filter(group => group.items.length);
  return <View style={{ gap: 12 }}><Text accessibilityRole="header" style={styles.title}>Tất cả chức năng</Text><Text style={styles.copy}>Mở một nhóm hoặc tìm tên chức năng. Mọi chức năng vẫn có trong các nhóm bên dưới.</Text><Field title="Tìm chức năng" value={search} onChange={setSearch} maxLength={80} />{matching.map((group, index) => <FunctionGroup key={`${group.title}:${Boolean(search)}`} title={group.title} items={group.items} defaultOpen={Boolean(search) || index === 0} />)}{!matching.length && <Text style={styles.copy}>Chưa có mục phù hợp. Thử từ khóa khác.</Text>}</View>;
}
function FunctionGroup({ title, items, defaultOpen }: { title: string; items: WorkspaceAction[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <View style={{ gap: 9 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}, ${items.length} chức năng`} onPress={() => setOpen(value => !value)} style={[styles.card, { minHeight: 54, flexDirection: 'row', alignItems: 'center' }]}><Text style={[styles.label, { flex: 1, fontSize: 14 }]}>{title} · {items.length}</Text>{open ? <ChevronDown size={18} color={WdpColors.muted} /> : <ChevronRight size={18} color={WdpColors.muted} />}</Pressable>{open && items.map(item => <Navigation key={item.path} title={item.title} description={item.description} path={item.path} />)}</View>;
}
export function WorkflowHint({ text }: { text: string }) {
  if (!text) return null;
  return <Panel title="Bước tiếp theo"><Text style={styles.copy}>{text}</Text></Panel>;
}
