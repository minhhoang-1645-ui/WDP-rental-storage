import type { StorageListing, StorageSize } from '../types/storage'

export const imageCredits = {
  hero: { src: 'https://images.pexels.com/photos/5156696/pexels-photo-5156696.jpeg?auto=compress&cs=tinysrgb&w=1600', label: 'Ảnh minh họa · Maor Attias / Pexels', href: 'https://www.pexels.com/photo/5156696/' },
  boxes: { src: 'https://images.pexels.com/photos/30444797/pexels-photo-30444797/free-photo-of-stacked-storage-boxes-in-warehouse-interior.jpeg?auto=compress&cs=tinysrgb&w=1600', label: 'Ảnh minh họa · Brett Jordan / Pexels', href: 'https://www.pexels.com/photo/30444797/' },
  warehouse: { src: 'https://images.pexels.com/photos/29454378/pexels-photo-29454378/free-photo-of-spacious-warehouse-with-cardboard-boxes.jpeg?auto=compress&cs=tinysrgb&w=1600', label: 'Ảnh minh họa · William Buzeichuk / Pexels', href: 'https://www.pexels.com/photo/29454378/' },
  aisle: { src: 'https://images.pexels.com/photos/5775099/pexels-photo-5775099.jpeg?auto=compress&cs=tinysrgb&w=1600', label: 'Ảnh minh họa · Handi Boyz LLC / Pexels', href: 'https://www.pexels.com/photo/5775099/' },
  shelving: { src: 'https://images.pexels.com/photos/4483608/pexels-photo-4483608.jpeg?auto=compress&cs=tinysrgb&w=1600', label: 'Ảnh minh họa · Tiger Lily / Pexels', href: 'https://www.pexels.com/photo/4483608/' },
}

export const storageSizes: StorageSize[] = [
  { id: 'locker', name: 'Tủ lưu trữ', kicker: 'Một góc nhỏ, gọn gàng', dimensions: '1,0 × 1,0 × 1,2 m', floorArea: '1 m²', volume: 'Khoảng 1,2 m³', illustrationScale: 28, roomEquivalent: 'Tương đương một tủ quần áo lớn', capacity: 'Khoảng 6–8 thùng tiêu chuẩn', boxCount: '6–8 thùng', suitableItems: ['Vali và túi du lịch', 'Hồ sơ, sách', 'Đồ trang trí theo mùa', 'Dụng cụ thể thao nhỏ'], image: imageCredits.boxes.src },
  { id: 'small', name: 'Kho nhỏ', kicker: 'Đủ cho một phòng', dimensions: '1,5 × 2,0 × 2,4 m', floorArea: '3 m²', volume: 'Khoảng 7,2 m³', illustrationScale: 44, roomEquivalent: 'Tương đương một phòng chứa đồ nhỏ', capacity: 'Khoảng 20–24 thùng hoặc đồ của một phòng ngủ', boxCount: '20–24 thùng', suitableItems: ['Nệm và khung giường', 'Bàn ghế nhỏ', 'Xe đạp', 'Thùng đồ chuyển nhà'], image: imageCredits.aisle.src },
  { id: 'medium', name: 'Kho vừa', kicker: 'Cho căn hộ hoặc cửa hàng', dimensions: '2,0 × 3,0 × 2,4 m', floorArea: '6 m²', volume: 'Khoảng 14,4 m³', illustrationScale: 66, roomEquivalent: 'Tương đương một phòng ngủ tiêu chuẩn', capacity: 'Đồ của căn hộ studio hoặc hàng của shop nhỏ', boxCount: '45–55 thùng', suitableItems: ['Sofa và tủ lạnh', 'Bộ bàn ăn nhỏ', 'Kệ hàng', 'Hàng tồn kho'], image: imageCredits.warehouse.src },
  { id: 'large', name: 'Kho lớn', kicker: 'Không gian cho một lần chuyển nhà', dimensions: '3,0 × 4,0 × 2,4 m', floorArea: '12 m²', volume: 'Khoảng 28,8 m³', illustrationScale: 88, roomEquivalent: 'Tương đương một garage nhỏ', capacity: 'Đồ của căn hộ 2 phòng ngủ hoặc kho doanh nghiệp', boxCount: '90–100 thùng', suitableItems: ['Nội thất cỡ lớn', 'Thiết bị gia dụng', 'Hồ sơ doanh nghiệp', 'Nhiều pallet hàng'], image: imageCredits.shelving.src },
]

