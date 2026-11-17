import { Link, type Href } from 'expo-router';
import { UserRound } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityBell } from '@/activity/ActivityCenter';
import { WdpColors } from '@/constants/wdp-theme';

export function AccountHeaderActions({ href }: { href: Href }) {
  return (
    <View style={styles.actions}>
      <Link href={href} asChild>
        <Pressable accessibilityLabel="Mở tài khoản" style={styles.accountButton}>
          <UserRound size={22} color={WdpColors.navy} />
        </Pressable>
      </Link>
      <ActivityBell />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center' },
  accountButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
