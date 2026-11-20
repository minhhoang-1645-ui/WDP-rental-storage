import { StyleSheet, View, type DimensionValue } from 'react-native';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';

export type SkeletonLayout = 'compact' | 'card' | 'list' | 'detail' | 'map' | 'metrics';

function Bone({ width, height = 12 }: { width: DimensionValue; height?: number }) {
  return <View style={[styles.bone, { width, height }]} />;
}

function SkeletonCard({ detail = false }: { detail?: boolean }) {
  return <View style={styles.card}>
    <Bone width="55%" height={18} />
    <Bone width="80%" />
    {detail && <><Bone width="66%" /><Bone width="45%" /></>}
  </View>;
}

export function Skeleton({ layout }: { layout: SkeletonLayout }) {
  if (layout === 'compact') return <Bone width="55%" />;

  if (layout === 'map') return <View style={styles.card}>
    <Bone width="55%" height={16} />
    <View style={styles.grid}>
      {[0, 1, 2, 3].map(tile => <View key={tile} style={styles.cell}><Bone width="100%" height={64} /></View>)}
    </View>
  </View>;

  if (layout === 'metrics') return <View style={styles.grid}>
    {[0, 1, 2, 3].map(tile => <View key={tile} style={[styles.card, styles.cell]}>
      <Bone width="70%" />
      <Bone width="46%" height={24} />
    </View>)}
  </View>;

  const cards = layout === 'list' ? [0, 1, 2] : layout === 'detail' ? [0, 1] : [0];
  return <View style={styles.stack}>
    {cards.map(card => <SkeletonCard key={card} detail={layout === 'detail'} />)}
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
    borderCurve: 'continuous',
    backgroundColor: WdpColors.surface,
  },
  stack: { gap: WdpSpacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.xs },
  cell: { flexBasis: '45%', flexGrow: 1 },
});
