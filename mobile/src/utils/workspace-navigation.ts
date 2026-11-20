import { router, type Href } from 'expo-router';

/** Start a separate workflow at the role home, keeping its state when it is already mounted. */
export function openWorkspaceEntry(href: string) {
  const home = /^\/(customer|staff|manager|admin)(?=\/|\?|$)/.exec(href)?.[0];
  if (home) router.dismissTo(home as Href);
  if (href !== home) router.push(href as Href);
}
