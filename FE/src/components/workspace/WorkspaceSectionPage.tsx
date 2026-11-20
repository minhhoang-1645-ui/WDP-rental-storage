import { useParams } from "react-router-dom";
import { useActivity } from "../../activity/context";
import { actionCountForPath } from "../../utils/notification-tools";
import { WorkspaceNotFound } from "../layout/WorkspaceNotFound";
import { PageHeader } from "../manager/PortalUi";
import type { InternalNavItem } from "../layout/InternalPortalLayout";
import { WorkHub } from "./WorkHub";

export type WorkspaceSection = {
  key: string;
  title: string;
  items: InternalNavItem[];
};

export function WorkspaceSectionPage({ sections }: { sections: WorkspaceSection[] }) {
  const { section } = useParams();
  const activity = useActivity();
  const current = sections.find(item => item.key === section);
  if (!current) return <WorkspaceNotFound />;

  return <section className="customer-page">
    <PageHeader title={current.title} />
    <WorkHub title="Chọn chức năng" description="" actions={current.items.map(item => {
      const count = actionCountForPath(activity.entries, item.to);
      return { title: item.label, description: "", to: item.to, icon: item.icon, count: count || undefined };
    })} />
  </section>;
}
