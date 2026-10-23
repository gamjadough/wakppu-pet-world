const {chromium}=require(process.env.TEST_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{assert.ok(process.env.TEST_GAME_URL,'TEST_GAME_URL 필요');const b=await chromium.launch({channel:'chrome',headless:true});try{
 for(const [width,height] of [[1280,900],[390,844],[320,568],[844,390]]){
  const ctx=await b.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:true});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.TEST_GAME_URL);await p.waitForFunction(()=>window.wakppuCloud&&!gamePaused,{timeout:25000});
  await p.locator('.world-nav [data-menu="ranking-panel"]').tap();await p.waitForFunction(()=>!document.getElementById('ranking-refresh').disabled);
  assert.doesNotMatch(await p.locator('#ranking-status').textContent(),/못했|불러오는/);
  const data=await p.evaluate(()=>window.wakppuCloud.leaderboard());assert.ok(Array.isArray(data.top));assert.equal(data.me,null);assert.ok(data.top.length<=100);assert.ok(data.top.every(r=>Object.keys(r).every(k=>['rank','nickname','income','updated_at','is_me'].includes(k))));
  assert.equal(await p.locator('#ranking-form').isVisible(),false);assert.equal(await p.locator('#ranking-guest').isVisible(),true);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const dir=process.env.TEST_SCREENSHOT_DIR||'preview/deployed';fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,`ranking-public-${width}x${height}.png`)});
  await p.locator('#ranking-login').tap();assert.equal(await p.locator('#account-panel').isVisible(),true);assert.equal(await p.locator('#account-login').isVisible(),true);
  assert.deepEqual(errors,[]);await ctx.close();console.log(`PASS: 공개 ${width}×${height} 랭킹 RPC·게스트 조회·비공개 필드 제외·계정 연결·넘침·JS 오류 검사`);
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
