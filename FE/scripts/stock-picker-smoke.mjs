import { selectChoice } from './select-choice.mjs';
// Every business request is intercepted. All contracts/items/writes below live only in browser-test memory.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchTestBrowser } from './browser-test.mjs';
import { customer, fixture } from './fixtures/workspace.mjs';

const contracts=[
  {...fixture.contracts[0],id:'warehouse-a',contractCode:'WDP-SIMILAR-C01',storageType:{name:'Kho nhỏ B12',condition:'STANDARD'},storageUnit:{unitCode:'SM-B12-001',floor:'Ground',zone:'B12'},startDate:'2026-10-01',endDate:'2027-01-01'},
  {...fixture.contracts[0],id:'warehouse-b',contractCode:'WDP-SIMILAR-C02',storageType:{name:'Kho vừa D04',condition:'STANDARD'},storageUnit:{unitCode:'MD-D04-002',floor:'Tầng 1',zone:'D04'},startDate:'2026-10-01',endDate:'2027-01-01'},
  {...fixture.contracts[0],id:'old-contract',status:'COMPLETED',storageUnit:{unitCode:'OLD-999'}},
];
const browser=await launchTestBrowser(),errors=[],writes=[],unexpected=[],checks=[];
await mkdir('artifacts/run-20261030',{recursive:true});
async function setup(width,mobile=false,preset='') {
  const context=await browser.newContext({viewport:{width,height:1000}}),reads=[];
  await context.addInitScript(mobile=>localStorage.setItem(mobile?'wdp-mobile-auth-token':'wdp-auth-token-v1','stock-picker-test'),mobile);
  await context.route(/\/api\//,async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.replace(/^\/api\//,'');
    const send=json=>route.fulfill({json});
    if(req.method()==='OPTIONS')return route.fulfill({status:204});
    if(req.method()==='POST' && path==='customer/stock-movements') {writes.push({mobile,body:req.postDataJSON(),key:req.headers()['idempotency-key']});return route.fulfill({status:201,json:{id:'test-only-movement'}});}
    if(req.method()!=='GET'){unexpected.push(req.method()+':'+path);return route.abort();}
    reads.push(url.pathname+url.search);
    if(path==='auth/me')return send({...customer,role:'CUSTOMER'});
    if(path==='reservations')return send([]);
    if(path==='customer/contracts')return send({items:contracts,total:contracts.length,page:1,limit:100});
    if(path==='customer/stored-items') {
      const id=url.searchParams.get('rentalContractId');
      assert(!id || ['warehouse-a','warehouse-b'].includes(id),'Never fetch stock for an unowned/invalid query ID');
      return send(id?[{id:id==='warehouse-a'?'item-a':'item-b',name:id==='warehouse-a'?'Thùng kho A':'Thùng kho B',itemCode:id==='warehouse-a'?'ITEM-A':'ITEM-B',unit:'thùng',balance:2}]:[]);
    }
    if(path.startsWith('customer/'))return send({items:[],total:0,page:1,limit:100});
    unexpected.push(req.method()+':'+path);return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(mobile?60000:30000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${mobile?8081:5173}/customer/stock-movements${preset?'?rentalContractId='+preset:''}`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.getByRole('button',{name:'Tạo phiếu nhập / xuất',exact:true}).click();
  await page.getByRole('radio',{name:/SM-B12-001/}).waitFor();
  return {page,context,reads};
}
try {
  for(const [width,mobile] of [[1440,false],[390,false],[390,true]]) {
    const app=await setup(width,mobile),{page}=app;
    assert.equal(await page.getByRole('radio').count(),2,'Only active contracts may be selected');
    assert.equal(await page.getByText('OLD-999',{exact:true}).count(),0);
    await page.getByLabel('Tìm kho đang thuê',{exact:true}).fill('kho vua');
    assert.equal(await page.getByRole('radio').count(),1,'Accent-insensitive name search must find the warehouse');
    await page.getByLabel('Tìm kho đang thuê',{exact:true}).fill('');
    await page.getByRole('radio',{name:/SM-B12-001/}).click();
    const itemName=page.getByLabel(mobile?'Tên hàng 1':'Tên hàng',{exact:true});await itemName.fill('Hàng đang nhập kho A');
    await page.getByRole('radio',{name:/MD-D04-002/}).click();assert.equal(await itemName.inputValue(),'','Changing warehouse clears old goods');
    await page.getByText(/Phiếu sẽ gửi cho/).filter({hasText:'MD-D04-002'}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px warehouse choice overflow`);
    await page.screenshot({path:`artifacts/run-20261030/stock-picker-${mobile?'mobile':width}.png`,fullPage:true});
    if(mobile) {
      await page.getByRole('button',{name:'Xuất hàng',exact:true}).first().click();
      await page.getByRole('button',{name:/Thùng kho B · ITEM-B/}).click();
      assert.equal(await page.getByRole('button',{name:/Thùng kho A · ITEM-A/}).count(),0);
      await page.getByRole('button',{name:/Tôi đã đối chiếu hàng hóa và số lượng yêu cầu/}).click();
    } else {
      await selectChoice(page.getByLabel('Loại phiếu',{exact:true}), 'OUT');
      const goods=page.getByLabel('Mặt hàng 1',{exact:true});await selectChoice(goods, 'item-b');
      assert.equal(await goods.locator('..').locator('option[value="item-a"]').count(),0);
      await page.getByLabel('Tôi đã đối chiếu hàng hóa và số lượng yêu cầu',{exact:true}).check();
    }
    await page.getByRole('button',{name:'Gửi phiếu',exact:true}).click();
    await page.getByText(/Yêu cầu của bạn đã được gửi/).first().waitFor();
    const written=writes.at(-1);assert.equal(written.body.type,'OUT');assert.equal(written.body.rentalContractId,'warehouse-b');assert.equal(written.body.lines[0].storedItemId,'item-b');assert(written.key);
    assert(app.reads.some(path=>path.includes('rentalContractId=warehouse-b')));
    await app.context.unrouteAll({behavior:'ignoreErrors'});await app.context.close();
    checks.push(`${mobile?'Expo web':width+'px web'}: identifiable warehouse cards, search, active-only options, cleared drafts and stock/submission bound to the selected warehouse`);
  }
  for(const mobile of [false,true]) {
    const valid=await setup(390,mobile,'warehouse-b');
    await valid.page.getByRole('radio',{name:/MD-D04-002/,checked:true}).waitFor();
    assert.equal(await valid.page.getByRole('radio',{name:/MD-D04-002/}).getAttribute('aria-checked') ?? String(await valid.page.getByRole('radio',{name:/MD-D04-002/}).isChecked()),'true',`Deep-link prefill failed: mobile=${mobile}, url=${valid.page.url()}`);await valid.context.close();
    const invalid=await setup(390,mobile,'not-my-contract');assert.equal(await invalid.page.getByRole('radio',{checked:true}).count(),0);assert(!invalid.reads.some(path=>path.includes('rentalContractId=not-my-contract')&&path.includes('stored-items')));await invalid.context.close();
  }
  checks.push('Web/mobile deep links resolve only against active contracts owned by the signed-in customer');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({checks,mockedSubmissions:writes.length,browserErrors:errors.length,realDatabaseWrites:0},null,2));
} finally {await browser.close();}
