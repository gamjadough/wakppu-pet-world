// 정원의 성격·궁합·화해와 로비 조작을 별도 저장소에서 검증합니다.
const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs');
const { pathToFileURL } = require('node:url');
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 const ctx = await browser.newContext({ viewport: { width: 2560, height: 1600 } });
 const page = await ctx.newPage(), errors = [];
 page.on('pageerror', e => errors.push(e.message));
 const base = { version: 1, gold: 200, pets: [0,2,3], equipped: [0,1,2], discovered: [0,2,3], stock: [0,2,0,0], selected: 0, cracks: 3 };
 async function seed(extra = {}) {
  await page.evaluate(data => { window.removeEventListener('pagehide', save); save = () => {}; localStorage.setItem('wakppu-v01', JSON.stringify(data)); }, { ...base, ...extra });
  await page.reload();
  await page.evaluate(() => { for (const a of world.actors.values()) a.rest = 100; });
 }
 const read = fn => page.evaluate(fn);
 try {
  await page.goto(process.env.TEST_GAME_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href);
  await seed();
  assert.ok(Math.abs(await read(() => income()) - 9.02) < 1e-9);
  assert.match(await page.locator('#team-summary').textContent(), /0.8 G\/s/);
  assert.equal(await read(() => state.selected), 0);
  assert.equal(await read(() => state.cracks), 3);
  await page.locator('#scene-toggle').click();
  assert.equal(await page.locator('body').getAttribute('data-scene'), 'dusk');
  await page.reload();
  assert.equal(await read(() => state.scene), 'dusk');
  assert.equal(await page.locator('#garden-name').textContent(), '별빛 정원');
  await page.locator('[data-menu="guide-panel"]').click();
  assert.equal(await page.locator('#guide-panel').isVisible(), true);
  assert.match(await page.locator('#guide-panel').textContent(), /20초/);
  await page.keyboard.press('Escape');
  await page.locator('#garden-goal').click();
  assert.equal(await page.locator('#hatch-panel').isVisible(), true);
  await page.keyboard.press('Escape');
  await seed({ equipped: [] });
  await page.locator('#garden-goal').click();
  assert.equal(await page.locator('#inventory-panel').isVisible(), true);
  await page.keyboard.press('Escape');
  await seed({ pets: [0,2,2], equipped: [0,1,2] });
  assert.ok(Math.abs(await read(() => income()) - 10.12) < 1e-9, '친구 여럿이어도 보너스 10% 한 번');
  await seed({ pets: [0,0], equipped: [0,1] });
  assert.equal(await read(() => income()), 2.4, '동일 종류 보너스 없음');
  await seed({ pets: [0], equipped: [0] });
  assert.equal(await read(() => income()), 1.2);
  await seed({ pets: [0,2], equipped: [0,1] });
  await read(() => { for (const a of world.actors.values()) { a.x = world.width * .5; a.y = world.height * .5; a.socialReadyAt = 0; } });
  await page.waitForTimeout(120);
  assert.equal(await page.locator('.playing').count(), 2);
  assert.deepEqual(await read(() => state.fights), []);
  await read(() => { for (const a of world.actors.values()) { a.x = world.width * .5; a.y = world.height * .5; a.playIn = 0; } });
  await page.waitForTimeout(120);
  assert.equal(await page.locator('.playing').count(), 0, '만남 재검사 간격');
  await seed({ pets: [0,1,2], equipped: [0,1,2] });
  const neutral = await read(() => { startFight(0, 2); return state.fights; });
  assert.deepEqual(neutral, [], '잘 맞는 성격은 강제 다툼에도 평화');
  await read(() => { startFight(0, 1); });
  assert.equal(await read(() => income()), 4, '싸움 중 응원과 두 펫 수익 제외');
  await read(() => {
    state.gold = 0; state.fightEndsAt = Date.now() - 500; lastTick = performance.now() - 1000;
    accrueGold(); renderStats();
  });
  assert.ok(Math.abs(await read(() => state.gold) - 5.36) < .03, '종료 앞뒤 수익 정산');
  assert.deepEqual(await read(() => state.fights), []);
  assert.equal(await page.locator('#fight-status').isVisible(), false);
  assert.ok(await read(() => state.peaceUntil[0] > Date.now()));
  await seed({ pets: [0,1], equipped: [0,1], fights: [[0,1]], fightEndsAt: Date.now() - 1 });
  assert.deepEqual(await read(() => state.fights), [], '만료된 싸움 복원 시 재개하지 않음');
  await read(() => wakppuGame.useSave({ version: 1, gold: 9, pets: [0,2], equipped: [0,1], discovered: [0,2], scene: 'dusk' }, 'garden-test'));
  assert.equal(await read(() => activeSaveKey), 'wakppu-v01:account:garden-test');
  assert.equal(await read(() => state.scene), 'dusk');
  assert.ok(Math.abs(await read(() => income()) - 5.72) < 1e-9);
  console.log('PASS: 이전 저장/계정 전환 호환, 배경 저장, 안내·목표 버튼, 궁합 보너스/중첩 방지, 함께 놀기, 다툼 조건/자동 화해/시간별 수익');

  await seed();
  const preview = process.env.TEST_SCREENSHOT_DIR || path.resolve(__dirname, '../preview'); fs.mkdirSync(preview, { recursive: true });
  await page.screenshot({ path: path.join(preview, 'garden-day.png') });
  await page.locator('#scene-toggle').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(preview, 'garden-mobile.png') });
  for (const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:2560,height:1600}]) {
   await page.setViewportSize(viewport); await page.waitForTimeout(100);
   assert.equal(await read(() => document.documentElement.scrollWidth <= innerWidth), true);
   for (const id of ['scene-toggle', 'garden-goal', 'account-toggle']) {
    assert.ok(await page.locator('#'+id).evaluate(el => { const r=el.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && (hit===el || el.contains(hit)); }), '로비 조작 가림 없음: '+id+' '+JSON.stringify(viewport));
   }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 4가지 화면 크기 로비 조작/넘침, JavaScript 오류 없음');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
