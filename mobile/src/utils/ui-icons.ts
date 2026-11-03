import {
  ArrowLeft, ArrowRight, ArrowLeftRight, Bell, Boxes, CalendarDays, Check,
  ClipboardList, CreditCard, FileText, Grid2X2, History, Home, Layers,
  LifeBuoy, LogOut, Package, PackageCheck, Plus, RefreshCw, Save,
  Search, Settings, ShieldCheck, UserRound, Users, Wallet, Warehouse, Wrench, X,
  ChartNoAxesCombined,
} from 'lucide-react-native';

export function featureIcon(value: string) {
  const key = value.toLowerCase();
  if (/payment-history|booking-history|lịch sử/.test(key)) return History;
  if (/reconciliation|đối soát/.test(key)) return ShieldCheck;
  if (/payment-submissions|chuyển khoản/.test(key)) return Wallet;
  if (/invoice|payment|finance|thanh toán|hóa đơn|công nợ/.test(key)) return CreditCard;
  if (/deposit|tiền cọc|quyết toán/.test(key)) return Wallet;
  if (/appointment|lịch|bàn giao|nhận kho/.test(key)) return CalendarDays;
  if (/contract|hợp đồng|phụ lục/.test(key)) return FileText;
  if (/renewal|gia hạn/.test(key)) return RefreshCw;
  if (/transfer|chuyển kho|stock-movement|nhập|xuất/.test(key)) return ArrowLeftRight;
  if (/return|trả kho/.test(key)) return PackageCheck;
  if (/support|hỗ trợ|tư vấn/.test(key)) return LifeBuoy;
  if (/maintenance|bảo trì/.test(key)) return Wrench;
  if (/assignment|phân công|nhân viên|users|người dùng/.test(key)) return Users;
  if (/role|quyền|truy cập/.test(key)) return ShieldCheck;
  if (/account|tài khoản/.test(key)) return UserRound;
  if (/setting|cấu hình|thông số/.test(key)) return Settings;
  if (/report|dashboard|báo cáo|thống kê/.test(key)) return ChartNoAxesCombined;
  if (/size-finder|kích thước|catalog|danh mục/.test(key)) return Layers;
  if (/discover|tìm kho/.test(key)) return Search;
  if (/stored-item|hàng đang lưu/.test(key)) return Boxes;
  if (/reservation|đặt kho|approvals|duyệt|task|công việc/.test(key)) return ClipboardList;
  if (/unit|rental|facility|kho/.test(key)) return Warehouse;
  if (/notification|activity|thông báo/.test(key)) return Bell;
  if (/tổng quan|trang chủ/.test(key)) return Home;
  if (/dịch vụ|chức năng/.test(key)) return Grid2X2;
  return Package;
}

export function actionIcon(title: string) {
  if (/^✓/.test(title)) return Check;
  if (/đăng xuất/i.test(title)) return LogOut;
  if (/^(hủy|đóng|ẩn)/i.test(title)) return X;
  if (/^(quay lại|trở lại)/i.test(title)) return ArrowLeft;
  if (/^(làm mới|thử lại|kiểm tra mới)/i.test(title)) return RefreshCw;
  if (/^(thêm|tạo)/i.test(title)) return Plus;
  if (/^(lưu|cập nhật)/i.test(title)) return Save;
  if (/^(xác nhận|hoàn tất|hoàn thành|đồng ý)/i.test(title)) return Check;
  if (/thanh toán|pdf|hợp đồng|sơ đồ|tìm kho|phân công/i.test(title)) return featureIcon(title);
  if (/^(tiếp tục|xem|mở|gửi)/i.test(title)) return ArrowRight;
  return undefined;
}
