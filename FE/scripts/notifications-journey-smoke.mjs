// GETs use in-memory fixtures; every business write is rejected. Shared database remains untouched.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer, staff, reservation } from './fixtures/workspace.mjs';

const browser = await launchTestBrowser(), errors = [], writes = [], checks = [];
const artifacts = 'artifacts/ux-notifications-20261029'; await mkdir(artifacts, {recursive:true});
async function setup(role = 'CUSTOMER', width = 1440) {
  const context = await browser.newContext({viewport:{width,height:1000}}), data = structuredClone(fixture);
  const actor = {...(role === 'CUSTOMER' ? customer : staff), id: role === 'CUSTOMER' ? customer.id : role === 'STAFF' ? staff.id : role.toLowerCase() + '-id', role, accountStatus:'ACTIVE'};
  const own = { ...reservation, id:'PRIVATE-ID', reference:'NB-JOURNEY', status:'CONFIRMED', quantity:1, expiresAt:'2099-12-01T00:00:00Z', startDate:'2026-10-29', endDate:'2099-01-01' };
  data.reservations = [{...own, id:own.reference, product:{name:'Kho nhỏ A'}, createdAt:'2026-10-29T00:00:00Z'}];
  data.contracts = [{...fixture.contracts[0], id:'journey-contract', reservation:own, status:'PENDING_PAYMENT', startDate:own.startDate, endDate:own.endDate, terms:{acceptedAt:null}}];
  data.invoices = [{...fixture.invoices[0], id:'journey-invoice', invoiceCode:'INV-JOURNEY', reservation:own, signing:{complete:false, contracts:[{id:'journey-contract',code:'CON-JOURNEY'}]}}];
  data.appointments = []; data.returns = []; data.renewals = []; data['payment-submissions'] = []; data['deposit-settlements'] = [];
  data['support-requests'] = Array.from({length:121}, (_,i) => ({...fixture['support-requests'][0], id:`notice-${i}`, supportCode:`SUP-${String(i).padStart(3,'0')}`, subject:'Cần hỗ trợ bảo quản đồ', status:'ASSIGNED', category:'OTHER', reservation:own, assignedStaff:staff, createdAt:'2026-10-29T00:00:00Z'}));
  data.users = [actor];
  await context.addInitScript(() => localStorage.setItem('wdp-auth-token-v1','fixture-session'));
  await context.route(/\/api\//, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^\/api\//,''), method = req.method();
    if (method === 'OPTIONS') return route.fulfill({status:204});
    const send = json => route.fulfill({status:200,json});
    if (method !== 'GET') { writes.push(path); return route.fulfill({status:500,json:{message:'No real or mocked business writes allowed in this suite'}}); }
    if (path === 'auth/me') return send(actor);
    if (path === 'reservations') return send(data.reservations);
    if (path === 'customer/payment-config') return send({configured:false,vnpayConfigured:false});
    if (path === 'manager/dashboard/summary') return send({availableUnits:1,activeRentals:1});
    if (path === 'manager/staff') return send({page:1,limit:100,total:2,items:[{...staff,id:'busy-staff',fullName:'Nhân viên đang bận'},{...staff,id:'free-staff',fullName:'Nhân viên còn trống'}]});
    if (path === 'manager/unit-staff-assignments') return send({enabled:false,items:[]});
    const parts = path.split('/'), offset = parts[1] === 'management' ? 2 : 1, kind = parts[offset], id = parts[offset+1];
    if (kind === 'stored-items') return send([]);
    const items = data[kind]; if (!items) throw new Error('Unexpected fixture GET: ' + path);
    if (id) return send(items.find(item => item.id === id || item.reference === id) ?? {});
    const limit = Number(url.searchParams.get('limit') || 20), page = Number(url.searchParams.get('page') || 1);
    return send({page,limit,total:items.length,items:items.slice((page-1)*limit,page*limit)});
  });
  const page = await context.newPage(); page.setDefaultTimeout(25000); page.on('pageerror',error=>errors.push(error.message));
  const goto = path => page.goto('http://127.0.0.1:5173'+path,{waitUntil:'domcontentloaded'});
  const pulse = () => page.evaluate(() => window.dispatchEvent(new StorageEvent('storage',{key:'nestbox-data-updated-v1',newValue:JSON.stringify({at:Date.now()})})));
  return {context,page,goto,pulse,data,own};
}
try {
  for (const width of [1440,390]) {
    const app = await setup('CUSTOMER',width), progress = app.page.locator('[aria-label="Tiến độ thuê kho"]');
    await app.goto('/customer');
    await progress.getByRole('link',{name:'Đọc và ký hợp đồng',exact:true}).waitFor();
    await app.page.screenshot({path:`${artifacts}/customer-progress-${width}.png`,fullPage:true});
    assert.equal(await progress.locator('li[aria-current="step"]').innerText(), '2\nKý hợp đồng');
    app.data.contracts[0].terms.acceptedAt = new Date().toISOString(); app.data.invoices[0].signing.complete = true; await app.pulse();
    await progress.getByRole('link',{name:'Mở hóa đơn thanh toán',exact:true}).waitFor();
    app.data['payment-submissions'] = [{id:'notice-transfer',status:'PENDING_VERIFICATION',invoice:{id:'journey-invoice'}}]; await app.pulse();
    await progress.getByRole('link',{name:'Theo dõi xác nhận thanh toán',exact:true}).waitFor();
    app.data.invoices[0].status = 'PAID'; app.data.invoices[0].balanceDue = 0; app.data.contracts[0].status = 'READY_FOR_HANDOVER'; app.data['payment-submissions'] = []; await app.pulse();
    await progress.getByRole('link',{name:'Đặt lịch nhận kho',exact:true}).waitFor();
    await progress.getByRole('link',{name:'Đặt lịch nhận kho',exact:true}).click();
    await app.page.waitForFunction(()=>document.querySelector('select[aria-label="Yêu cầu đặt kho"]')?.value==='PRIVATE-ID');
    app.data.contracts[0].status='ACTIVE'; await app.goto('/customer'); await progress.getByRole('link',{name:'Mở kho đang thuê',exact:true}).waitFor();
    app.data.returns=[{...fixture.returns[0],reservation:app.own,status:'REQUESTED'}]; await app.pulse();
    await progress.getByRole('link',{name:'Theo dõi trả kho & cọc',exact:true}).waitFor();
    app.data.returns[0].status='COMPLETED'; await app.pulse(); await progress.getByRole('heading',{name:'Đã hoàn tất trả kho',exact:true}).waitFor();
    assert(await app.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await app.context.close(); checks.push(`${width}px: live six-step journey, alias-safe appointment prefill, payment wait, return completion and no horizontal overflow`);
  }
  const app = await setup(); await app.goto('/customer/notifications');
  await app.page.getByRole('heading',{name:'Thông báo & việc cần làm',exact:true}).waitFor();
  await app.page.getByLabel('Nghiệp vụ',{exact:true}).selectOption('support-requests');
  await app.page.getByRole('button',{name:/^Tất cả \(/}).click();
  await app.page.getByText('1–20 / 121 hồ sơ',{exact:true}).waitFor();
  await app.page.getByRole('button',{name:'Sau',exact:true}).click(); await app.page.getByText('21–40 / 121 hồ sơ',{exact:true}).waitFor();
  await app.page.getByLabel('Tìm thông báo',{exact:true}).fill('ho tro bao quan do');
  await app.page.getByText('1–20 / 121 hồ sơ',{exact:true}).waitFor();
  await app.page.getByRole('button',{name:'Đánh dấu đã đọc',exact:true}).click();
  await app.page.getByRole('button',{name:/^Chưa đọc \(/}).click();
  await app.page.getByText('Không có kết quả phù hợp.',{exact:false}).waitFor();
  await app.page.reload(); await app.page.getByLabel('Nghiệp vụ',{exact:true}).selectOption('support-requests');
  await app.page.getByText('Bạn đã xem hết thông báo hiện có.',{exact:false}).waitFor();
  app.data['support-requests'][0].status='RESOLVED'; app.data['support-requests'][0].resolutionNote='Đã kiểm tra và xử lý xong'; await app.pulse();
  await app.page.getByText('1–1 / 1 hồ sơ',{exact:true}).waitFor();
  await app.page.getByText(/Vừa nhận 1 cập nhật hồ sơ/).waitFor();
  await app.page.screenshot({path:`${artifacts}/customer-notifications-1440.png`,fullPage:true});
  await app.context.setOffline(true); await app.page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await app.page.getByText(/Chưa tải được: Kết nối mạng/).waitFor();
  assert.equal(await app.page.locator('.activity-item').count(),1);
  await app.context.setOffline(false); await app.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await app.page.getByRole('button',{name:'Kiểm tra mới',exact:true}).waitFor();
  await app.page.getByRole('button',{name:'Đóng nhắc cập nhật',exact:true}).click();
  await app.goto('/customer/support?reservation=NB-JOURNEY');
  await app.page.getByRole('button',{name:/^Thông báo, [1-9]/}).waitFor();
  await app.page.getByLabel('Chi tiết',{exact:true}).fill('Nội dung đang nhập cần giữ nguyên');
  app.data['support-requests'][1].status='RESOLVED'; await app.pulse();
  await app.page.getByText(/Vừa nhận 1 cập nhật hồ sơ/).waitFor();
  assert.equal(await app.page.getByLabel('Chi tiết',{exact:true}).inputValue(),'Nội dung đang nhập cần giữ nguyên');
  await app.context.close(); checks.push('Complete paginated inbox >100, accent-free search, durable read state, changed dossier becomes unread, cross-tab update, offline recovery and draft preservation');
  const assignment = await setup('MANAGER');
  for (const task of assignment.data['support-requests']) task.assignedStaff = {...staff,id:'busy-staff'};
  await assignment.goto('/manager/assignments?kind=support-requests');
  await assignment.page.getByRole('row').filter({hasText:'SUP-000'}).getByRole('button',{name:'Xem / Đổi',exact:true}).click();
  await assignment.page.getByRole('button',{name:'Dùng gợi ý',exact:true}).click();
  assert.equal(await assignment.page.getByRole('combobox',{name:'Nhân viên phụ trách',exact:true}).inputValue(),'free-staff');
  assert(await assignment.page.locator('form[data-wdp-dirty="true"]').count());
  await assignment.context.close(); checks.push('Manager receives active low-workload suggestion; selecting it preserves an unsaved draft and never assigns without saving');
  for (const role of ['STAFF','MANAGER','ADMIN']) {
    const app = await setup(role,390); await app.goto(`/${role.toLowerCase()}/notifications`);
    await app.page.getByRole('heading',{name:'Thông báo & việc cần làm',exact:true}).waitFor();
    await app.page.getByRole('button',{name:/^Tất cả \(/}).click();
    await app.page.locator('.activity-item').first().waitFor();
    for (const href of await app.page.locator('.activity-item').evaluateAll(items=>items.map(item=>item.getAttribute('href')))) assert(href.startsWith(`/${role.toLowerCase()}/`),href);
    if (role === 'ADMIN') assert.equal(await app.page.locator('.manager-sidebar nav a').count(),2);
    assert(await app.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await app.page.screenshot({path:`${artifacts}/${role.toLowerCase()}-notifications-390.png`,fullPage:true});
    await app.context.close(); checks.push(`${role}: 390px inbox stays in its own role; Admin retains exactly two main menus`);
  }
  assert.deepEqual(errors,[]); assert.deepEqual(writes,[]);
  console.log(JSON.stringify({checks,browserErrors:errors.length,realDatabaseWrites:0},null,2));
} catch(error) {
  for(const ctx of browser.contexts()) for(const page of ctx.pages()) console.error(page.url(),(await page.locator('body').innerText()).slice(-4500));
  throw error;
} finally { await browser.close(); }
