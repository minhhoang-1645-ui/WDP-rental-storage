import { BadRequestException } from '@nestjs/common';

export function appendEvidenceLink(note: unknown, link: unknown) {
  if (link === undefined || link === null || link === '') return note;
  if (typeof link !== 'string' || link.length > 1000) throw new BadRequestException('Liên kết chứng cứ không hợp lệ.');
  let url: URL;
  try { url = new URL(link.trim()); }
  catch { throw new BadRequestException('Liên kết chứng cứ không hợp lệ.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new BadRequestException('Liên kết chứng cứ phải dùng HTTPS và không chứa thông tin đăng nhập.');
  }
  const description = typeof note === 'string' ? note.trim() : '';
  return [description, `Chứng cứ: ${url.href}`].filter(Boolean).join('\n');
}
