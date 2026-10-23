const {chromium}=require(process.env.TEST_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [width,height] of [[1280,900],[390,844],[320,568],[844,390]]){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:true});
  await ctx.route('**/account.js*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await ctx.addInitScript(()=>{const original=setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===650?65:ms===900?90:ms,...args);});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.TEST_GAME_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href);await p.waitForLoadState('networkidle');
  async function seed(extra={}) {await p.evaluate(value=>{window.wakppuGame.useSave({...window.wakppuGame.freshSave(),gold:100,pets:[0],equipped:[0],locked:[0],...value});rollPet=()=>0;},extra);await p.locator('.world-nav [data-menu="hatch-panel"]').tap();if(!await p.locator('.auto-hatch').evaluate(el=>el.open))await p.locator('.auto-hatch summary').tap();}
  // 저장을 바꾸기 전에 열린 메뉴를 닫습니다.
  async function ready(extra={}){await p.evaluate(()=>closeMenu());await seed(extra);}
  const run=async(count='10',rarity='5')=>{await p.locator('#auto-count').selectOption(count);await p.locator('#auto-rarity').selectOption(rarity);await p.locator('#auto-start').tap();};
  await ready();await run();await p.waitForFunction(()=>!autoHatch&&!hatching);
  assert.equal(await p.evaluate(()=>state.pets.length),11);assert.deepEqual(await p.evaluate(()=>state.locked),[0]);assert.deepEqual(await p.evaluate(()=>state.equipped),[0]);
  assert.match(await p.locator('#auto-status').textContent(),/지정 횟수 완료/);assert.equal(await p.locator('#hatch-equip').isVisible(),true);
  await p.reload();assert.equal(await p.evaluate(()=>autoHatch),null);assert.equal(await p.evaluate(()=>state.pets.length),11);
  await ready({stock:[0,2,0,0],selected:1});await run();await p.waitForFunction(()=>!autoHatch&&!hatching);assert.equal(await p.evaluate(()=>state.pets.length),3);assert.equal(await p.evaluate(()=>state.stock[1]),0);assert.equal(await p.evaluate(()=>state.gold<101),true);assert.match(await p.locator('#auto-status').textContent(),/볼 소진/);
  await ready();await p.evaluate(()=>rollPet=()=>4);await run('10','2');await p.waitForFunction(()=>!autoHatch&&!hatching);assert.equal(await p.evaluate(()=>state.pets.length),2);assert.match(await p.locator('#auto-status').textContent(),/초희귀 획득/);
  await ready();await run('100');await p.locator('#auto-stop').tap();await p.waitForFunction(()=>!hatching);const stopped=await p.evaluate(()=>state.pets.length);await p.waitForTimeout(350);assert.equal(await p.evaluate(()=>state.pets.length),stopped);assert.equal(await p.evaluate(()=>autoHatch),null);
  await ready();await run('100');await p.evaluate(()=>{window.wakppuGame.pause(true);window.wakppuGame.pause(false);});await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>autoHatch),null);
  await ready();await run('100');await p.evaluate(()=>window.wakppuGame.useSave({...window.wakppuGame.freshSave(),gold:77},'other'));await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>state.pets.length),0);assert.equal(await p.evaluate(()=>state.gold),77);assert.equal(await p.evaluate(()=>autoHatch),null);
  await ready();await run('100');await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>autoHatch),null);await p.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}));
  await ready();await run('100');p.once('dialog',d=>d.accept());await p.evaluate(()=>document.getElementById('reset').click());await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>state.pets.length),0);assert.equal(await p.evaluate(()=>autoHatch),null);
  await ready();await p.evaluate(()=>{state.pets=Array(10000).fill(0);renderAutoHatch();});assert.equal(await p.locator('#auto-start').isDisabled(),true);await p.evaluate(()=>{autoHatch={tier:0,count:10,done:0,stopRarity:5};autoStep();});assert.equal(await p.evaluate(()=>state.pets.length),10000);assert.match(await p.locator('#auto-status').textContent(),/한도 도달/);
  await ready();await p.locator('#auto-count').scrollIntoViewIfNeeded();
  for(const id of ['auto-start','auto-stop','auto-count','auto-rarity'])assert.ok((await p.locator('#'+id).boundingBox()).height>=44);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const dir=process.env.TEST_SCREENSHOT_DIR||'preview/deployed';fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,`auto-${width}x${height}.png`)});
  assert.deepEqual(errors,[]);await ctx.close();console.log(`PASS: ${width}×${height} 연속 부화·횟수·희귀도·소진·중지·잠금/장착/저장 보존·계정/초기화/화면 이탈·터치 크기`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
