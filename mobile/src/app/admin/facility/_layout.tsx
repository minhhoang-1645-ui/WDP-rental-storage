import { Redirect } from 'expo-router';

// Legacy operational URLs no longer belong to the Admin workspace.
export default function Layout() { return <Redirect href="/admin" />; }
