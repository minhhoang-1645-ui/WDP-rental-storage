import { useResource } from '@/operations/use-resource';
import { publicCatalog } from '@/utils/public-catalog';
import type { Row } from '@/operations/model';

export function usePublicCatalog(facilityId?: string, enabled = true, retainWhileRefreshing = false) {
  const path = facilityId ? '/booking/catalog?facilityId=' + encodeURIComponent(facilityId) : '/booking/catalog';
  const resource = useResource<Row>(enabled ? path : null, false, retainWhileRefreshing);
  return { ...resource, data: resource.data ? publicCatalog(resource.data) : undefined };
}
