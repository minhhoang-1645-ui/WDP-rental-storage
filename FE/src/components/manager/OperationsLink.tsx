import { Link, type LinkProps } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { operationPath } from "../../auth/portal-routing";

/** Keep related-record navigation in the signed-in user's operational workspace. */
export function OperationsLink({ to, ...props }: LinkProps) {
  const { user } = useAuth();
  const destination =
    typeof to === "string"
      ? operationPath(user?.role, to)
      : {
          ...to,
          pathname: to.pathname
            ? operationPath(user?.role, to.pathname)
            : to.pathname,
        };
  return <Link {...props} to={destination} />;
}
