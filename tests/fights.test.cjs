// 별도 브라우저 저장소에서 실제 만남·중재·수익·새로고침을 검증합니다.
const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = process.env.TEST_GAME_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
  const base = { version: 1, gold: 100, pets: [0, 1, 2], equipped: [0, 1, 2], discovered: [0, 1, 2], stock: [0, 0, 0, 0], selected: 0, cracks: 0 };
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('wakppu-v01')));
  async function seed(data) {
    await page.evaluate(value => { window.removeEventListener('pagehide', save); save = () => {}; localStorage.setItem('wakppu-v01', JSON.stringify(value)); }, { ...base, ...data });
    await page.reload();
    await page.evaluate(() => { for (const a of world.actors.values()) a.rest = 100; });
  }
  async function meet() {
    await page.evaluate(() => {
      const actors = [...world.actors.values()];
      actors.forEach((a, i) => { a.x = world.width * (i < 2 ? .4 : .8); a.y = world.height * .5; a.rest = 100; world.paint(a); });
    });
    await page.waitForTimeout(120);
  }
  async function inventoryClick(selector) {
    if (!(await page.locator('#inventory-panel').isVisible())) await page.locator('.world-nav [data-menu="inventory-panel"]').click();
    await page.locator(selector).click();
  }
  try {
    await page.goto(url);
    await seed({});
    await meet();
    assert.deepEqual((await state()).fights, [[0, 1]]);
    assert.equal(await page.locator('.world-pet.fighting').count(), 2);
    assert.equal(await page.locator('#income').textContent(), '4 G/s');
    const before = await page.evaluate(() => state.gold);
    const positions = await page.evaluate(() => [...world.actors.values()].slice(0, 2).map(a => [a.x, a.y]));
    await page.waitForTimeout(1100);
    const gain = (await page.evaluate(() => state.gold)) - before;
    assert.ok(gain > 3 && gain < 5.5, '싸우지 않는 펫만 수익 생산: ' + gain);
    assert.deepEqual(await page.evaluate(() => [...world.actors.values()].slice(0, 2).map(a => [a.x, a.y])), positions);
    await page.reload();
    assert.deepEqual((await state()).fights, [[0, 1]]);
    assert.equal(await page.locator('#income').textContent(), '4 G/s');
    await page.locator('[data-world-pet="0"]').click();
    assert.deepEqual((await state()).fights, []);
    assert.equal(await page.locator('#income').textContent(), '6.2 G/s');
    assert.equal(await page.locator('#pet-info').isVisible(), false);
    assert.equal(await page.locator('#fight-status').isVisible(), false);
    await meet();
    assert.deepEqual((await state()).fights, []);
    await page.reload();
    await meet();
    assert.deepEqual((await state()).fights, [], '중재 후 평화 시간 새로고침 유지');
    await page.evaluate(() => { state.peaceUntil = {}; });
    await meet();
    assert.deepEqual((await state()).fights, [[0, 1]], '평화 시간 후 다시 만남');
    await page.locator('#fight-status').click();
    assert.deepEqual((await state()).fights, []);
    console.log('PASS: 실제 근접 싸움, 2마리 정지/수익 제외, 나머지 수익 유지, 저장 복원, 펫 클릭/알림 중재, 재싸움 방지');

    await seed({ pets: [0, 0], equipped: [0, 1] });
    await meet();
    assert.deepEqual((await state()).fights, [], '동일 고유 능력은 싸우지 않음');
    await seed({ pets: [0, 1], equipped: [0, 1], fights: [[0, 1]] });
    const gold = await page.evaluate(() => state.gold);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => state.gold), gold);
    assert.equal(await page.locator('#income').textContent(), '0 G/s');
    await inventoryClick('[data-equip="0"]');
    assert.deepEqual((await state()).fights, []);
    assert.equal(await page.locator('#income').textContent(), '1 G/s');
    await seed({ pets: [0, 1, 2, 3], equipped: [1, 2, 3], fights: [[1, 2]] });
    page.once('dialog', d => d.accept());
    await inventoryClick('[data-release="0"]');
    assert.deepEqual((await state()).fights, [[0, 1]], '무관한 방생 시 싸움 번호 재연결');
    assert.equal(await page.locator('#income').textContent(), '3 G/s');
    page.once('dialog', d => d.accept());
    await inventoryClick('[data-release="0"]');
    assert.deepEqual((await state()).fights, []);
    assert.equal(await page.locator('#income').textContent(), '7 G/s');
    await seed({ pets: [0, 1, 2, 3], fights: [[0, 1]] });
    await inventoryClick('[data-equip="3"]');
    assert.deepEqual((await state()).fights, [[0, 1]], '비참가 펫 교체 시 싸움 유지');
    await inventoryClick('[data-equip="2"]');
    await inventoryClick('[data-equip="0"]');
    assert.deepEqual((await state()).fights, []);
    await seed({ fights: [[0, 0], [0, 8], ['0', 1], [0, 1], [1, 2]], peaceUntil: { 2: 'invalid' } });
    assert.deepEqual((await state()).fights, [[0, 1]], '손상 싸움/중복 참가 필드 복구');
    page.once('dialog', d => d.accept());
    await page.locator('#reset').click();
    assert.deepEqual((await state()).fights, []);
    assert.equal(await page.locator('.world-pet').count(), 0);
    console.log('PASS: 같은 능력 평화, 전원 싸움 시 수익 0, 해제/교체/방생의 싸움 정리, 번호 재연결, 손상 저장/초기화');

    await seed({ fights: [[0, 1]] });
    for (const viewport of [{ width: 2560, height: 1600 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#fight-status').isVisible(), true);
      assert.ok(await page.locator('#fight-status').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    }
    await page.screenshot({ path: path.join(process.env.TEST_SCREENSHOT_DIR || require('node:os').tmpdir(), 'fight.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: PC/모바일 중재 알림, JavaScript 오류 없음');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
