import { isIP } from 'node:net';

const read = (env, key) => typeof env[key] === 'string' ? env[key].trim() : '';
const placeholder = value => /^(?:replace(?:-|_|\s)|change.?me|your(?:-|_|\s)|test-only|x{6,}$)/i.test(value);
const present = (env, key) => Boolean(read(env, key)) && !placeholder(read(env, key));
const publicHttps = value => {
  try {
    const url = new URL(value), host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host || host === 'localhost' || /\.(?:localhost|local|internal|lan|test|invalid|example)$/.test(host) || /^(?:[^.]+\.)?example\.(?:com|net|org)$/.test(host)) return null;
    if (isIP(host) === 4) {
      const [a, b] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127) return null;
    } else if (isIP(host) === 6) {
      if (host === '::' || host === '::1' || /^(?:fc|fd|fe[89ab]|::ffff:)/.test(host)) return null;
    } else if (!host.includes('.')) return null;
    return url;
  } catch { return null; }
};
const originUrl = value => {
  const url = publicHttps(value);
  return url && url.pathname === '/' && !url.search && !url.hash ? url : null;
};

/** Returns fixed labels/booleans only; configuration values never enter its output. */
export function productionReadiness(env) {
  const checks = [], add = (id, ok, label) => checks.push({ id, ok: Boolean(ok), label });
  add('NODE_ENV', read(env, 'NODE_ENV') === 'production', 'NODE_ENV phải là production trước khi triển khai thật.');
  add('SINGLE_INSTANCE', ['APP_INSTANCE_COUNT', 'WEB_CONCURRENCY'].every(key => !read(env, key) || read(env, key) === '1'), 'APP_INSTANCE_COUNT / WEB_CONCURRENCY chỉ hỗ trợ một instance vì phiên đăng nhập và OTP còn nằm trong bộ nhớ.');
  add('DEMO_PAYMENT_ENABLED', read(env, 'DEMO_PAYMENT_ENABLED') !== 'true', 'DEMO_PAYMENT_ENABLED phải tắt.');
  const secret = read(env, 'INQUIRY_LOOKUP_SECRET');
  add('INQUIRY_LOOKUP_SECRET', secret.length >= 32 && new Set(secret).size >= 12 && !placeholder(secret), 'INQUIRY_LOOKUP_SECRET cần khóa riêng đủ dài, không dùng giá trị mẫu.');
  const frontend = originUrl(read(env, 'FRONTEND_PUBLIC_URL'));
  add('FRONTEND_PUBLIC_URL', frontend, 'FRONTEND_PUBLIC_URL cần origin HTTPS công khai, không dùng địa chỉ local hoặc thông tin đăng nhập trong URL.');
  const origins = read(env, 'FRONTEND_URL').split(',').map(value => value.trim()).filter(Boolean);
  add('FRONTEND_URL', origins.length > 0 && origins.every(value => originUrl(value)) && frontend && origins.some(value => originUrl(value)?.origin === frontend.origin), 'FRONTEND_URL cần danh sách origin HTTPS cho CORS, gồm origin của FRONTEND_PUBLIC_URL.');
  let database = false;
  try { const url = new URL(read(env, 'DATABASE_URL')); database = ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname && url.pathname.length > 1 && url.username); } catch { /* Fixed failure label only. */ }
  add('DATABASE_URL', database, 'DATABASE_URL cần chuỗi kết nối PostgreSQL hợp lệ; kết nối thực tế phải kiểm tra qua /api/health/ready.');
  const provider = read(env, 'EMAIL_PROVIDER'), port = Number(read(env, 'SMTP_PORT'));
  const smtp = provider === 'smtp' && ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].every(key => present(env, key)) && Number.isInteger(port) && port >= 1 && port <= 65535
    && ['true', 'false'].includes(read(env, 'SMTP_SECURE')) && (port !== 465 || read(env, 'SMTP_SECURE') === 'true');
  const resend = provider === 'resend' && present(env, 'RESEND_API_KEY');
  add('EMAIL_SIGNING', (smtp || resend) && /^\S+@\S+\.\S+$/.test(read(env, 'EMAIL_FROM_ADDRESS')), 'Cần cấu hình email smtp/resend và EMAIL_FROM_ADDRESS để gửi OTP ký; không dùng provider development.');
  add('CONTRACT_ISSUER', ['CONTRACT_LEGAL_NAME', 'CONTRACT_TAX_CODE', 'CONTRACT_ADDRESS', 'CONTRACT_REPRESENTATIVE', 'CONTRACT_TERMS_VERSION'].every(key => present(env, key)), 'Điền đủ thông tin bên cho thuê và phiên bản điều khoản CONTRACT_* bằng thông tin nhóm đã kiểm tra.');
  add('CONTRACT_TERMS_APPROVED', read(env, 'CONTRACT_TERMS_APPROVED') === 'true', 'CONTRACT_TERMS_APPROVED chỉ bật sau khi bên cho thuê duyệt nội dung; lệnh này không thẩm định pháp lý.');
  const bankFields = ['WDP_BANK_NAME', 'WDP_BANK_CODE', 'WDP_BANK_ACCOUNT_NUMBER', 'WDP_BANK_ACCOUNT_NAME'];
  const bankAdvertised = bankFields.every(key => Boolean(read(env, key)));
  const bank = bankFields.every(key => present(env, key)) && /^\d{6}$/.test(read(env, 'WDP_BANK_CODE')) && /^[A-Za-z0-9]{1,19}$/.test(read(env, 'WDP_BANK_ACCOUNT_NUMBER'));
  const vnpayFields = ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_PAYMENT_URL', 'VNPAY_RETURN_URL'];
  const vnpayAdvertised = vnpayFields.every(key => Boolean(read(env, key)));
  const payUrl = publicHttps(read(env, 'VNPAY_PAYMENT_URL')), returnUrl = publicHttps(read(env, 'VNPAY_RETURN_URL'));
  const vnpay = vnpayFields.every(key => present(env, key)) && payUrl && ['pay.vnpay.vn', 'pay.vnpayment.vn'].includes(payUrl.hostname)
    && !payUrl.port && !payUrl.search && !payUrl.hash && returnUrl && frontend && returnUrl.origin === frontend.origin && returnUrl.pathname === '/customer/payments/vnpay-return' && !returnUrl.search && !returnUrl.hash;
  add('PAYMENT_CHANNEL', bank || vnpay, 'Cần ít nhất một kênh nhận tiền được cấu hình đúng: chuyển khoản ngân hàng hoặc VNPay thật. Không bắt buộc cả hai.');
  if (bankAdvertised) add('BANK_DETAILS', bank, 'Thông tin WDP_BANK_* đang bật phải đúng định dạng BIN và số tài khoản.');
  if (vnpayAdvertised) add('VNPAY_DETAILS', vnpay, 'VNPay đang bật cần URL gateway thật do nhà cung cấp cấp và return HTTPS cùng origin web; không dùng sandbox cho cấu hình production.');
  return { ready: checks.every(check => check.ok), scope: 'configuration-only', checks };
}

export function formatProductionReadiness(result) {
  return [result.ready ? 'ĐẠT kiểm tra cấu hình production.' : 'CHƯA SẴN SÀNG triển khai production.', ...result.checks.map(check => `${check.ok ? '[ĐẠT]' : '[THIẾU]'} ${check.id}: ${check.label}`),
    'Chỉ kiểm tra cấu hình, không gửi email, không chuyển tiền và không ghi database. Chưa xác minh DNS/TLS, tài khoản nhận tiền, merchant/IPN hoặc thông tin pháp nhân.',
    'Sau khi chạy BE, kiểm tra /api/health/ready và thực hiện nghiệm thu email/thanh toán với người phụ trách.'].join('\n');
}
