// Real read-only catalog/pricing; inventory availability is a browser fixture. No business writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';

const api = process.env.WDP_API_URL || 'http://127.0.0.1:3001/api';
const base = process.env.WDP_FE_URL || 'http://127.0.0.1:5173';
const proof = await fetch(api+'/_test/read-only').then(r=>r.json());
assert(proof.testOnly && proof.databaseMode==='READ_ONLY');
const [catalog, services] = await Promise.all([fetch(api+'/booking/catalog').then(r=>r.json()),fetch(api+'/additional-services').then(r=>r.json())]);
const product = catalog.products.find(row=>row.id==='sm-b12' && row.monthlyPrice>0) || catalog.products.find(row=>row.monthlyPrice>0);
assert(product);
const chosen = ['ONE_TIME','DAY','MONTH'].map(kind=>services.find(row=>row.billingUnit===kind && row.unitPrice>0 && row.isActive!==false));
assert(chosen.every(Boolean),'Need three existing priced service kinds for this acceptance test. No seed is performed.');
const selections = chosen.map(service=>({serviceId:service.id,quantity:2,...(service.kind==='RENTAL'?{serviceStartDate:'2027-01-31',serviceEndDate:service.billingUnit==='DAY'?'2027-02-05':'2027-03-31'}:{})}));
const browser = await launchTestBrowser(), errors=[],unexpected=[],checks=[];
const artifacts = 'artifacts/ux-notifications-20261029';
await mkdir(artifacts,{recursive:true});
try {
  for (const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:1000}});
    await context.addInitScript(({productId,selections})=>localStorage.setItem('wdp-booking-draft-v1',JSON.stringify({productId,startDate:'2027-01-31',durationMonths:3,periodMode:'duration',quantity:1,services:selections,addonIds:[],paymentPlan:'PAY_MONTHLY'})),{productId:product.id,selections});
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
    await panel.getByRole('heading',{name:'Dự kiến thanh toán lần đầu',exact:true}).waitFor();
    const verify=async plan=>{
      await page.waitForFunction(plan=>document.querySelector('.payment-option.is-selected')?.textContent.includes(plan==='PREPAID'?'Trả trước':'hàng tháng'),plan);
      await page.waitForFunction(()=>!!document.querySelector('.quote-breakdown .quote-initial-payment'));
      await assertEventually(async()=>assert.equal(quote?.paymentPlan,plan));
      assert.equal(quote.lineItems.reduce((sum,row)=>sum+row.amount,0),quote.quotedTotalAmount);
      const first=quote.initialPaymentBreakdown;
      assert.equal(first.rentalAmount+first.depositAmount+first.purchaseAddOnAmount+first.rentalAddOnAmount,quote.estimatedInitialAmountDue);
      assert.equal(first.totalAmount+first.remainingAmount,quote.quotedTotalAmount);
      await assertEventually(async()=>assert.equal(await panel.locator('.quote-breakdown-lines').first().locator(':scope > div').count(),quote.lineItems.length));
      const formatted=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(quote.quotedTotalAmount);
      await assertEventually(async()=>assert.equal((await panel.locator('.quote-breakdown-total strong').first().innerText()).replace(/\s/g,''),formatted.replace(/\s/g,'')));
    };
    await verify('PAY_MONTHLY');
    await page.getByRole('button',{name:/^Trả trước toàn bộ kỳ/}).click();await verify('PREPAID');
    assert.equal(quote.discountPercent,5);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+'px overflow');
    assert(await page.locator('.booking-summary').evaluate(node=>node.scrollHeight<=node.clientHeight+1),'Detailed quote must not hide total/payment inside another scroll area');
    await page.waitForFunction(()=>!!document.querySelector('.availability-badge.is-available'));
    await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
    await page.screenshot({path:artifacts+'/pricing-'+width+'.png',fullPage:true});
    await page.locator('.booking-summary').screenshot({path:artifacts+'/pricing-summary-'+width+'.png'});
    await page.getByRole('button',{name:/^Thanh toán hàng tháng/}).click();await verify('PAY_MONTHLY');
    checks.push(width+'px: mixed one-time/day/month services, calendar-end dates, item sums, first payment, future installments and 5% rent-only offer');
    closing=true;
    await context.unrouteAll({behavior:'ignoreErrors'});
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({passed:checks,realDatabaseWrites:0,sentEmails:0,browserErrors:errors.length},null,2));
} finally {await browser.close();}
async function assertEventually(check) { for(let i=0;i<80;i++){try{return await check();}catch(error){if(i===79)throw error;await new Promise(resolve=>setTimeout(resolve,150));}} }
