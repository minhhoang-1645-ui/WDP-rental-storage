// All requests, including booking creation, are mocked. No shared database access.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { fixture, customer, staff } from './fixtures/workspace.mjs';
const base = process.env.WDP_FE_URL || 'http://localhost:5173';
const browser = await launchTestBrowser(), errors = [], writes = [];
const product = { id:'identity-type', code:'TYPE-CODE-NOT-A-UNIT', name:'Kho nhỏ cùng loại', sizeId:'small', condition:'standard', status:'available', floor:'Tầng trệt', access:'Theo giờ cơ sở', monthlyPrice:1000000, depositMonths:1, minRentalDays:30, allowDailyRental:false, features:[], image:'/storage-space.svg', dimensions:'1 × 2 × 3 m', floorArea:'2 m²', volume:'6 m³' };
const size = { id:'small', name:'Kho nhỏ', dimensions:product.dimensions, floorArea:'2 m²', volume:'6 m³', image:product.image, suitableItems:[], illustrationScale:1, kicker:'Kho tự quản', roomEquivalent:'Đồ dùng', capacity:'Theo kích thước', boxCount:'Tùy cách sắp xếp' };
const quote = { status:'PRICED', periodStatus:'APPROVED_DURATION', lineItems:[], rentalSubtotal:3000000, rentalAmount:3000000, baseRentalAmount:3000000, deposit:1000000, depositAmount:1000000, grandTotal:4000000, quotedTotalAmount:4000000, quantity:1, currency:'VND', storageTypeId:product.id, storageTypeName:product.name, monthlyUnitPrice:1000000, termMonths:3, paymentPlan:'PAY_MONTHLY', billingMode:'MONTHLY', discountPercent:0, discountAmount:0, message:'Báo giá kiểm thử' };
const make = (id,status,createdAt) => ({ id, reference:id, status, createdAt, product, storageType:{id:product.id,name:product.name}, productId:product.id, quantity:1, startDate:'2027-01-01', endDate:'2027-04-01', endDateExclusive:'2027-04-01', periodMode:'duration', durationMonths:3, adjacencyPreference:false, quote, customer:{...customer,role:'CUSTOMER'}, unitAssignment:null, expiresAt:null, note:'', addonIds:[], paymentPlan:'PAY_MONTHLY', paymentChoice:'pay-later', paymentStatus:'NOT_STARTED', persistence:'DATABASE' });
async function setup(role, resultStatus='PENDING') {
  const context = await browser.newContext({ viewport:{width:1366,height:900}, permissions:['clipboard-read','clipboard-write'] });
  await context.addInitScript(() => { localStorage.setItem('wdp-auth-token-v1','fixture-identity'); localStorage.setItem('wdp-booking-draft-v1',JSON.stringify({productId:'identity-type',startDate:'2027-01-01',durationMonths:3,periodMode:'duration',quantity:1,services:[],addonIds:[],paymentPlan:'PAY_MONTHLY'})); });
  const old = Array.from({length:12},(_,i)=>make(`OLD-${i}`,i%2?'PENDING':'CONFIRMED',new Date(Date.UTC(2026,9,i+1,9,i)).toISOString()));
  let newest = null;
  const matchingContract = {...fixture.contracts[0], id:'contract-target', contractCode:'CON-TARGET', storageType:{id:product.id,name:product.name}, storageUnit:{...fixture.contracts[0].storageUnit, unitCode:'REAL-UNIT-7'}, reservation:{id:'db-target',reference:'NEW-API-ID',status:'CONFIRMED',quantity:1,customer}};
  const otherContract = {...matchingContract,id:'contract-other',contractCode:'CON-OTHER',reservation:{...matchingContract.reservation,id:'db-other',reference:'OTHER-ORDER'}};
  const matchingInvoice = {...fixture.invoices[0],id:'invoice-target',invoiceCode:'INV-TARGET',reservation:{...matchingContract.reservation,storageType:matchingContract.storageType},signing:{complete:false},billingPeriodStart:'2027-01-01',billingPeriodEnd:'2027-04-01'};
  await context.route('**/*', async route => {
    const request=route.request(); if(!['fetch','xhr','eventsource'].includes(request.resourceType())) return route.continue();
    const url=new URL(request.url()), path=url.pathname.replace(/^\/(?:api\/)?/,'').replace('staff/management/','staff/');
    const send=json=>route.fulfill({json});
    if(request.method()==='OPTIONS') return route.fulfill({status:204});
    if(path==='auth/me') return send({...customer,...(role==='CUSTOMER'?{}:staff),role});
    if(path==='booking/catalog') return send({products:[product],sizes:[size],approvedDurations:[1,3,6,12],addons:[]});
    if(path==='additional-services') return send([]);
    if(path==='pricing/quote') return send({...quote,startDate:'2027-01-01',endDate:'2027-04-01'});
    if(path==='booking/availability') return send({available:true,availableUnits:20,requestedQuantity:1,productId:product.id,startDate:'2027-01-01',endDate:'2027-04-01',message:'Còn kho trong kỳ thuê.',adjacencySatisfied:true});
    if(path==='reservations'&&request.method()==='POST') { writes.push(path); newest=make('NEW-API-ID',resultStatus,new Date().toISOString()); return send(newest); }
    if(request.method()!=='GET') throw new Error('Unexpected mutation '+path);
    const reservations = newest ? [old[0],newest,...old.slice(1)] : old;
    if(path==='reservations') return send(reservations);
    if(path.startsWith('reservations/')) return send(reservations.find(row=>row.id===path.split('/').at(-1)));
    if(/^(staff|manager)\/reservations\//.test(path)) return send(reservations.find(row=>row.id===path.split('/').at(-1)));
    if(path==='customer/payment-config') return send({configured:false,vnpayConfigured:false});
    const items=path.endsWith('/reservations') ? reservations : path.endsWith('/contracts') ? [otherContract,matchingContract] : path.endsWith('/invoices') ? [{...matchingInvoice,id:'invoice-other',invoiceCode:'INV-OTHER',reservation:{...matchingInvoice.reservation,id:'db-other',reference:'OTHER-ORDER'}},matchingInvoice] : [];
    const page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||100);
    return send({page,limit,total:items.length,items:items.slice((page-1)*limit,page*limit)});
  });
  const page=await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror',error=>errors.push(error.message));
  return {page,context};
}
try {
  await mkdir('artifacts/record-identity',{recursive:true});
  for(const status of ['PENDING','CONFIRMED']) {
    const {page,context}=await setup('CUSTOMER',status);
    await page.goto(base+'/booking?product='+product.id);
    await page.getByRole('button',{name:'Chọn thời gian',exact:true}).click();
    await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
    await page.getByRole('button',{name:'Gửi yêu cầu đặt kho',exact:true}).click();
    await page.waitForURL(base+'/customer/reservations/NEW-API-ID');
    await page.getByRole('heading',{name:product.name+' · 1 kho',exact:true}).waitFor();
    await page.locator('main .record-code-value').filter({hasText:'NEW-API-ID'}).first().waitFor();
    await page.locator('main .customer-status--'+status.toLowerCase()).first().waitFor();
    assert.equal(await page.getByRole('button',{name:'Thanh toán VNPay',exact:true}).count(),0);
    const contractLink=page.locator('.customer-next-actions a').filter({hasText:'Xem hợp đồng'});
    if(status==='PENDING') assert.equal(await contractLink.count(),0);
    else {
      assert.equal(await contractLink.getAttribute('href'),'/customer/contracts?reservation=NEW-API-ID');
      await contractLink.click(); await page.getByText('CON-TARGET',{exact:true}).waitFor();
      assert.equal(await page.getByText('CON-OTHER',{exact:true}).count(),0);
      await page.goto(base+'/customer/payments?reservation=NEW-API-ID');
      await page.getByText('INV-TARGET',{exact:true}).waitFor(); assert.equal(await page.getByText('INV-OTHER',{exact:true}).count(),0);
    }
    await page.goto(base+'/customer/reservations');
    await page.getByText('1–10 / 13 bản ghi',{exact:true}).waitFor();
    assert.equal(await page.locator('.customer-table tbody tr').first().locator('.record-code-value').innerText(),'NEW-API-ID');
    assert.equal(await page.locator('.customer-table tbody tr').first().getByText('Vừa gửi',{exact:true}).count(),1);
    await page.locator('.customer-table tbody tr').first().getByRole('button',{name:'Sao chép mã đơn NEW-API-ID',exact:true}).click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'NEW-API-ID');
    await page.getByRole('combobox',{name:'Số dòng mỗi trang'}).selectOption('5');
    await page.getByText('1–5 / 13 bản ghi',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Trang sau',exact:true}).click();
    await page.getByText('6–10 / 13 bản ghi',{exact:true}).waitFor();
    assert.equal(await page.locator('.customer-table tbody tr').first().locator('.record-code-value').innerText(),'OLD-7');
    await page.getByRole('searchbox',{name:'Tìm đơn'}).fill('OLD-1');
    await page.waitForFunction(()=>document.querySelectorAll('.customer-table tbody tr').length===3);
    assert.equal(await page.locator('.customer-table tbody tr').first().locator('.record-code-value').innerText(),'OLD-11');
    await page.setViewportSize({width:390,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`artifacts/record-identity/customer-${status}.png`,fullPage:true,animations:'disabled'});
    await context.close();
  }
  for(const role of ['STAFF','MANAGER']) {
    const {page,context}=await setup(role);
    // Keep the role's existing accessible destination; no new permission or action is introduced.
    await page.goto(base+`/${role.toLowerCase()}/reservations`);
    if(role==='STAFF') {
      await page.getByRole('button',{name:'Chờ nhân viên xử lý',exact:true}).click();
      await page.locator('.record-attention').first().waitFor();
      assert.equal(await page.locator('tbody .manager-status.is-confirmed').count(),0);
      assert((await page.locator('tbody tr').first().innerText()).includes(customer.fullName));
      await page.locator('tbody tr').first().getByRole('link',{name:/Mở /}).click();
      await page.getByRole('heading',{name:product.name,exact:true}).waitFor();
    } else {
      assert(!new URL(page.url()).pathname.startsWith('/staff/'));
      assert.equal(await page.getByRole('button',{name:'Chờ nhân viên xử lý',exact:true}).count(),0);
      await page.goto(base+'/manager/operations/contracts');
      const target=page.locator('tbody tr').filter({hasText:'CON-TARGET'});
      await target.waitFor();
      assert((await target.innerText()).includes(customer.fullName));
      assert((await target.innerText()).includes('REAL-UNIT-7'));
      assert((await target.getByRole('link',{name:'Mở CON-TARGET',exact:true}).getAttribute('href')).endsWith('/contracts/contract-target'));
    }
    await context.close();
  }
  assert.deepEqual(errors,[]); assert.equal(writes.length,2);
  console.log('PASS: mocked booking creates exact ID → correct detail; PENDING/CONFIRMED; scoped contract/invoice; same-type order sorting/search/5–10 pagination; Staff pending queue; responsive. No real database writes.');
} finally { await browser.close(); }
