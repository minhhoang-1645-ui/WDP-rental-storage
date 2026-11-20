/** Calendar day at the single Vietnamese facility; independent of the browser's timezone. */
export const vietnamCalendarDate = (time = Date.now()) => new Date(time + 7 * 3600000).toISOString().slice(0, 10);
