import { useLocalSearchParams } from 'expo-router';
import { ResourceList } from '@/operations/list';
import { PortalList } from '@/portals/screens';
export default function Screen() {
  const { resource } = useLocalSearchParams<{ resource: string }>();
  return resource === 'rentals' ? <PortalList role="STAFF" /> : <ResourceList />;
}
