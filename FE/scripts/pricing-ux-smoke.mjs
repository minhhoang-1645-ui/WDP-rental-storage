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
  for (const {width,product,selections:caseSelections,kind} of [1440,900,390].flatMap(width=>[{width,product:serviceProduct,selections,kind:'services'},{width,product:serviceProduct,selections:[],kind:'deposit'},{width,product:lockerProduct,selections:[],kind:'locker'}])) {
    const context=await browser.newContext({viewport:{width,height:1000}});
    await context.addInitScript(({productId,selections,quantity})=>localStorage.setItem('wdp-booking-draft-v1',JSON.stringify({productId,startDate:'2027-01-31',durationMonths:3,periodMode:'duration',quantity,services:selections,addonIds:[],paymentPlan:'PAY_MONTHLY'})),{productId:product.id,selections:caseSelections,quantity:kind==='deposit'?1:2});
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
    if(width===390) await page.getByRole('button',{name:'Chuyển sang giao diện tối'}).click();
    await page.getByRole('button',{name:'Chọn thời gian',exact:true}).click();
    const panel=page.locator('.quote-breakdown').first();
    await panel.getByRole('heading',{name:'Thanh toán lần đầu',exact:true}).waitFor();
    const verify=async plan=>{
      await page.waitForFunction(plan=>document.querySelector('.payment-option[aria-pressed="true"]')?.textContent.includes(plan==='PREPAID'?'Trả trước':'hàng tháng'),plan);
      await assertEventually(async()=>assert.equal(quote?.paymentPlan,plan));
      const first=quote.initialPaymentBreakdown;
      assert.equal(quote.lineItems.reduce((sum,row)=>sum+row.amount,0),quote.quotedTotalAmount);
      assert.equal(first.rentalAmount+first.depositAmount+first.purchaseAddOnAmount+first.rentalAddOnAmount,quote.estimatedInitialAmountDue);
      assert.equal(first.totalAmount+first.remainingAmount,quote.quotedTotalAmount);
      await panel.locator('.quote-first-amount').waitFor();
      assert.equal((await panel.locator('.quote-first-amount').innerText()).replace(/\D/g,''),String(quote.estimatedInitialAmountDue));
      const amountFor=label=>panel.locator(':scope > dl > div').filter({has:page.locator('dt').filter({hasText:label})}).locator('dd');
      assert.equal((await amountFor('Tổng dự kiến cả kỳ').innerText()).replace(/\D/g,''),String(quote.quotedTotalAmount));
      assert.equal((await amountFor('Tiền cọc trong lần đầu').innerText()).replace(/\D/g,''),String(first.depositAmount));
      if (first.remainingAmount > 0) assert.equal((await amountFor('Các kỳ tiếp theo').innerText()).replace(/\D/g,''),String(first.remainingAmount));
      else assert.equal(await panel.getByText('Các kỳ tiếp theo',{exact:true}).count(),0);
      const details=panel.locator('.quote-cost-details');
      assert.equal(await details.getAttribute('open'),null);
      await details.locator('summary').focus();
      await details.locator('summary').press('Enter');
      assert.equal(await details.getByRole('region',{name:'Chi phí cả kỳ'}).locator('dl > div').count(),quote.lineItems.length);
      await details.locator('summary').press('Enter');
      assert.equal(await details.getAttribute('open'),null);
    };
    await verify('PAY_MONTHLY');
    if(kind==='locker') {
      assert.equal(quote.quantity,2);
      assert.equal(quote.estimatedInitialAmountDue,1300000);
      assert.equal(quote.initialPaymentBreakdown.remainingAmount,2600000);
      assert.equal(quote.quotedTotalAmount,3900000);
      assert.equal(quote.depositAmount,0);
      await panel.getByText(/2 kỳ ×/).waitFor();
    }
    if(kind==='deposit') assert(quote.depositAmount>0);
    if(kind==='services') {
      assert.equal(quote.quantity,2);
      assert.equal(quote.services.length,3);
      for(const [billingUnit,factor] of [['ONE_TIME',1],['DAY',5],['MONTH',2]]) {
        const service=quote.services.find(row=>row.billingUnit===billingUnit);
        assert.equal(service.amount,service.unitPrice*2*factor);
      }
      await page.getByRole('list',{name:'Dịch vụ đã chọn'}).locator('li').last().waitFor();
      assert.equal(await page.getByRole('list',{name:'Dịch vụ đã chọn'}).locator('li').count(),3);
    }
    await page.locator('.booking-availability.is-success').waitFor();
    await page.locator('.booking-summary').screenshot({path:artifacts+'/pricing-'+kind+'-monthly-'+width+'.png'});

    await page.getByRole('button',{name:/^Trả trước cả kỳ/}).click();await verify('PREPAID');
    assert.equal(quote.discountPercent,quote.prepaidDiscountPercent);
    assert.equal(quote.rentalAmount,quote.baseRentalAmount-quote.discountAmount);
    assert.equal(quote.initialPaymentBreakdown.remainingAmount,0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+'px overflow');
    assert(await page.locator('.booking-summary').evaluate(node=>node.scrollHeight<=node.clientHeight+1),'Detailed quote must not hide total/payment inside another scroll area');
    await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
    await page.screenshot({path:artifacts+'/pricing-'+kind+'-'+width+'.png',fullPage:true});
    await page.locator('.booking-summary').screenshot({path:artifacts+'/pricing-summary-'+kind+'-'+width+'.png'});
    await page.getByRole('button',{name:/^Trả hàng tháng/}).click();await verify('PAY_MONTHLY');
    if(kind==='services' && width===1440) {
      const selected=page.getByRole('list',{name:'Dịch vụ đã chọn'});
      const remove=selected.locator('li').first().getByRole('button');
      const purchaseName=(await remove.getAttribute('aria-label')).slice('Bỏ '.length);
      await remove.click();
      await assertEventually(async()=>assert.equal(quote.services.length,2));
      await page.getByRole('button',{name:'Mua một lần',exact:true}).click();
      await page.getByRole('checkbox',{name:purchaseName,exact:true}).check();
      await page.getByRole('spinbutton',{name:'Số lượng '+purchaseName,exact:true}).fill('3');
      await assertEventually(async()=>{
        const service=quote.services.find(row=>row.billingUnit==='ONE_TIME');
        assert.equal(service.quantity,3);
        assert.equal(service.amount,3*service.unitPrice);
      });
    }
    checks.push(width+'px '+kind+': '+(kind==='locker' ? '1.3m upfront for two lockers, 3.9m full term, two 1.3m later payments and rent-only prepaid offer' : kind==='deposit' ? 'monthly rent and deposit have distinct purposes, itemized first payment, later payments and full-term total including deposit' : 'one-time/day/month services, calendar-end dates, item sums, first payment and variable later installments'));
    closing=true;
    await context.unrouteAll({behavior:'ignoreErrors'});
    await context.close();
  }
  if (process.env.WDP_WEB_ONLY !== '1') {
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
    if(req.method()==='POST' && path==='booking/unit-map')return route.fulfill({json:{productId:lockerProduct.id,startDate:'2027-01-31',endDateExclusive:'2027-04-30',units:[]}});
    unexpected.push(req.method()+':mobile:'+path);return route.abort();
  });
  const mobilePage=await mobile.newPage();mobilePage.setDefaultTimeout(60000);mobilePage.on('pageerror',err=>errors.push(err.message));
  mobilePage.on('console',message=>{if(message.type()==='error' && /React does not recognize|Invalid DOM property/.test(message.text()))errors.push(message.text());});
  await mobilePage.goto('http://127.0.0.1:8081/customer/booking?product='+encodeURIComponent(lockerProduct.id),{waitUntil:'domcontentloaded',timeout:90000});
  await mobilePage.getByLabel('Ngày bắt đầu',{exact:true}).fill('2027-01-31');
  await mobilePage.getByRole('button',{name:'Tiếp tục',exact:true}).click();
  await mobilePage.getByRole('button',{name:'Xem báo giá',exact:true}).click();
  const upfront=mobilePage.getByLabel('Số tiền thanh toán lần đầu dự kiến',{exact:true});await upfront.waitFor();
  assert.equal((await upfront.innerText()).replace(/\D/g,''),'650000');
  await mobilePage.getByText(/2 kỳ còn lại ×/).waitFor();
  assert(await mobilePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile quote overflows');
  await mobilePage.screenshot({path:artifacts+'/pricing-locker-mobile.png',fullPage:true});
  await mobile.unrouteAll({behavior:'ignoreErrors'});await mobile.close();
  checks.push('Expo web 390px: customer booking shows 650k first payment and two remaining installments without submitting a reservation');
  }
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
  await invoicePage.getByRole('button',{name:'Xem chi tiết',exact:true}).click();
  await invoicePage.locator('.customer-invoice-amount strong').waitFor();
  assert.equal((await invoicePage.locator('.customer-invoice-amount strong').innerText()).replace(/\D/g,''),'500000','The payment amount must be the remaining balance, not the full invoice or rental total');
  await billing.unrouteAll({behavior:'ignoreErrors'});await billing.close();
  checks.push('Customer invoice: 650k invoice less 150k confirmed payment prominently shows only the remaining 500k, with no payment submission');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({passed:checks,realDatabaseWrites:0,sentEmails:0,browserErrors:errors.length},null,2));
} finally {await browser.close();}
async function assertEventually(check) { for(let i=0;i<80;i++){try{return await check();}catch(error){if(i===79)throw error;await new Promise(resolve=>setTimeout(resolve,150));}} }
