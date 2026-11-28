import { GoneException } from '@nestjs/common';

export function stockWorkflowRetired(): never {
  throw new GoneException({
    code: 'PERSONAL_INVENTORY_RETIRED',
    message: 'NestBox đã ngừng quản lý hàng cá nhân và phiếu nhập/xuất. Vui lòng quản lý kho đang thuê hoặc gửi yêu cầu hỗ trợ.',
  });
}
