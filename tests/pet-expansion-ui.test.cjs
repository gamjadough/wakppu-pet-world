const {chromium}=require(process.env.TEST_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const ctx=await browser.newContext({viewport:{width:2560,height:1600}}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await ctx.addInitScript(()=>{
  if(!localStorage.getItem('wakppu-v01')) localStorage.setItem('wakppu-v01',JSON.stringify({version:1,gold:123,pets:[10,11,12,13,14],equipped:[0,1,4],discovered:Array.from({length:15},(_,i)=>i),stock:[0,2,0,0],selected:0,cracks:0,peaceUntil:{0:Date.now()+10000,1:Date.now()+10000,4:Date.now()+10000}}));
 });
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForFunction(()=>!gamePaused);
  assert.equal(await page.evaluate(()=>PETS.length),15);
  assert.ok(Math.abs(await page.evaluate(()=>income())-82.06)<1e-9);
  assert.equal(await page.evaluate(()=>clickPower()),7);
  assert.match(await page.locator('#garden-goal').textContent(),/15\/15/);
  assert.equal(await page.locator('.world-pet.species-10').count(),1);
  assert.equal(await page.locator('.world-pet.species-14').count(),1);
  await page.screenshot({path:path.resolve(__dirname,'../preview/new-pets-world.png')});
  await page.locator('.world-nav [data-menu="inventory-panel"]').click();
  for(const name of ['버섯뿌','이슬뿌','서리뿌','오로라뿌','은하뿌']) assert.equal(await page.getByRole('heading',{name,exact:true}).isVisible(),true);
  await page.screenshot({path:path.resolve(__dirname,'../preview/new-pets-inventory.png')});
  const rolled=await page.evaluate(()=>{
   const original=Math.random;
   try{return BALLS[3].odds.map((weight,rarity)=>{
    const start=BALLS[3].odds.slice(0,rarity).reduce((a,b)=>a+b,0),sequence=[(start+weight/2)/100,.999];
    Math.random=()=>sequence.shift()??.5;return rollPet(3);
   });}finally{Math.random=original;}
  });
  assert.deepEqual(rolled,[10,11,12,13,14],'각 등급에서 신규 친구 선택 가능');
  await page.reload();await page.waitForFunction(()=>!gamePaused);
  assert.deepEqual(await page.evaluate(()=>state.pets),[10,11,12,13,14]);
  assert.deepEqual(await page.evaluate(()=>state.equipped),[0,1,4]);
  await page.setViewportSize({width:390,height:844});
  await page.locator('.world-nav [data-menu="codex-panel"]').click();
  assert.equal(await page.locator('#codex .pet-card').count(),15);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: 일반 정원 신규 5종 외형·이름·능력·성격·부화풀, 15종 도감, 저장/장착 복원, 모바일 넘침·JS 오류 없음');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
