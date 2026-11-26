import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Maximize, Minus, Plus, RotateCcw, X } from 'lucide-react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { RentalFloorPlan } from '@/utils/rental-floor-plan';

const blue = '#175CD3';
const zoomLevels = [1, 1.35, 1.75, 2.25];

export const floorPlanStatuses = {
  AVAILABLE: { label: 'Còn trống', fill: '#DCFCE7', border: '#B6DFC4' },
  RESERVED: { label: 'Đã giữ', fill: '#FFF0CF', border: '#D5BA83' },
  OCCUPIED: { label: 'Đang sử dụng', fill: '#E9EDF2', border: '#98A2B3' },
  MAINTENANCE: { label: 'Bảo trì', fill: '#FCE4E4', border: '#D9A3AB' },
  UNAVAILABLE: { label: 'Không khả dụng', fill: '#F2F4F7', border: '#98A2B3' },
};
type Selection = {
  ids: string[];
  states: ReadonlyMap<string, { status: keyof typeof floorPlanStatuses; disabled: boolean }>;
  onToggle: (id: string) => void;
};

function MapArt({ plan, ids, width, selection }: { plan: RentalFloorPlan; ids: string[]; width: number; selection?: Selection }) {
  const entrance = plan.height - 35;
  return <Svg width={width} height={width * plan.height / plan.width} viewBox={`0 0 ${plan.width} ${plan.height}`}>
    <Path d={`M146 ${entrance} H8 V10 H328 V${entrance} H190`} fill="#F8FAFC" stroke="#667085" strokeWidth={4} />
    {plan.cells.map(cell => {
      const selected = ids.includes(cell.id);
      const status = floorPlanStatuses[selection?.states.get(cell.id)?.status ?? 'OCCUPIED'];
      const fontSize = Math.min(14, 86 / Math.max(1, cell.code.length));
      return <G key={cell.id} transform={`translate(${cell.x} ${cell.y})`}>
        <Rect x={1} y={1} width={114} height={32} rx={6} fill={selected ? blue : status.fill} stroke={selected ? blue : status.border} />
        <Rect x={cell.side ? 0 : 114} y={12} width={4} height={10} fill="#CBD5E1" stroke="#667085" />
        {selected ? <><Circle cx={15} cy={17} r={8} fill="white" /><Path d="M11 17l3 3 5-6" fill="none" stroke={blue} strokeWidth={2} /></> : null}
        <SvgText x={selected ? 67 : 58} y={22} textAnchor="middle" fontFamily="sans-serif" fontSize={fontSize} fontWeight="700" fill={selected ? 'white' : '#101828'}>{cell.code}</SvgText>
      </G>;
    })}
    <SvgText x={168} y={entrance / 2} textAnchor="middle" fontFamily="sans-serif" fill="#475467" fontSize={12}>Hành lang</SvgText>
    <Path d={`M146 ${entrance} v-20 q22 0 22 20 q0 -20 22 -20 v20 M161 ${entrance + 10} l7 -7 7 7`} fill="none" stroke={blue} strokeWidth={1.5} />
    <SvgText x={168} y={plan.height - 9} textAnchor="middle" fontFamily="sans-serif" fill={blue} fontWeight="700" fontSize={13}>Lối vào</SvgText>
  </Svg>;
}

