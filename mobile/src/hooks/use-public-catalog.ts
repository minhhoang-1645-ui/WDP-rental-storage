import { useResource } from '@/operations/use-resource';
import { publicCatalog } from '@/utils/public-catalog';
import { rows, type Row } from '@/operations/model';

export function usePublicCatalog(facilityId?: string, enabled = true, retainWhileRefreshing = false) {
  const path = facilityId ? '/booking/catalog?facilityId=' + encodeURIComponent(facilityId) : '/booking/catalog';
  const resource = useResource<Row>(enabled ? path : null, false, retainWhileRefreshing);
  const raw = resource.data;
  // Older deployments ignore the query parameter but still return each product's facility ID.
  const data = raw && facilityId && raw.facilityId === undefined && raw.facilities === undefined
    ? { ...raw, facilityId, products: rows(raw.products).filter(product => product.facilityId === facilityId),
        addons: rows(raw.addons).filter(addon => addon.facilityId === facilityId) }
    : raw;
  return { ...resource, data: data ? publicCatalog(data) : undefined };
}
