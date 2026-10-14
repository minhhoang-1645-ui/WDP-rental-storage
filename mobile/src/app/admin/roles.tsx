import { ScrollView, Text } from 'react-native';

import { InfoRow, MenuLink, Panel, portalStyles } from '@/components/portal-ui';

const roles = [
  { title: 'Quản trị viên (Admin)', permissions: 'Tạo Staff/Manager, bật hoặc vô hiệu hóa tài khoản. Truy cập nghiệp vụ quản lý cơ sở.' },
  { title: 'Quản lý (Manager)', permissions: 'Quản lý đặt kho, khách hàng, hợp đồng, thanh toán, lịch bàn giao và các yêu cầu vận hành.' },
  { title: 'Nhân viên (Staff)', permissions: 'Bàn giao kho, kiểm tra trả kho, xử lý bảo trì và hỗ trợ theo phân công.' },
  { title: 'Khách hàng (Customer)', permissions: 'Xem và gửi yêu cầu liên quan đến kho thuê, hợp đồng và hóa đơn của chính mình.' },
];

export default function RolesScreen() {
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={portalStyles.content}>
    <Text style={portalStyles.muted}>Quyền hiện tại do hệ thống áp dụng; màn hình này chỉ dùng để tra cứu.</Text>
    {roles.map(role => <Panel key={role.title} title={role.title}><InfoRow label="Phạm vi truy cập" value={role.permissions} /></Panel>)}
    <Text style={portalStyles.muted}>Việc xử lý còn phụ thuộc trạng thái hồ sơ và nhân viên được giao. Hiện chưa hỗ trợ đổi vai trò của tài khoản đã tạo hoặc tạo thêm Admin.</Text>
    <MenuLink href="/admin/users" title="Xem tài khoản" description="Kiểm tra vai trò và trạng thái từng tài khoản." />
  </ScrollView>;
}

