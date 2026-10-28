import { Link, type LinkProps } from "react-router-dom";
import { useContext } from 'react';
import { useAuth } from "../../auth/auth-context";
import { operationPath } from "../../auth/portal-routing";
import { isStaffWorkflow } from '../../utils/operation-access';
import { isManagerReviewWorkflow } from '../../utils/manager-review-access';
import { OperationsWorkspace } from './operations-workspace';

/** Keep related-record navigation in the signed-in user's operational workspace. */
export function OperationsLink({ to, ...props }: LinkProps) {
  const { user } = useAuth();
  const workspace = useContext(OperationsWorkspace);
  const path = typeof to === 'string' ? to : to.pathname ?? '';
  const match = /^\/manager\/(?:operations\/)?([^/?]+)/.exec(path);
  if (match && user?.role === 'STAFF' && !isStaffWorkflow(match[1]) && match[1] !== 'rentals') return null;
  if (match && user?.role === 'MANAGER' && isStaffWorkflow(match[1]) && !isManagerReviewWorkflow(match[1])) return props.className?.includes('button') ? null : <span>{props.children}</span>;
  const resolve = (path: string) => {
    const result = workspace ? path.replace(/^\/manager(?=\/|\?|#|$)/, workspace) : operationPath(user?.role, path);
    return workspace === '/staff' ? result.replace(/^\/staff\/operations\//, '/staff/') : result;
  };
  const destination =
    typeof to === "string"
      ? resolve(to)
      : {
          ...to,
          pathname: to.pathname
            ? resolve(to.pathname)
            : to.pathname,
        };
  return <Link {...props} to={destination} />;
}
