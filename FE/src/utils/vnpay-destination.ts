/** Only the provider's payment hosts may receive a customer's redirect. */
export function vnpayDestination(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['sandbox.vnpayment.vn', 'pay.vnpayment.vn', 'pay.vnpay.vn'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Đường dẫn thanh toán VNPay không hợp lệ.');
  return url;
}
