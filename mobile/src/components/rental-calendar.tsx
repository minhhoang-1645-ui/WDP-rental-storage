import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { vietnamCalendarDate } from '@/utils/calendar-date';
import { WdpColors as C } from '@/constants/wdp-theme';

export function RentalCalendar({start, end, daily, compact = false, earliestEnd, endLimit, onChange}: {start: string; end: string; daily: boolean; compact?: boolean; earliestEnd?: string; endLimit?: string; onChange: (start: string, end: string) => void}) {
  const today = vietnamCalendarDate();
  const [month, setMonth] = useState(() => (start || today).slice(0,7));
  const [year, number] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const offset = (new Date(month + '-01T00:00:00Z').getUTCDay() + 6) % 7;
  const move = (delta: number) => {const date = new Date(Date.UTC(year, number - 1 + delta, 1)); setMonth(date.toISOString().slice(0,7));};
  const cell = compact ? 33 : 48;
  const circle = compact ? 31 : 42;
  return <View style={{gap: compact ? 3 : 12}}><View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}><Pressable accessibilityRole="button" accessibilityLabel="Tháng trước" disabled={month <= today.slice(0,7)} onPress={() => move(-1)} style={{minWidth: 48, minHeight: cell, alignItems: 'center', justifyContent: 'center', opacity: month <= today.slice(0,7) ? 0.3 : 1}}><ChevronLeft color={C.text}/></Pressable><Text style={{fontSize: 17, fontWeight: '600', color: C.text}}>Tháng {number}, {year}</Text><Pressable accessibilityRole="button" accessibilityLabel="Tháng sau" onPress={() => move(1)} style={{minWidth: 48, minHeight: cell, alignItems: 'center', justifyContent: 'center'}}><ChevronRight color={C.text}/></Pressable></View><View style={{flexDirection: 'row'}}>{['T2','T3','T4','T5','T6','T7','CN'].map(label => <Text key={label} style={{width: '14.2857%', textAlign: 'center', fontSize: 14, color: C.muted}}>{label}</Text>)}</View><View style={{flexDirection: 'row', flexWrap: 'wrap'}}>{Array.from({length: Math.ceil((offset+count)/7)*7}, (_, index) => {
    const day = index - offset + 1;
    if(day < 1 || day > count) return <View key={index} style={{width: '14.2857%', minHeight: cell}}/>;
    const value = month + '-' + String(day).padStart(2,'0'), selected = value === start || value === end;
    const choosingEnd = daily && Boolean(start) && !end && value > start;
    const outsideEndRange = choosingEnd && ((earliestEnd && value < earliestEnd) || (endLimit && value >= endLimit));
    const disabled = value < today || Boolean(outsideEndRange), between = Boolean(start && end && value > start && value < end);
    return <Pressable key={value} accessibilityRole="button" accessibilityLabel={day + '/' + number + '/' + year} accessibilityState={{selected, disabled}} disabled={disabled} onPress={() => {if(!daily) onChange(value,''); else if(!start || end || value <= start) onChange(value,''); else onChange(start,value);}} style={{width: '14.2857%', minHeight: cell, alignItems: 'center', justifyContent: 'center', backgroundColor: between ? '#EAF1FF' : 'transparent'}}><View style={{minWidth: circle, minHeight: circle, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? compact ? '#0758DC' : '#315D99' : 'transparent', borderWidth: value === today ? 1 : 0, borderColor: C.navy}}><Text style={{fontSize: compact ? 14 : 16, color: selected ? 'white' : disabled ? C.disabled : C.text}}>{day}</Text></View></Pressable>;
  })}</View>{(!compact || daily || !start) && <Text style={{fontSize: 14, color: C.muted}}>{daily ? !start || end ? 'Chọn ngày bắt đầu một kỳ thuê mới.' : 'Chọn ngày kết thúc thuê.' : 'Chọn ngày bắt đầu thuê.'}</Text>}</View>;
}
