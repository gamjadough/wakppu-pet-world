// 예전 주소로 접속해도 기존 브라우저 기록과 일반 정원 조작을 유지합니다.
const {chromium}=require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext();
  const requests=[],errors=[];
  await context.route('https://wakppu.test/**',route=>{
   const pathname=new URL(route.request().url()).pathname;
   const file=path.join(__dirname,'..',pathname.endsWith('/')?'index.html':path.basename(pathname));
   if(pathname.endsWith('server-config.js'))return route.fulfill({contentType:'application/javascript',body:'window.WAKPPU_SERVER={};'});
   try{return route.fulfill({path:file});}catch{return route.fulfill({status:404});}
  });
  await context.addInitScript(()=>{
   if(!localStorage.getItem('wakppu-v01'))localStorage.setItem('wakppu-v01',JSON.stringify({version:1,catalogVersion:2,gold:123,pets:[10,14],equipped:[],discovered:[10,14],stock:[0,0,0,0],selected:0,cracks:0}));
  });
  const page=await context.newPage();
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://wakppu.test/wakppu-pet-world/official.html');
  await page.waitForURL('https://wakppu.test/wakppu-pet-world/');
  await page.waitForFunction(()=>!gamePaused);
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wakppu-v01')));
  assert.deepEqual((await saved()).pets,[10,14]);assert.equal((await saved()).gold,123);
  await page.locator('#account-toggle').click();
  assert.equal(await page.locator('#account-panel a[href*="official"]').count(),0);
  assert.equal(await page.locator('#account-login').isVisible(),true);
  await page.locator('#account-close').click();
  await page.locator('.world-nav [data-menu="hatch-panel"]').click();
  await page.locator('#ball').click();assert.equal((await saved()).cracks,1);
  await page.reload();await page.waitForFunction(()=>!gamePaused);
  assert.deepEqual((await saved()).pets,[10,14]);assert.equal((await saved()).cracks,1);
  assert.equal(requests.some(u=>/official\.(js|css)|\/rpc\/official_/.test(u)),false);
  assert.deepEqual(errors,[]);
  await page.locator('#account-toggle').click();
  await page.screenshot({path:path.join(__dirname,'../preview/official-removed.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.reload();await page.waitForFunction(()=>!gamePaused);
  await page.locator('#account-toggle').click();
  assert.equal(await page.locator('#account-login').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(__dirname,'../preview/official-removed-mobile.png'),fullPage:true});
  console.log('PASS: 예전 주소 이동, 공식 링크·스크립트·RPC 제거, 기존 15종 저장 보존, 계정 메뉴·볼 클릭·새로고침 복원');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
