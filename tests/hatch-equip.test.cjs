const {chromium}=require(process.env.TEST_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const [width,height] of [[1280,900],[390,844],[320,568],[844,390]]){
 const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<1000});
 await ctx.route('**/account.js',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.TEST_GAME_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href);
 async function seed(pets=[],equipped=[],locked=[]){
  await p.evaluate(value=>{window.removeEventListener('pagehide',save);save=()=>{};localStorage.setItem('wakppu-v01',JSON.stringify(value));},{version:1,gold:100,pets,equipped,locked,discovered:[...new Set(pets)],stock:[0,0,0,0],selected:0,cracks:0});
  await p.reload();await p.evaluate(()=>{rollPet=()=>0;});
  await p.locator('.world-nav [data-menu="hatch-panel"]').tap();
 }
 async function hatch(){
  await p.evaluate(()=>{state.cracks=BALLS[state.selected].clicks-1;renderBall();});
  await p.locator('#ball').tap();
  assert.equal(await p.locator('#hatch-actions').isVisible(),false,'부화 중 장착 숨김');
  await p.waitForFunction(()=>!hatching);
  await p.locator('#hatch-equip').waitFor({state:'visible'});
 }
 const equipped=()=>p.evaluate(()=>[...state.equipped]);
 await seed();assert.equal(await p.locator('#hatch-actions').isVisible(),false);
 await hatch();assert.equal(await p.evaluate(()=>state.pets.length),1);
 assert.match(await p.locator('#hatch-equip-note').textContent(),/남은 슬롯 3개/);
 await p.locator('#hatch-equip').tap();assert.deepEqual(await equipped(),[0]);
 assert.equal(await p.locator('#hatch-equip').isDisabled(),true);
 assert.equal(await p.locator('#hatch-equip').textContent(),'장착 완료');
 assert.equal(await p.locator('#hatch-panel').isVisible(),true,'인벤토리를 열지 않고 장착');
 assert.equal(await p.locator('.world-pet').count(),1);
 await p.waitForFunction(()=>state.gold>100);
 await p.locator('#hatch-equip').evaluate(el=>{el.disabled=false;el.click();el.click();});
 assert.deepEqual(await equipped(),[0],'연속 입력으로 장착 해제되지 않음');
 await p.reload();assert.deepEqual(await equipped(),[0]);
 await p.locator('.world-nav [data-menu="hatch-panel"]').tap();
 assert.equal(await p.locator('#hatch-actions').isVisible(),false,'새로고침에 오래된 결과 폐기');
 // 마지막 장착 펫과 교체하며, 중복 종류도 새 인벤토리 번호로 장착합니다.
 await seed([0,2,8],[2,0,1],[0,1,2]);await hatch();
 assert.match(await p.locator('#hatch-equip-note').textContent(),/물방뿌.*교체/);
 await p.locator('#hatch-equip').tap();assert.deepEqual(await equipped(),[2,0,3]);
 assert.deepEqual(await p.evaluate(()=>state.pets),[0,2,8,0]);
 assert.deepEqual(await p.evaluate(()=>state.locked),[0,1,2],'교체된 잠금 펫도 보유 및 잠금 유지');
 // 마지막 장착 대상이 바뀌면 교체 예고도 갱신됩니다.
 await seed([0,2,8],[0,1,2],[2]);await hatch();
 assert.match(await p.locator('#hatch-equip-note').textContent(),/태양뿌/);
 await p.locator('.world-nav [data-menu="inventory-panel"]').tap();
 await p.locator('[data-equip="2"]').tap();await p.locator('[data-equip="2"]').tap();
 await p.locator('[data-equip="1"]').tap();await p.locator('[data-equip="1"]').tap();
 await p.locator('[data-lock="3"]').tap();
 await p.locator('.world-nav [data-menu="hatch-panel"]').tap();
 assert.match(await p.locator('#hatch-equip-note').textContent(),/물방뿌.*교체/);
 await p.locator('#hatch-equip').tap();assert.deepEqual(await equipped(),[0,2,3]);
 assert.deepEqual(await p.evaluate(()=>state.locked),[2,3],'새 펫을 잠근 뒤 바로 장착해도 유지');
 await p.locator('#hatch-equip').scrollIntoViewIfNeeded();
 const box=await p.locator('#hatch-equip').boundingBox();assert.ok(box.height>=44);
 assert.equal(await p.locator('#hatch-equip').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit||el.contains(hit);}),true);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 fs.mkdirSync(process.env.TEST_SCREENSHOT_DIR||'preview/deployed',{recursive:true});
 await p.screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR||'preview/deployed','quick-equip-'+width+'x'+height+'.png')});
 // 앞 펫의 방생으로 번호가 바뀌어도 방금 부화한 펫을 정확히 장착합니다.
 await seed([0,2],[],[]);await hatch();
 await p.locator('.world-nav [data-menu="inventory-panel"]').tap();
 p.once('dialog',d=>d.accept());await p.locator('[data-release="0"]').tap();
 await p.locator('.world-nav [data-menu="hatch-panel"]').tap();await p.locator('#hatch-equip').tap();
 assert.deepEqual(await equipped(),[1]);assert.deepEqual(await p.evaluate(()=>state.pets),[2,0]);
 // 부화한 대상 자체를 방생하면 다른 동일 종류를 가리키지 않습니다.
 await seed([0],[],[]);await hatch();
 await p.locator('.world-nav [data-menu="inventory-panel"]').tap();
 p.once('dialog',d=>d.accept());await p.locator('[data-release="1"]').tap();
 await p.locator('.world-nav [data-menu="hatch-panel"]').tap();assert.equal(await p.locator('#hatch-actions').isVisible(),false);
 assert.deepEqual(await equipped(),[]);
 // 다음 볼 입력, 계정 교체, 초기화 시 이전 결과를 폐기합니다.
 await seed();await hatch();await p.locator('#ball').tap();assert.equal(await p.locator('#hatch-actions').isVisible(),false);
 await hatch();await p.evaluate(()=>{gamePaused=true;document.getElementById('hatch-equip').click();gamePaused=false;});assert.deepEqual(await equipped(),[],'계정 전환 중 입력 차단');
 await p.evaluate(()=>wakppuGame.useSave({...defaults(),pets:[0]},'other-test-account'));
 assert.equal(await p.locator('#hatch-actions').isVisible(),false);assert.deepEqual(await equipped(),[]);
 await seed();await hatch();p.once('dialog',d=>d.accept());await p.locator('#reset').tap();assert.equal(await p.locator('#hatch-actions').isVisible(),false);
 if(width===1280){
  await seed([2],[],[]);
  await p.evaluate(()=>{hatch();releasePets([0]);save();render();});
  await p.waitForFunction(()=>!hatching);
  await p.locator('#hatch-equip').tap();assert.deepEqual(await equipped(),[0],'부화 애니메이션 중 방생 번호 변경');
  await seed([2],[],[]);
  await p.evaluate(()=>{hatch();releasePets([1]);save();render();});
  await p.waitForFunction(()=>!hatching);
  assert.equal(await p.locator('#hatch-actions').isVisible(),false,'애니메이션 중 부화 펫 방생');
  await seed();
  await p.evaluate(()=>{hatch();wakppuGame.useSave({...defaults(),pets:[8]},'new-account');});
  await p.waitForTimeout(750);
  assert.deepEqual(await p.evaluate(()=>state.pets),[8],'취소한 부화 타이머가 새 계정 기록에 영향 없음');
  assert.equal(await p.locator('#hatch-actions').isVisible(),false);
 }
 assert.deepEqual(errors,[]);console.log('PASS: '+width+'×'+height+' 바로 장착·교체 예고·잠금·연속 입력·수익·저장·방생 번호·계정 전환·초기화');
 await ctx.close();
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
