import { useApiResource } from '../../services/useApiResource';

type Facility = { id: string; name: string };

export function useStaffFacility(userId?: string) {
  const resource = useApiResource<Facility[]>(userId ? '/staff/maintenance/facilities' : null, userId, true);
  const count = resource.data?.length;
  const facility = !resource.error && count === 1 ? resource.data?.[0] : undefined;
  return { ...resource, count, facility };
}

export function staffFacilityMessage(scope: ReturnType<typeof useStaffFacility>) {
  if (scope.loading || scope.error || scope.facility || scope.count === undefined) return '';
  return scope.count === 0 ? 'Bạn chưa được cấp quyền tại cơ sở nào' : 'Tài khoản chưa có một cơ sở làm việc cố định';
}
