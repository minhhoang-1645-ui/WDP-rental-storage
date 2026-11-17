import { createContext, useContext } from 'react';
import type { ActivityData, ActivityEntry } from '../utils/activity';
export interface ActivityState {
  data: ActivityData; entries: ActivityEntry[]; read: string[]; loading: boolean; checking: boolean; checkedAt: number; failed: string[];
  refresh: () => void; markRead: (tokens: string[]) => void;
}
export const ActivityContext = createContext<ActivityState>({ data: {}, entries: [], read: [], loading: false, checking: false, checkedAt: 0, failed: [], refresh: () => {}, markRead: () => {} });
export const useActivity = () => useContext(ActivityContext);
