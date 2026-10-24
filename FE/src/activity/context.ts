import { createContext, useContext } from 'react';
import type { ActivityEntry } from '../utils/activity';
export interface ActivityState {
  entries: ActivityEntry[]; read: string[]; loading: boolean; checking: boolean; checkedAt: number; failed: string[]; changed: boolean;
  refresh: () => void; markRead: (tokens: string[]) => void; acknowledge: () => void;
}
export const ActivityContext = createContext<ActivityState>({ entries: [], read: [], loading: false, checking: false, checkedAt: 0, failed: [], changed: false, refresh: () => {}, markRead: () => {}, acknowledge: () => {} });
export const useActivity = () => useContext(ActivityContext);
