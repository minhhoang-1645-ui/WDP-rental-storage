export const EARLY_RETURN_SUBJECT = 'Đề nghị trả kho trước hạn';

export function earlyReturnScope(id: string, endDate: string) {
  return `early-return:${id}:${endDate}`;
}
