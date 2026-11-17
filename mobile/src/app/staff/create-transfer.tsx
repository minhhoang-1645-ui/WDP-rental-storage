import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { StaffTransferForm } from '@/components/staff-transfer-form';
import { EmptyState } from '@/components/screen-state';
import { staffStyles as s } from '@/components/staff-ui';

export default function CreateTransferScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/staff/transfers'); };
  if (user?.role !== 'STAFF') return <EmptyState title="Không có quyền tạo phiếu" message="Quay lại khu vực Staff." />;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}><ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page, { gap: 16, paddingBottom: 24 + insets.bottom }]}>
    <StaffTransferForm onClose={close} onSaved={close} />
  </ScrollView></KeyboardAvoidingView>;
}
