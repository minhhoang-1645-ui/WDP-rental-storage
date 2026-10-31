import { ScrollView } from 'react-native';
import { FunctionMenu } from '@/components/workspace-hub';
import { styles } from '@/operations/ui';
import { groups } from './index';

export default function CustomerServicesScreen() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}><FunctionMenu groups={groups} /></ScrollView>;
}
