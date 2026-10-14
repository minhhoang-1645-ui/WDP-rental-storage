import { Link, type LinkProps } from "react-router-dom";
import { useContext } from 'react';
import { useAuth } from "../../auth/auth-context";
import { operationPath } from "../../auth/portal-routing";
import { OperationsWorkspace } from './operations-workspace';

/** Keep related-record navigation in the signed-in user's operational workspace. */
export function OperationsLink({ to, ...props }: LinkProps) {
  const { user } = useAuth();
  const workspace = useContext(OperationsWorkspace);
  const resolve = (path: string) => workspace
    ? path.replace(/^\/manager(?=\/|\?|#|$)/, workspace)
    : operationPath(user?.role, path);
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
