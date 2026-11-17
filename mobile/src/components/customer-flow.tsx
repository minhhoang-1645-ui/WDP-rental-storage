import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { WdpColors } from '@/constants/wdp-theme';

export function CustomerReveal({children}: {children: ReactNode}) {
  return <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} style={{gap: 12}}>{children}</Animated.View>;
}
export function CustomerChoices({title, options, value, onChange}: {title: string; options: {value: string; label: string}[]; value: string; onChange: (value: string) => void}) {
  return <View style={{gap: 4}}><Text style={{fontSize: 14, lineHeight: 20, color: WdpColors.muted}}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>{options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{checked: value === option.value}} onPress={() => onChange(option.value)} style={{minHeight: 48, justifyContent: 'center'}}><View style={{paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: value === option.value ? WdpColors.navy : WdpColors.border, backgroundColor: value === option.value ? WdpColors.navy : WdpColors.surface}}><Text style={{fontSize: 14, lineHeight: 20, color: value === option.value ? 'white' : WdpColors.text, fontWeight: '600'}}>{option.label}</Text></View></Pressable>)}</ScrollView></View>;
}
