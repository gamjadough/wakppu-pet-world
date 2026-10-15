// 전송만 대체하고 실제 PostgreSQL 함수에 연결한 Chrome 통합 검사입니다.
const {chromium}=require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const {setup}=require('./official-server.test.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
(async()=>{
  const server=await setup();
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const errors=[];let dropNext=false, offline=false;
  async function context(user,width=1280) {
    const ctx=await browser.newContext({viewport:{width,height:900}});
    await ctx.route('https://official.test/**',route=>{
      const file=path.resolve(base,'.'+new URL(route.request().url()).pathname);
      if(!file.startsWith(base+path.sep)) return route.fulfill({status:403});
      try{return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{return route.fulfill({status:404});}
    });
    await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
    await ctx.exposeBinding('officialRPC',async(_,name,params)=>{
      if(offline) return {error:{message:'network unavailable'}};
      try {
        const data=name==='official_leaderboard'?await server.board(user):await server.action(user,params.p_action,params.p_args||{},params.p_revision||0,params.p_request);
        if(dropNext && name==='official_action' && params.p_action==='buy'){dropNext=false;return {error:{message:'network acknowledgement lost'}};}
        return {data};
      }catch(error){return {error:{message:error.message}};}
    });
    await ctx.addInitScript(({user})=>{
      localStorage.setItem('wakppu-v01',JSON.stringify({version:1,gold:777,pets:[8]}));
      window.supabase={createClient:()=>({rpc:(name,params)=>window.officialRPC(name,params),auth:{
        getSession:async()=>({data:{session:user?{user:{id:user}}:null}}),onAuthStateChange:()=>{},signInWithOAuth:async()=>({})
      }})};
    },{user});
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://official.test/official.html');
    return {ctx,page};
  }
  try {
    const {page}=await context(server.A);
    await page.locator('#official-join').waitFor({state:'visible'});
    await page.locator('#official-join').click();
    await page.locator('#official-game').waitFor({state:'visible'});
    assert.equal(await page.locator('#official-gold').textContent(),'0 G');
    await page.locator('#official-nickname').fill('수집가_UI');
    await page.getByRole('button',{name:'저장하고 랭킹 참가'}).click();
    await page.waitForFunction(()=>document.getElementById('official-me').textContent.includes('수집가_UI'));
    for(let i=0;i<12;i++) {
      const before=(await server.action(server.A,'get')).revision;
      await page.locator('#official-ball').click();
      await page.waitForFunction(rev=>document.getElementById('official-progress').value>rev || document.getElementById('official-count').textContent.startsWith('1'),i);
      await page.waitForTimeout(65);
    }
    await page.locator('[data-equip="0"]').waitFor();
    assert.equal((await server.action(server.A,'get')).pets.length,1);
    await page.locator('[data-equip="0"]').click();
    await page.waitForFunction(()=>!document.getElementById('official-income').textContent.startsWith('0 '));
    assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('wakppu-v01'))).gold,777);
    await server.db.query('update wakppu_ranked.players set gold=500 where user_id=$1',[server.A]);
    await page.reload();
    await page.locator('#official-game').waitFor({state:'visible'});
    await page.locator('[data-official-buy="1"]').click();
    await page.waitForFunction(()=>document.getElementById('official-stock').textContent.includes('오로라 왁뿌볼 · 1'));
    dropNext=true;
    await page.locator('[data-official-buy="1"]').click();
    await page.locator('#official-retry').waitFor({state:'visible'});
    assert.equal((await server.action(server.A,'get')).stock[1],2);
    await page.reload();
    await page.waitForFunction(()=>document.getElementById('official-stock').textContent.includes('오로라 왁뿌볼 · 2'));
    assert.equal((await server.action(server.A,'get')).stock[1],2,'응답 유실 재접속에서 이중 구매 방지');
    await page.waitForFunction(()=>document.getElementById('official-retry').hidden);
    const other=await context(server.A,390);
    await other.page.locator('#official-game').waitFor({state:'visible'});
    await page.locator('#official-nickname').fill('최신_수집가');
    await page.getByRole('button',{name:'저장하고 랭킹 참가'}).click();
    await page.waitForFunction(()=>document.getElementById('official-session').textContent.includes('최신_수집가'));
    await other.page.locator('#official-stock button').nth(1).click();
    await other.page.waitForFunction(()=>document.getElementById('official-notice').textContent.includes('다른 기기'));
    assert.equal((await server.action(server.A,'get')).selected,0,'오래된 클라이언트 동작은 적용하지 않습니다');
    assert.equal(await other.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await other.page.screenshot({path:path.join(base,'preview/official-mobile.png'),fullPage:true});
    await other.ctx.close();
    offline=true;
    await page.locator('[data-official-buy="1"]').click();
    await page.locator('#official-retry').waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>localStorage.getItem('wakppu-official:pending:11111111-1111-4111-8111-111111111111')));
    offline=false;
    await page.locator('#official-retry').click();
    await page.waitForFunction(()=>document.getElementById('official-retry').hidden);
    assert.equal((await server.action(server.A,'get')).stock[1],3);
    await page.locator('#official-refresh').click();
    await page.screenshot({path:path.join(base,'preview/official-desktop.png'),fullPage:true});
    const anon=await context(null,390);
    await anon.page.locator('#official-login').waitFor({state:'visible'});
    assert.equal(await anon.page.locator('#official-game').isVisible(),false);
    await anon.page.waitForFunction(()=>document.getElementById('official-ranking').textContent.includes('최신_수집가'));
    assert.deepEqual(errors,[]);
    console.log('PASS: PostgreSQL 연결 UI 가입/닉네임/부화/장착/구매/실제 랭킹, 기존 저장 보존, 응답 유실 재접속 중복 방지, 통신 실패 복구, 다른 기기 충돌, 비로그인 조회, 모바일 넘침·JS 오류 없음');
  }finally{await browser.close();await server.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
