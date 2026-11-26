import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Maximize, Minus, Plus, RotateCcw, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { RentalFloorPlan } from '@/utils/rental-floor-plan';

const blue = '#175CD3';
const zoomLevels = [1, 1.35, 1.75, 2.25];

function MapArt({ plan, unitId, width }: { plan: RentalFloorPlan; unitId: string; width: number }) {
  const entrance = plan.height - 35;
  return <Svg width={width} height={width * plan.height / plan.width} viewBox={`0 0 ${plan.width} ${plan.height}`}>
    <Path d={`M146 ${entrance} H8 V10 H328 V${entrance} H190`} fill="#F8FAFC" stroke="#667085" strokeWidth={4} />
    {plan.cells.map(cell => {
      const selected = cell.id === unitId;
      const fontSize = Math.min(14, 86 / Math.max(1, cell.code.length));
      return <G key={cell.id} transform={`translate(${cell.x} ${cell.y})`}>
        <Rect x={1} y={1} width={114} height={32} rx={6} fill={selected ? blue : '#E9EDF3'} stroke={selected ? blue : '#98A2B3'} />
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

export function StorageFloorPlan({ plan, unitId, unitCode }: { plan: RentalFloorPlan; unitId: string; unitCode: string }) {
  const { width, height } = useWindowDimensions();
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [viewport, setViewport] = useState(0);
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
    const base = Math.min(Math.max(0, availableWidth), maxHeight * plan.width / plan.height);
    const size = base * zoomLevels[zoom];
    return <View style={styles.viewer}>
      <View style={styles.controls}>{controls.map(({ title, icon: Icon, onPress, disabled }) =>
        <Pressable key={title} accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
          style={[styles.control, disabled && styles.disabled]}><Icon color={blue} size={19} /></Pressable>)}</View>
      {base > 0 && <ScrollView key={zoom} nestedScrollEnabled style={{ height: base * plan.height / plan.width }}>
        <ScrollView horizontal nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={zoom === 0 && styles.centerMap}>
          <View accessible accessibilityLabel={`Sơ đồ minh họa. Kho của bạn: ${unitCode}`}>
            <MapArt plan={plan} unitId={unitId} width={size} />
          </View>
        </ScrollView>
      </ScrollView>}
      <View style={styles.legend}><Text style={styles.label}><Text style={{ color: blue }}>■</Text> Kho của bạn</Text>
        <Text style={styles.label}><Text style={{ color: '#98A2B3' }}>■</Text> Ô kho khác</Text></View>
    </View>;
  };
  return <View onLayout={event => setViewport(event.nativeEvent.layout.width)}>
    {!full && map(false)}
    <Modal visible={full} onRequestClose={close} animationType="fade">
      <SafeAreaView style={styles.modal}>
        <Text accessibilityRole="header" style={styles.title}>Sơ đồ minh họa</Text>
        {full && map(true)}
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
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
