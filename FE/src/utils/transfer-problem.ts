import { object, rows, type Row } from '../components/manager/portal-data';

export function transferProblem(row: Row) {
  const report = object(row.handoverReport);
  const count = rows(report.problems).length;
  const review = object(report.problemReview);
  return { count, review, pending: row.status === 'APPROVED' && count > 0 && review.problemCount !== count };
}
