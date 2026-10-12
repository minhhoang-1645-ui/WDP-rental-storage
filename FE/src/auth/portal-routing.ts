import type { PublicUser } from "../types/booking";

export function portalDestination(role: PublicUser["role"]) {
  if (role === "MANAGER") return "/manager";
  if (role === "STAFF") return "/staff";
  if (role === "ADMIN") return "/admin";
  return "/customer";
}

// API permissions are shared, but each role keeps its own frontend workspace.
export function operationPath(
  role: PublicUser["role"] | undefined,
  path: string,
) {
  return role === "ADMIN"
    ? path.replace(/^\/manager(?=\/|\?|#|$)/, "/admin/facility")
    : path;
}

export function roleReturnPath(role: PublicUser["role"], value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) <= 32)
  )
    return portalDestination(role);
  const path = operationPath(role, value);
  const root = portalDestination(role);
  const destination = new URL(path, "https://portal.invalid");
  const pathname = destination.pathname;
  const ownWorkspace = pathname === root || pathname.startsWith(root + "/");
  const customerBooking =
    role === "CUSTOMER" &&
    (pathname === "/booking" || pathname.startsWith("/booking/"));
  return ownWorkspace || customerBooking
    ? pathname + destination.search + destination.hash
    : root;
}
