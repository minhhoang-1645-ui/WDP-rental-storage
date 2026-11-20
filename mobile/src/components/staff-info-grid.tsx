import { Text, View, useWindowDimensions } from 'react-native';
import { hasStaffValue } from '@/utils/staff-values';
import { staffStyles as s } from './staff-ui';

export function StaffInfoGrid({ values }: { values: [string, unknown][] }) {
  const { width, fontScale } = useWindowDimensions();
  const columns = width >= 360 && fontScale < 1.4 ? 2 : 1;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>{values.filter(([, value]) => hasStaffValue(value)).map(([title, value], index) => <View key={`${title}:${index}`} style={{ width: columns === 2 ? '50%' : '100%', gap: 4, paddingRight: columns === 2 && index % 2 === 0 ? 12 : 0 }}><Text style={s.secondary}>{title}</Text><Text selectable style={s.body}>{typeof value === 'boolean' ? value ? 'Có' : 'Không' : String(value)}</Text></View>)}</View>;
}
