import { useLocalSearchParams } from 'expo-router';
import { ResourceDetail } from '@/operations/detail';
import { PortalDetail } from '@/portals/screens';
export default function Screen() {
  const { resource } = useLocalSearchParams<{ resource: string }>();
  return resource === 'rentals' ? <PortalDetail role="STAFF" /> : <ResourceDetail />;
}
