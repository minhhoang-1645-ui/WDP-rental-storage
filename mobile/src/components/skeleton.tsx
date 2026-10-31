import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';

function Bone({ width, height = 16, style }: { width: number | `${number}%`; height?: number; style?: object }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return <Animated.View style={[styles.bone, { width, height, opacity }, style]} />;
}

/** Card-shaped skeleton placeholder — drop-in replacement for LoadingState inside lists and panels. */
export function SkeletonCard() {
  return <View style={styles.card}>
    <Bone width="40%" height={12} />
    <Bone width="75%" height={18} />
    <Bone width="90%" height={14} />
    <Bone width="60%" height={14} />
  </View>;
}

/** Compact inline skeleton for a single metric value. */
export function SkeletonMetric() {
  return <View style={styles.metric}>
    <Bone width="55%" height={11} />
    <Bone width="35%" height={24} />
  </View>;
}

/** Full-screen skeleton placeholder with multiple card shapes. */
export function SkeletonPage({ cards = 3 }: { cards?: number }) {
  return <View style={styles.page}>
    <Bone width="30%" height={12} />
    <Bone width="65%" height={22} />
    <Bone width="85%" height={14} />
    {Array.from({ length: cards }, (_, i) => <SkeletonCard key={i} />)}
  </View>;
}

const styles = StyleSheet.create({
  bone: {
    backgroundColor: WdpColors.border,
    borderRadius: WdpRadius.sm,
  },
  card: {
    gap: WdpSpacing.sm,
    padding: WdpSpacing.md,
    borderWidth: 1,
    borderColor: WdpColors.border,
    borderRadius: WdpRadius.lg,
    backgroundColor: WdpColors.surface,
  },
  metric: {
    gap: WdpSpacing.xs,
    padding: WdpSpacing.md,
    borderWidth: 1,
    borderColor: WdpColors.border,
    borderRadius: WdpRadius.md,
    backgroundColor: WdpColors.surface,
    flex: 1,
  },
  page: {
    gap: WdpSpacing.md,
    padding: WdpSpacing.md,
  },
});
