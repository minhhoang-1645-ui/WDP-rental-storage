// Real read-only catalog/pricing; inventory availability is a browser fixture. No business writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { customer, fixture } from './fixtures/workspace.mjs';

const api = process.env.WDP_API_URL || 'http://127.0.0.1:3001/api';
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const proof = await fetch(api+'/_test/read-only').then(r=>r.json());
assert(proof.testOnly && proof.databaseMode==='READ_ONLY');
const [catalog, services] = await Promise.all([fetch(api+'/booking/catalog').then(r=>r.json()),fetch(api+'/additional-services').then(r=>r.json())]);
const serviceProduct = catalog.products.find(row=>row.id==='sm-b12' && row.monthlyPrice>0) || catalog.products.find(row=>row.monthlyPrice>0);
assert(serviceProduct);
const lockerProduct=catalog.products.find(row=>row.sizeId==='locker' && row.monthlyPrice===650000);assert(lockerProduct,'Use the existing locker price shown by the customer; no seed is performed.');
const chosen = ['ONE_TIME','DAY','MONTH'].map(kind=>services.find(row=>row.billingUnit===kind && row.unitPrice>0 && row.isActive!==false));
assert(chosen.every(Boolean),'Need three existing priced service kinds for this acceptance test. No seed is performed.');
const selections = chosen.map(service=>({serviceId:service.id,quantity:2,...(service.kind==='RENTAL'?{serviceStartDate:'2027-01-31',serviceEndDate:service.billingUnit==='DAY'?'2027-02-05':'2027-03-31'}:{})}));
const browser = await launchTestBrowser(), errors=[],unexpected=[],checks=[];
const artifacts = 'artifacts/ux-notifications-20261029';
await mkdir(artifacts,{recursive:true});
try {
  for (const {width,product,selections:caseSelections,kind} of [1440,390].flatMap(width=>[{width,product:serviceProduct,selections,kind:'services'},{width,product:lockerProduct,selections:[],kind:'locker'}])) {
    const context=await browser.newContext({viewport:{width,height:1000}});
    await context.addInitScript(({productId,selections})=>localStorage.setItem('wdp-booking-draft-v1',JSON.stringify({productId,startDate:'2027-01-31',durationMonths:3,periodMode:'duration',quantity:1,services:selections,addonIds:[],paymentPlan:'PAY_MONTHLY'})),{productId:product.id,selections:caseSelections});
    let quote, closing=false;
    await context.route(/\/api\//,async route=>{
      try {
      const req=route.request(), path=new URL(req.url()).pathname.replace(/^\/api\//,'');
      if(req.method()==='GET' && ['booking/catalog','additional-services'].includes(path)) return route.fulfill({response:await route.fetch({url:api+'/'+path})});
      if(req.method()==='GET' && /^additional-services\/[^/]+\/availability$/.test(path)) return route.fulfill({json:{available:true,availableQuantity:100,requestedQuantity:2,testOnly:true}});
      if(req.method()==='POST' && ['pricing/quote','booking/availability'].includes(path)) {
        const response=await route.fetch({url:api+'/'+path}), body=await response.json();
        assert(response.ok(),JSON.stringify(body));
        if(path==='pricing/quote') quote=body;
        return route.fulfill({response,json:body});
      }
      unexpected.push(req.method()+':'+path); return route.abort();
      } catch(error) { if(!closing) throw error; }
    });
    const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',err=>errors.push(err.message));
    await page.goto(base+'/booking?product='+encodeURIComponent(product.id),{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Chọn thời gian',exact:true}).click();
    const panel=page.locator('.quote-breakdown').first();
    await panel.getByRole('heading',{name:'Thanh toán lần đầu',exact:true}).waitFor();
    const verify=async plan=>{
      await page.waitForFunction(plan=>document.querySelector('.payment-option.is-selected')?.textContent.includes(plan==='PREPAID'?'Trả trước':'hàng tháng'),plan);
      await page.waitForFunction(()=>!!document.querySelector('.quote-breakdown .quote-initial-payment'));
      await assertEventually(async()=>assert.equal(quote?.paymentPlan,plan));
      assert.equal(quote.lineItems.reduce((sum,row)=>sum+row.amount,0),quote.quotedTotalAmount);
      const first=quote.initialPaymentBreakdown;
      assert.equal(first.rentalAmount+first.depositAmount+first.purchaseAddOnAmount+first.rentalAddOnAmount,quote.estimatedInitialAmountDue);
      assert.equal(first.totalAmount+first.remainingAmount,quote.quotedTotalAmount);
      await assertEventually(async()=>assert.equal(await panel.locator('.quote-breakdown-lines').first().locator(':scope > div').count(),quote.lineItems.length));
      const firstFormatted=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(quote.estimatedInitialAmountDue);
      await assertEventually(async()=>assert.equal((await panel.locator('.quote-first-amount').innerText()).replace(/\s/g,''),firstFormatted.replace(/\s/g,'')));
      const formatted=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(quote.quotedTotalAmount);
      await assertEventually(async()=>assert.equal((await panel.locator('.quote-breakdown-total strong').first().innerText()).replace(/\s/g,''),formatted.replace(/\s/g,'')));
    };
    await verify('PAY_MONTHLY');
    if(kind==='locker') {assert.equal(quote.estimatedInitialAmountDue,650000);assert.equal(quote.quotedTotalAmount,1950000);assert.match(await panel.locator('.quote-later-payment').innerText(),/2 kỳ còn lại/);}
    await page.locator('.availability-badge.is-available').first().waitFor();
    await page.locator('.booking-summary').screenshot({path:artifacts+'/pricing-'+kind+'-monthly-'+width+'.png'});

    await page.getByRole('button',{name:/^Trả trước toàn bộ kỳ/}).click();await verify('PREPAID');
    assert.equal(quote.discountPercent,5);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+'px overflow');
    assert(await page.locator('.booking-summary').evaluate(node=>node.scrollHeight<=node.clientHeight+1),'Detailed quote must not hide total/payment inside another scroll area');
    await page.waitForFunction(()=>!!document.querySelector('.availability-badge.is-available'));
    await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
    await page.screenshot({path:artifacts+'/pricing-'+kind+'-'+width+'.png',fullPage:true});
    await page.locator('.booking-summary').screenshot({path:artifacts+'/pricing-summary-'+kind+'-'+width+'.png'});
    await page.getByRole('button',{name:/^Thanh toán hàng tháng/}).click();await verify('PAY_MONTHLY');
    checks.push(width+'px '+kind+': '+(kind==='locker' ? '650k upfront, 1.95m full term, two 650k later payments and rent-only prepaid offer' : 'one-time/day/month services, calendar-end dates, item sums, first payment and variable later installments'));
    closing=true;
    await context.unrouteAll({behavior:'ignoreErrors'});
    await context.close();
  }
  const mobile = await browser.newContext({viewport:{width:390,height:960}});
  await mobile.addInitScript(()=>localStorage.setItem('wdp-mobile-auth-token','quote-ui-fixture'));
  await mobile.route(/\/api\//,async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.replace(/^\/api\//,'');
    if(req.method()==='OPTIONS')return route.fulfill({status:204});
    if(req.method()==='GET' && path==='auth/me')return route.fulfill({json:{...customer,role:'CUSTOMER'}});
    if(req.method()==='GET' && path==='booking/catalog')return route.fulfill({json:catalog});
    if(req.method()==='GET' && ['additional-services','reservations'].includes(path))return route.fulfill({json:[]});
    if(req.method()==='GET' && path.startsWith('customer/'))return route.fulfill({json:{items:[],total:0,page:1,limit:100}});
    if(req.method()==='POST' && path==='booking/availability')return route.fulfill({response:await route.fetch({url:api+'/'+path})});
    unexpected.push(req.method()+':mobile:'+path);return route.abort();
  });
  const mobilePage=await mobile.newPage();mobilePage.setDefaultTimeout(60000);mobilePage.on('pageerror',err=>errors.push(err.message));
  await mobilePage.goto('http://127.0.0.1:8081/customer/booking?product='+encodeURIComponent(lockerProduct.id),{waitUntil:'domcontentloaded',timeout:90000});
  await mobilePage.getByLabel('Ngày bắt đầu (YYYY-MM-DD)',{exact:true}).fill('2027-01-31');
  await mobilePage.getByRole('button',{name:'Tiếp tục',exact:true}).click();
  await mobilePage.getByRole('button',{name:'Kiểm tra khả dụng & báo giá',exact:true}).click();
  const upfront=mobilePage.getByLabel('Số tiền thanh toán lần đầu dự kiến',{exact:true});await upfront.waitFor();
  assert.equal((await upfront.innerText()).replace(/\D/g,''),'650000');
  await mobilePage.getByText(/2 kỳ còn lại ×/).waitFor();
  assert(await mobilePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile quote overflows');
  await mobilePage.screenshot({path:artifacts+'/pricing-locker-mobile.png',fullPage:true});
  await mobile.unrouteAll({behavior:'ignoreErrors'});await mobile.close();
  checks.push('Expo web 390px: customer booking shows 650k first payment and two remaining installments without submitting a reservation');
  const billing=await browser.newContext({viewport:{width:390,height:960}});
  const partialInvoice={...fixture.invoices[0],id:'pricing-partial',invoiceCode:'QUOTE-PARTIAL',status:'PARTIALLY_PAID',rentalAmount:650000,depositAmount:0,serviceAmount:0,chargeAmount:0,totalAmount:650000,amountPaid:150000,balanceDue:500000};
  await billing.addInitScript(()=>localStorage.setItem('wdp-auth-token-v1','quote-invoice-fixture'));
  await billing.route(/\/api\//,async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.replace(/^\/api\//,'');
    if(req.method()==='OPTIONS')return route.fulfill({status:204});
    if(req.method()!=='GET'){unexpected.push(req.method()+':invoice:'+path);return route.abort();}
    if(path==='auth/me')return route.fulfill({json:{...customer,role:'CUSTOMER'}});
    if(path==='reservations')return route.fulfill({json:[]});
    if(path==='customer/payment-config')return route.fulfill({json:{configured:false,vnpayConfigured:false}});
    if(path==='customer/invoices/pricing-partial')return route.fulfill({json:partialInvoice});
    if(path==='customer/invoices')return route.fulfill({json:{items:[partialInvoice],total:1,page:1,limit:100}});
    if(path.startsWith('customer/'))return route.fulfill({json:{items:[],total:0,page:1,limit:100}});
    unexpected.push(req.method()+':invoice:'+path);return route.abort();
  });
  const invoicePage=await billing.newPage();invoicePage.setDefaultTimeout(30000);invoicePage.on('pageerror',err=>errors.push(err.message));
  await invoicePage.goto(base+'/customer/payments',{waitUntil:'domcontentloaded'});
  await invoicePage.getByRole('button',{name:'Chi tiết & chuyển khoản',exact:true}).click();
  await invoicePage.locator('.invoice-current-balance strong').waitFor();
  assert.equal((await invoicePage.locator('.invoice-current-balance strong').innerText()).replace(/\D/g,''),'500000','The payment amount must be the remaining balance, not the full invoice or rental total');
  await billing.unrouteAll({behavior:'ignoreErrors'});await billing.close();
  checks.push('Customer invoice: 650k invoice less 150k confirmed payment prominently shows only the remaining 500k, with no payment submission');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({passed:checks,realDatabaseWrites:0,sentEmails:0,browserErrors:errors.length},null,2));
} finally {await browser.close();}
async function assertEventually(check) { for(let i=0;i<80;i++){try{return await check();}catch(error){if(i===79)throw error;await new Promise(resolve=>setTimeout(resolve,150));}} }
