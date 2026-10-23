const {setup}=require('./official-server.test.cjs');
const {chromium}=require(process.env.TEST_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const s=await setup(),browser=await chromium.launch({channel:'chrome',headless:true});const root=path.resolve(__dirname,'..');try{
 for(const [width,height] of [[1280,900],[390,844],[320,568],[844,390]]){
  await s.db.exec('delete from wakppu_income.profiles;delete from public.game_saves');
  const state={version:1,catalogVersion:2,lockVersion:1,gold:123,pets:[0,2,4],equipped:[0,1,2],locked:[0],discovered:[0,2,4],stock:[0,0,0,0],selected:0,cracks:0};
  await s.query(s.A,'select public.save_game($1::jsonb,0)',[JSON.stringify(state)]);
  await s.query(s.B,'select public.save_game($1::jsonb,0)',[JSON.stringify({...state,pets:[8,8,8]})]);
  await s.query(s.B,"select public.set_income_profile('중복별칭')");
  let auth=s.A,readFail=false,writeFail=false,saveFail=false,delay=0;
  const ctx=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:true});
  await ctx.route('https://wakppu.test/**',r=>{const file=path.resolve(root,new URL(r.request().url()).pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep))return r.fulfill({status:403});try{return r.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{return r.fulfill({status:404});}});
  await ctx.route('**/server-config.js',r=>r.fulfill({body:'window.WAKPPU_SERVER={url:"https://test.supabase.co",publishableKey:"sb_publishable_test"};',contentType:'text/javascript'}));
  await ctx.exposeBinding('rankServer',async(_,name,payload)=>{
   try{
    if(name==='session')return {data:{session:auth?{user:{id:auth}}:null}};
    if(name==='logout'){auth=null;return {};}
    if(name==='load'){const r=await s.query(auth,'select state,revision from public.game_saves');return {data:r.rows[0]||null};}
    if(name==='income_leaderboard'){if(readFail)throw Error('network');return {data:(await s.query(auth,'select public.income_leaderboard() as value')).rows[0].value};}
    if(name==='set_income_profile'){if(writeFail)throw Error('network');if(delay)await new Promise(r=>setTimeout(r,delay));return {data:(await s.query(auth,'select public.set_income_profile($1) as value',[payload.p_nickname])).rows[0].value};}
    if(name==='save_game'){if(saveFail)throw Error('network');return {data:(await s.query(auth,'select public.save_game($1::jsonb,$2) as rev',[JSON.stringify(payload.p_state),payload.p_revision])).rows[0].rev};}
    throw Error('unknown rpc '+name);
   }catch(e){return {error:{message:e.message}};}
  });
  await ctx.addInitScript(()=>{let callback;window.supabase={createClient:()=>({auth:{getSession:()=>window.rankServer('session'),getUser:async()=>({data:{user:(await window.rankServer('session')).data.session?.user}}),onAuthStateChange:fn=>{callback=fn;},signOut:async()=>{await window.rankServer('logout');callback?.('SIGNED_OUT',null);return {}; }},from:()=>({select:()=>({eq:()=>({maybeSingle:()=>window.rankServer('load')})})}),rpc:(name,payload)=>window.rankServer(name,payload)})};});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto('https://wakppu.test/');await p.waitForFunction(()=>window.wakppuCloud?.rankingReady());
  await p.locator('.world-nav [data-menu="ranking-panel"]').tap();await p.waitForFunction(()=>!document.getElementById('ranking-refresh').disabled);
  assert.equal(await p.locator('#ranking-form').isVisible(),true);assert.equal(await p.locator('#ranking-list li').count(),1);
  await p.locator('#ranking-name').fill('수익정원');await p.locator('#ranking-join').tap();await p.waitForFunction(()=>document.getElementById('ranking-me').textContent.includes('수익정원'));
  assert.match(await p.locator('#ranking-me').textContent(),/2위.*17\.8 G\/s/);assert.equal(await p.locator('[data-me="true"]').count(),1);
  assert.deepEqual(await p.evaluate(()=>state.locked),[0]);assert.deepEqual(await p.evaluate(()=>state.pets),[0,2,4]);
  await p.locator('#ranking-name').fill('중복별칭');await p.locator('#ranking-join').tap();await p.waitForFunction(()=>document.getElementById('ranking-status').textContent.includes('이미 사용'));assert.match(await p.locator('#ranking-me').textContent(),/수익정원/);
  writeFail=true;await p.locator('#ranking-name').fill('실패별칭');await p.locator('#ranking-join').tap();await p.waitForFunction(()=>document.getElementById('ranking-status').textContent.includes('변경 실패'));writeFail=false;
  await p.evaluate(()=>{state.equipped=[2];save();render();});await p.waitForFunction(()=>document.getElementById('cloud-status').textContent==='계정 서버 저장 완료');
  await p.locator('#ranking-refresh').tap();await p.waitForFunction(()=>document.getElementById('ranking-me').textContent.includes('11 G/s'));
  readFail=true;await p.locator('#ranking-refresh').tap();await p.waitForFunction(()=>document.getElementById('ranking-status').textContent.includes('불러오지 못'));readFail=false;await p.locator('#ranking-refresh').tap();await p.waitForFunction(()=>document.getElementById('ranking-status').textContent.includes('방금 갱신'));
  await p.reload();await p.waitForFunction(()=>window.wakppuCloud?.rankingReady());await p.locator('.world-nav [data-menu="ranking-panel"]').tap();await p.waitForFunction(()=>document.getElementById('ranking-me').textContent.includes('수익정원'));assert.deepEqual(await p.evaluate(()=>state.equipped),[2]);
  const dir=process.env.TEST_SCREENSHOT_DIR||'preview/deployed';fs.mkdirSync(dir,{recursive:true});await p.locator('#ranking-refresh').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(dir,`ranking-${width}x${height}.png`)});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok((await p.locator('#ranking-refresh').boundingBox()).height>=44);
  await p.locator('#ranking-leave').tap();await p.waitForFunction(()=>document.getElementById('ranking-leave').hidden);assert.equal((await s.db.query('select * from wakppu_income.profiles where user_id=$1',[s.A])).rows.length,0);assert.deepEqual(await p.evaluate(()=>state.locked),[0]);
  saveFail=true;await p.evaluate(()=>{state.gold+=10;save();});await p.locator('#ranking-name').fill('저장실패');await p.locator('#ranking-join').tap();await p.waitForFunction(()=>document.getElementById('ranking-status').textContent.includes('변경 실패'));assert.equal((await s.db.query('select * from wakppu_income.profiles where user_id=$1',[s.A])).rows.length,0);saveFail=false;
  if(width===1280){
   // 서버 리비전 충돌은 연속 부화도 중지하며 미전송 기록을 브라우저에 보관합니다.
   await p.evaluate(()=>document.getElementById('account-save').click());await p.waitForFunction(()=>document.getElementById('cloud-status').textContent==='계정 서버 저장 완료');
   const serverBefore=(await s.db.query('select state from public.game_saves where user_id=$1',[s.A])).rows[0].state;
   await s.db.query('update public.game_saves set revision=revision+1 where user_id=$1',[s.A]);
   await p.locator('.world-nav [data-menu="hatch-panel"]').tap();await p.locator('.auto-hatch summary').tap();await p.locator('#auto-count').selectOption('100');await p.locator('#auto-rarity').selectOption('5');await p.locator('#auto-start').tap();
   await p.waitForFunction(()=>gamePaused&&document.getElementById('cloud-status').textContent.includes('다른 브라우저'));
   assert.equal(await p.evaluate(()=>autoHatch),null);assert.equal(await p.evaluate(()=>!!localStorage.getItem('wakppu-v01:account-pending:11111111-1111-4111-8111-111111111111')),true);
   const serverAfter=(await s.db.query('select state from public.game_saves where user_id=$1',[s.A])).rows[0].state;assert.deepEqual(serverAfter,serverBefore);
   await p.locator('#account-reload').tap();await p.waitForFunction(()=>!gamePaused);assert.equal(await p.evaluate(()=>autoHatch),null);await p.locator('#account-close').tap();
  }
  await p.evaluate(()=>closeMenu());await p.locator('#account-toggle').tap();await p.locator('#account-logout').tap();await p.waitForFunction(()=>!window.wakppuCloud.rankingReady()&&!gamePaused);await p.locator('#account-close').tap();await p.locator('.world-nav [data-menu="ranking-panel"]').tap();await p.waitForFunction(()=>!document.getElementById('ranking-refresh').disabled);assert.equal(await p.locator('#ranking-form').isVisible(),false);assert.equal(await p.locator('#ranking-guest').isVisible(),true);assert.equal(await p.locator('[data-me="true"]').count(),0);
  assert.deepEqual(errors,[]);await ctx.close();console.log(`PASS: ${width}×${height} 브라우저+PostgreSQL 랭킹 조회·참여·중복/통신/저장 실패·수익 갱신·복원·참여 취소·로그아웃·데이터 보존`);
 }
}finally{await browser.close();await s.db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
