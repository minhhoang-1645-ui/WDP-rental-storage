import { date } from '../manager/portal-data';

export type RecordEvent = { action: string; actor?: string; at?: string };

export function RecordTimeline({ events }: { events: RecordEvent[] }) {
  return <ol className="record-event-list">
    {events.map((event, index) => <li key={`${event.action}:${event.at}:${index}`}>
      <div><strong>{event.action}</strong>{event.actor && <small>{event.actor}</small>}</div>
      {event.at && <time dateTime={event.at}>{date(event.at, true)}</time>}
    </li>)}
  </ol>;
}