export function StorageFloorPlan({ plan, unitId, unitCode, selection }: { plan: RentalFloorPlan; unitId?: string; unitCode?: string; selection?: Selection }) {
  const { width, height } = useWindowDimensions();
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [viewport, setViewport] = useState(0);
  const ids = selection?.ids ?? (unitId ? [unitId] : []);
  const pinch = Gesture.Pinch().runOnJS(true).onEnd(event => {
    if (Math.abs(event.scale - 1) < .12) return;
    setZoom(index => Math.max(0, Math.min(zoomLevels.length - 1, index + (event.scale > 1 ? 1 : -1))));
  });
  const close = () => { setFull(false); setZoom(0); };
  const controls = [
    { title: 'Phóng to', icon: Plus, onPress: () => setZoom(zoom + 1), disabled: zoom === zoomLevels.length - 1 },
    { title: 'Thu nhỏ', icon: Minus, onPress: () => setZoom(zoom - 1), disabled: zoom === 0 },
    { title: 'Khôi phục góc nhìn', icon: RotateCcw, onPress: () => setZoom(0), disabled: zoom === 0 },
    { title: full ? 'Đóng toàn màn hình' : 'Xem toàn màn hình', icon: full ? X : Maximize, onPress: full ? close : () => { setZoom(0); setFull(true); } },
  ];
  const map = (expanded: boolean) => {
    const maxHeight = expanded ? Math.max(80, height - 180) : 315;
    const availableWidth = expanded ? width - 32 : viewport;
    const base = selection ? Math.max(0, Math.min(availableWidth, 510))
      : Math.min(Math.max(0, availableWidth), maxHeight * plan.width / plan.height);
    const size = base * zoomLevels[zoom];
    return <View style={styles.viewer}>
      <View style={styles.controls}>{controls.map(({ title, icon: Icon, onPress, disabled }) =>
        <Pressable key={title} accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
          style={[styles.control, disabled && styles.disabled]}><Icon color={blue} size={19} /></Pressable>)}</View>
      {selection && <View style={styles.legend}>{Object.entries(floorPlanStatuses)
        .filter(([key]) => key !== 'UNAVAILABLE' || [...selection.states.values()].some(state => state.status === key))
        .map(([key, status]) => <Text key={key} style={styles.label}><Text style={{ color: status.border }}>■</Text> {status.label}</Text>)}
        <Text style={styles.label}><Text style={{ color: blue }}>■</Text> Đã chọn</Text>
      </View>}
      {base > 0 && <ScrollView key={zoom} nestedScrollEnabled scrollEnabled={size * plan.height / plan.width > maxHeight || zoom > 0} style={{ height: Math.min(maxHeight, base * plan.height / plan.width) }}>
        <ScrollView horizontal nestedScrollEnabled scrollEnabled={zoom > 0} keyboardShouldPersistTaps="handled" contentContainerStyle={zoom === 0 && styles.centerMap}>
          <GestureDetector gesture={pinch}>
            <View accessible={!selection} accessibilityLabel={selection ? undefined : `Sơ đồ minh họa. Kho của bạn: ${unitCode}`}>
              <MapArt plan={plan} ids={ids} width={size} selection={selection} />
              {selection && plan.cells.map(cell => {
                const state = selection.states.get(cell.id);
                const checked = ids.includes(cell.id);
                const disabled = !state || state.disabled;
                const ratio = size / plan.width;
                return <Pressable key={cell.id} accessibilityRole="checkbox"
                  accessibilityLabel={cell.code + ' · ' + (checked ? 'Đã chọn' : floorPlanStatuses[state?.status ?? 'UNAVAILABLE'].label)}
                  accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => selection.onToggle(cell.id)}
                  style={{ position: 'absolute', left: cell.x * ratio, top: cell.y * ratio, width: 118 * ratio, height: 34 * ratio }} />;
              })}
            </View>
          </GestureDetector>
        </ScrollView>
      </ScrollView>}
      {!selection && <View style={styles.legend}><Text style={styles.label}><Text style={{ color: blue }}>■</Text> Kho của bạn</Text>
        <Text style={styles.label}><Text style={{ color: '#98A2B3' }}>■</Text> Ô kho khác</Text></View>}
    </View>;
  };
  return <View onLayout={event => setViewport(event.nativeEvent.layout.width)}>
    {!full && map(false)}
    <Modal visible={full} onRequestClose={close} animationType="fade">
      <GestureHandlerRootView style={styles.root}><SafeAreaView style={styles.modal}>
        <Text accessibilityRole="header" style={styles.title}>Sơ đồ minh họa</Text>
        {full && map(true)}
      </SafeAreaView></GestureHandlerRootView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewer: { gap: 6 },
  centerMap: { flexGrow: 1, justifyContent: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  control: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF5FF' },
  disabled: { opacity: .42 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, borderTopWidth: 1, borderColor: '#E4E7EC', paddingTop: 9 },
  label: { color: '#344054', fontSize: 13 },
  title: { color: '#101828', fontSize: 20, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: 'white', padding: 16, gap: 8 },
});
