import { useLocalSearchParams } from 'expo-router';
import { CustomerDepositDetail } from '@/components/customer-deposits';

export default function DepositDeductionsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CustomerDepositDetail key={id} id={id ?? ''} view="deductions" />;
}
