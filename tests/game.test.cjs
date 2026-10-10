// 개발자용 회귀 검사입니다. 게임 실행에는 Node나 Playwright가 필요 없습니다.
// TEST_PLAYWRIGHT_MODULE에 기존 Playwright 설치 경로를 지정할 수도 있습니다.
const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 2560, height: 1600 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
  const read = expression => page.evaluate(expression);
  async function click(selector) {
    const menu = selector.includes('data-equip') ? 'inventory-panel' : selector.includes('data-buy') ? 'shop-panel' : selector.includes('data-select') || selector === '#ball' ? 'hatch-panel' : null;
    if (menu && !(await page.locator('#' + menu).isVisible())) await page.locator('.world-nav [data-menu="' + menu + '"]').click();
    await page.locator(selector).click();
  }
  async function snapshot() { return read(() => JSON.parse(localStorage.getItem('wakppu-v01'))); }
  async function seed(data) {
    // 새로고침 직전 자동 저장이 테스트용 데이터를 덮어쓰지 않게 막습니다.
    await page.evaluate(value => { window.removeEventListener('pagehide', save); save = () => {}; localStorage.setItem('wakppu-v01', JSON.stringify(value)); }, data);
    await page.reload();
  }
  try {
    await page.goto(url);
    await page.evaluate(() => localStorage.removeItem('wakppu-v01'));
    await page.reload();
    assert.equal((await snapshot()).gold, 0);
    assert.equal(await page.locator('[data-buy="1"]').isDisabled(), true);
    assert.equal(await page.locator('.codex h3').allTextContents().then(a => a.every(t => t === '???')), true);
    await click('#ball');
    assert.equal(await page.locator('#ball').getAttribute('data-crack'), '1');
    assert.equal((await snapshot()).cracks, 1);
    await page.reload();
    assert.equal((await snapshot()).cracks, 1);
    // 한 번의 빠른 연속 입력으로 여러 부화가 일어나지 않는지 검증합니다.
    await page.evaluate(() => { for (let i = 0; i < 100; i++) document.getElementById('ball').click(); });
    assert.equal((await snapshot()).pets.length, 1);
    assert.equal(await page.locator('#ball').isDisabled(), true);
    await page.waitForFunction(() => !document.getElementById('ball').disabled);
    assert.match(await page.locator('#result').textContent(), /부화!/);
    await click('[data-equip="0"]');
    await page.waitForFunction(() => Number(JSON.parse(localStorage.getItem('wakppu-v01')).gold) > 0);
    const earned = await snapshot();
    assert.ok(earned.gold > 0);
    await page.reload();
    assert.deepEqual((await snapshot()).equipped, [0]);
    await click('[data-equip="0"]');
    assert.equal(await page.locator('#income').textContent(), '0 G/s');
    assert.equal((await snapshot()).pets.length, 1);
    assert.equal((await snapshot()).discovered.length, 1);
    console.log('PASS: 기본 상태, 균열/새로고침, 중복 부화 방지, 장착/수익/해제/도감');

    await seed({ version: 1, gold: 350, pets: [0, 1, 2, 3], equipped: [], discovered: [], stock: [0, 0, 0, 0], selected: 0, cracks: 0 });
    for (let i = 0; i < 3; i++) await click(`[data-equip="${i}"]`);
    assert.equal(await page.locator('[data-equip="3"]').isDisabled(), true);
    assert.equal(await page.locator('#income').textContent(), '6.2 G/s');
    assert.equal(await page.locator('#power').textContent(), '클릭 위력 2');
    await click('[data-equip="1"]');
    await click('[data-equip="3"]');
    assert.deepEqual((await snapshot()).equipped, [0, 2, 3]);
    // 생산 틱을 제외한 구매 검사를 위해 펫을 해제합니다.
    for (const i of [0, 2, 3]) await click(`[data-equip="${i}"]`);
    const before = (await snapshot()).gold;
    await click('[data-buy="1"]');
    assert.equal((await snapshot()).gold, before - 50);
    assert.equal((await snapshot()).stock[1], 1);
    await click('[data-select="1"]');
    await page.reload();
    assert.equal((await snapshot()).selected, 1);
    assert.equal((await snapshot()).stock[1], 1);
    await page.evaluate(() => { for (let i = 0; i < 50; i++) document.getElementById('ball').click(); });
    assert.equal((await snapshot()).stock[1], 0);
    assert.equal((await snapshot()).pets.length, 5);
    await page.waitForFunction(() => !document.getElementById('ball').disabled);
    assert.equal((await snapshot()).selected, 0);
    console.log('PASS: 3슬롯 한도, 능력 합산, 구매 차감, 선택/구매 저장, 유료 볼 소모/다음 볼');

    await page.evaluate(() => { window.removeEventListener('pagehide', save); save = () => {}; localStorage.setItem('wakppu-v01', '{broken'); });
    await page.reload();
    assert.equal((await snapshot()).gold, 0);
    await seed({ version: 1, gold: -100, pets: [0, -1, '0', 500, 1], equipped: [0, 0, 1, 7], discovered: [100], stock: [0, -1, '2', 3], selected: 1, cracks: 900 });
    assert.deepEqual((await snapshot()).pets, [0, 1]);
    assert.deepEqual((await snapshot()).equipped, [0, 1]);
    assert.equal((await snapshot()).selected, 0);
    assert.equal((await snapshot()).cracks, 0);
    assert.ok((await snapshot()).gold >= 0);
    page.once('dialog', d => d.dismiss());
    await click('#reset');
    assert.equal((await snapshot()).pets.length, 2);
    page.once('dialog', d => d.accept());
    await click('#reset');
    assert.equal((await snapshot()).pets.length, 0);
    assert.equal((await snapshot()).gold, 0);
    // 저장소가 차단되어도 플레이가 이어져야 합니다.
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
    await click('#ball');
    assert.match(await page.locator('#save-status').textContent(), /저장 불가/);
    assert.match(await page.locator('#click-label').textContent(), /1 \/ 12/);
    await page.reload();
    console.log('PASS: 손상 저장 복구, 잘못된 필드 검증, 초기화 취소/확인, 저장 차단');

    // 확률 경계를 고정해 모든 희귀도와 각 볼의 확률 합을 검증합니다.
    const oddsOK = await read(() => BALLS.every(b => Math.abs(b.odds.reduce((a, n) => a + n, 0) - 100) < 1e-9));
    assert.equal(oddsOK, true);
    const rolled = await read(() => {
      const original = Math.random;
      try { return BALLS.map((b, tier) => {
        let accumulated = 0;
        return b.odds.map(weight => { const midpoint = (accumulated + weight / 2) / 100; accumulated += weight; Math.random = () => midpoint; return PETS[rollPet(tier)].rarity; });
      }); } finally { Math.random = original; }
    });
    rolled.forEach(row => assert.deepEqual(row, [0, 1, 2, 3, 4]));
    await seed({ version: 1, gold: 500, pets: [0, 2, 8, 0], equipped: [0, 1, 2], discovered: [0, 2, 8, 9], stock: [0, 2, 1, 0], selected: 1, cracks: 4 });
    assert.equal(await page.locator('.world-pet').count(), 3);
    assert.equal(await page.locator('#income').textContent(), '90.2 G/s');
    assert.equal(await page.locator('#menu-panel').isVisible(), false);
    const positions = await read(() => [...world.actors.values()].map(a => [a.x, a.y]));
    assert.equal(new Set(await read(() => [...world.actors.values()].map(a => a.speed))).size, 3);
    await page.waitForTimeout(400);
    const moved = await read(() => [...world.actors.values()].map(a => [a.x, a.y]));
    assert.ok(moved.every((p, i) => Math.hypot(p[0] - positions[i][0], p[1] - positions[i][1]) > 1));
    // 이동 중인 버튼의 현재 좌표를 눌러 실제 포인터 입력을 검증합니다.
    const petBounds = await page.locator('[data-world-pet="0"]').boundingBox();
    await page.mouse.click(petBounds.x + petBounds.width / 2, petBounds.y + petBounds.height / 2);
    assert.equal(await page.locator('#info-name').textContent(), '새싹뿌');
    assert.equal(await page.locator('#info-rate').textContent(), '1.2 G/s');
    await page.locator('#close-pet-info').click();
    await read(() => { const actors = [...world.actors.values()]; actors.forEach(a => { a.x = 500; a.y = 400; a.rest = 1; }); });
    await page.waitForTimeout(150);
    assert.ok(await read(() => { const a = [...world.actors.values()]; return a.every((p, i) => a.every((q, j) => i === j || Math.hypot(p.x - q.x, p.y - q.y) >= 85)); }));
    await read(() => { [...world.actors.values()].forEach(a => { a.x = -100; a.y = 10000; }); });
    await page.waitForTimeout(150);
    const inBounds = () => [...document.querySelectorAll('.world-pet')].every(p => { const r = p.getBoundingClientRect(), m = document.getElementById('world-map').getBoundingClientRect(); return r.left >= m.left && r.right <= m.right && r.top >= m.top && r.bottom <= m.bottom; });
    assert.equal(await read(inBounds), true);
    await read(() => { window.originalRandom = Math.random; Math.random = () => .1; [...world.actors.values()].forEach(a => { a.rest = 0; a.changeIn = 0; }); });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.world-pet.resting').count(), 3);
    await read(() => { Math.random = window.originalRandom; });
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.world-pet.resting').count(), 0);
    await click('[data-equip="0"]');
    assert.equal(await page.locator('.world-pet').count(), 2);
    assert.equal(await page.locator('#income').textContent(), '89 G/s');
    await click('[data-equip="3"]');
    assert.equal(await page.locator('.world-pet').count(), 3);
    await page.locator('#close-menu').click();
    await page.reload();
    assert.deepEqual((await snapshot()).equipped, [1, 2, 3]);
    assert.equal(await page.locator('.world-pet').count(), 3);
    await page.locator('.world-nav [data-menu="codex-panel"]').click();
    assert.equal(await page.locator('#codex h3').last().textContent(), '우주뿌');
    assert.equal(await page.locator('#world-map').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menu-panel').isVisible(), false);
    fs.mkdirSync(path.resolve(__dirname, '../preview'), { recursive: true });
    console.log('PASS: 이전 저장 호환, 월드 장착/해제/재로드, 이동/경계/분리/휴식, 펫 정보, 메뉴 유지');
    await page.screenshot({ path: path.resolve(__dirname, '../preview/desktop.png'), fullPage: true });
    const fullMap = await page.locator('#world-map').boundingBox();
    for (const menu of ['shop-panel', 'hatch-panel', 'inventory-panel', 'codex-panel']) {
      await page.locator('.world-nav [data-menu="' + menu + '"]').click();
      assert.deepEqual(await page.locator('#world-map').boundingBox(), fullMap);
      assert.equal(await page.locator('#' + menu).isVisible(), true);
      assert.equal(await page.locator('#menu-backdrop').isVisible(), true);
      assert.match(await read(() => getComputedStyle(document.getElementById('menu-backdrop')).backgroundColor), /rgba\(/);
    }
    await page.locator('#menu-backdrop').click({ position: { x: 10, y: 10 } });
    assert.equal(await page.locator('#menu-panel').isVisible(), false);
    await page.locator('.world-nav [data-menu="shop-panel"]').click();
    assert.equal(await page.locator('#ball').isVisible(), false);
    await page.screenshot({ path: path.resolve(__dirname, '../preview/shop-panel.png'), fullPage: true });
    await page.locator('.world-nav [data-menu="hatch-panel"]').click();
    assert.equal(await page.locator('#shop').isVisible(), false);
    assert.equal(await page.locator('#ball').isVisible(), true);
    await page.screenshot({ path: path.resolve(__dirname, '../preview/hatch-panel.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    assert.equal(await read(inBounds), true);
    assert.equal(await read(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.resolve(__dirname, '../preview/mobile.png'), fullPage: true });
    await page.locator('.world-nav [data-menu="inventory-panel"]').click();
    assert.equal(await page.locator('#inventory-panel').isVisible(), true);
    assert.equal(await page.locator('#gold').isVisible(), true);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForTimeout(300);
    assert.equal(await read(inBounds), true);
    assert.equal(await read(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(300);
    assert.equal(await read(inBounds), true);
    assert.equal(await read(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS: 4개 볼 × 5개 희귀도 확률 경계, 모바일 가로 넘침 없음, JS 오류 없음');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