export const storageListings: StorageListing[] = [
  { id: 'lk-a01', code: 'LK-A01', name: 'Tủ lưu trữ A01', sizeId: 'locker', condition: 'standard', status: 'available', floor: 'Tầng trệt', access: 'Hành lang trong nhà', monthlyPrice: null, depositMonths: null, features: ['Khóa riêng', 'Camera khu vực chung', 'Gần quầy hỗ trợ'], image: imageCredits.boxes.src },
  { id: 'sm-b12', code: 'SM-B12', name: 'Kho nhỏ B12', sizeId: 'small', condition: 'standard', status: 'available', floor: 'Tầng trệt', access: 'Gần khu bốc dỡ', monthlyPrice: null, depositMonths: null, features: ['Cửa cuốn riêng', 'Xe đẩy dùng chung', 'Thông thoáng'], image: imageCredits.aisle.src },
  { id: 'sm-c08', code: 'SM-C08', name: 'Kho nhỏ C08', sizeId: 'small', condition: 'climate', status: 'limited', floor: 'Tầng 1', access: 'Thang hàng', monthlyPrice: null, depositMonths: null, features: ['Điều hòa', 'Kiểm soát ra vào', 'Chiếu sáng hành lang'], image: imageCredits.hero.src },
  { id: 'md-d04', code: 'MD-D04', name: 'Kho vừa D04', sizeId: 'medium', condition: 'standard', status: 'available', floor: 'Tầng trệt', access: 'Lối xe đẩy rộng', monthlyPrice: null, depositMonths: null, features: ['Cửa cuốn riêng', 'Gần bãi đỗ', 'Ổ cắm khu vực chung'], image: imageCredits.warehouse.src },
  { id: 'md-e06', code: 'MD-E06', name: 'Kho vừa E06', sizeId: 'medium', condition: 'climate', status: 'available', floor: 'Tầng 1', access: 'Thang hàng', monthlyPrice: null, depositMonths: null, features: ['Điều hòa', 'Kiểm soát ra vào', 'Phù hợp tài liệu'], image: imageCredits.shelving.src },
  { id: 'lg-f02', code: 'LG-F02', name: 'Kho lớn F02', sizeId: 'large', condition: 'standard', status: 'limited', floor: 'Tầng trệt', access: 'Sát khu bốc dỡ', monthlyPrice: null, depositMonths: null, features: ['Lối tiếp cận rộng', 'Phù hợp pallet', 'Xe đẩy dùng chung'], image: imageCredits.aisle.src },
]

export const faqs = [
  ['Tôi nên chọn kho kích thước nào?', 'Hãy bắt đầu bằng món đồ lớn nhất và số thùng dự kiến. Hướng dẫn kích thước cho phép bạn so sánh theo không gian quen thuộc trước khi xem kho trống.'],
  ['Tôi có thể vào kho lúc nào?', 'Khung giờ truy cập chính thức sẽ được xác nhận trong hợp đồng. Thông tin trên website hiện là mô tả quy trình mẫu.'],
  ['Có kho điều hòa không?', 'Có lựa chọn kho điều hòa trong dữ liệu mẫu. Loại này phù hợp hơn với tài liệu, đồ điện tử và vật dụng nhạy cảm với nhiệt độ hoặc độ ẩm.'],
  ['Giữ chỗ có phải là hoàn tất thuê không?', 'Không. Gửi yêu cầu giữ chỗ giúp WDP kiểm tra tình trạng kho và liên hệ xác nhận. Hợp đồng và thanh toán là bước riêng sau đó.'],
  ['Sau này tôi có thể đổi sang kho khác không?', 'Có thể, tùy tình trạng kho trống và điều kiện hợp đồng tại thời điểm yêu cầu.'],
  ['Những vật dụng nào bị cấm?', 'Không lưu trữ chất cháy nổ, hóa chất nguy hiểm, thực phẩm dễ hỏng, sinh vật sống hoặc hàng hóa trái pháp luật.'],
]

export const getStorageSize = (id: string | null | undefined) => storageSizes.find(size => size.id === id)
export const getStorageListing = (id: string | undefined) => storageListings.find(unit => unit.id === id)
