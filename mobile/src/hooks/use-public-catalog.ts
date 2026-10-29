import { useResource } from '@/operations/use-resource';
import { publicCatalog } from '@/utils/public-catalog';
import type { Row } from '@/operations/model';

export function usePublicCatalog() {
  const resource = useResource<Row>('/booking/catalog');
  return { ...resource, data: resource.data ? publicCatalog(resource.data) : undefined };
}
