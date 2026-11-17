import { BadRequestException } from '@nestjs/common';

/** Private database storage, returned only by ownership/assignment guarded stock APIs. */
export function itemPhotos(value: unknown): string[] {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>3)throw new BadRequestException('Mỗi mặt hàng có tối đa 3 ảnh.');
  return value.map(raw=>{
    if(typeof raw!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new BadRequestException('Ảnh phải là JPEG đã mã hóa hợp lệ.');
    const encoded=raw.slice(raw.indexOf(',')+1),bytes=Buffer.from(encoded,'base64');
    if(bytes.length>400*1024||bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9||bytes.toString('base64')!==encoded)throw new BadRequestException('Ảnh JPEG không hợp lệ hoặc vượt 400 KB.');
    return raw;
  });
}
