import { managerSections } from '@/utils/manager-sections';
import { Navigation } from './ui';

export function ManagerParentLink({ resource }: { resource: string }) {
  const childPath = `/manager/${resource}`;
  const parent = Object.entries(managerSections).find(([, section]) =>
    section.items.some(item => item.mobile.split('?')[0] === childPath));
  if (!parent) return null;
  const [key, section] = parent;
  return <Navigation compact title={`‹ ${section.title}`} path={`/manager/${key}`} />;
}
