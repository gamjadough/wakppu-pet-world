const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], preview = process.env.TEST_SCREENSHOT_DIR || path.resolve(__dirname, '../preview');
  fs.mkdirSync(preview, { recursive: true });
  try {
    for (const [width, height] of [[1280, 900], [390, 844], [320, 568], [844, 390]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: width < 1000 });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.TEST_GAME_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      async function seed(pets = [8, 0, 6, 1, 9, 2, 0], equipped = [4, 2]) {
        await page.evaluate(({ pets, equipped }) => {
          window.removeEventListener('pagehide', save); save = () => {};
          localStorage.setItem('wakppu-v01', JSON.stringify({ version: 1, gold: 100, pets, equipped, discovered: [0, 1, 2, 6, 8, 9], stock: [0, 0, 0, 0], selected: 0, cracks: 0 }));
        }, { pets, equipped });
        await page.reload();
        // 기존 회귀 검사가 수익 생산을 검증하므로 여기서는 방생 보상을 정확히 분리합니다.
        await page.evaluate(() => { accrueGold = () => {}; });
        await page.locator('.world-nav [data-menu="inventory-panel"]').tap();
      }
      const order = () => page.locator('#inventory [data-equip]').evaluateAll(buttons => buttons.map(b => Number(b.dataset.equip)));
      const selected = () => page.locator('#inventory [data-pet-select]:checked').evaluateAll(inputs => inputs.map(i => Number(i.dataset.petSelect)).sort((a, b) => a - b));
      const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('wakppu-v01')));
      await seed();
      assert.deepEqual(await order(), [0, 1, 2, 3, 4, 5, 6]);
      await page.locator('#inventory-sort').selectOption('rarity-asc');
      assert.deepEqual(await order(), [1, 3, 6, 5, 2, 0, 4]);
      await page.locator('#inventory-sort').selectOption('rarity-desc');
      assert.deepEqual(await order(), [0, 4, 2, 5, 1, 3, 6]);
      assert.deepEqual((await snapshot()).pets, [8, 0, 6, 1, 9, 2, 0], '표시 정렬은 저장 배열을 변경하지 않음');
      await page.locator('[data-pet-select="6"]').check();
      await page.locator('#inventory-sort').selectOption('obtained');
      assert.deepEqual(await selected(), [6], '정렬 후 중복 펫의 선택 유지');
      await page.locator('#inventory-rarity').selectOption('0');
      assert.deepEqual(await order(), [1, 3, 6]);
      assert.deepEqual(await selected(), [], '필터 변경 시 숨겨진 선택 제거');
      await page.locator('#select-visible').tap();
      assert.deepEqual(await selected(), [1, 3, 6]);
      assert.match(await page.locator('#selection-summary').textContent(), /3마리 · 보상 3.4 G/);
      await page.locator('#clear-selection').tap();
      assert.deepEqual(await selected(), []);
      assert.equal(await page.locator('#release-selected').isDisabled(), true);
      await page.locator('#select-visible').tap();
      const before = await snapshot();
      page.once('dialog', d => { assert.match(d.message(), /3마리.*3.4 G/); d.dismiss(); });
      await page.locator('#release-selected').tap();
      assert.deepEqual(await snapshot(), before, '방생 취소 시 저장 유지');
      assert.deepEqual(await selected(), [1, 3, 6]);
      page.once('dialog', d => d.accept());
      await page.locator('#release-selected').tap();
      const after = await snapshot();
      assert.deepEqual(after.pets, [8, 6, 9, 2]);
      assert.deepEqual(after.equipped, [2, 1], '삭제 뒤 최근 장착 순서 및 번호 유지');
      assert.ok(Math.abs(after.gold - before.gold - 3.4) < 1e-8, '정확한 합산 보상');
      assert.deepEqual(after.discovered, before.discovered);
      assert.equal(await page.locator('#inventory .empty').textContent(), '이 등급의 펫이 없어요.');
      assert.equal(await page.locator('#select-visible').isDisabled(), true);
      await page.locator('#inventory-rarity').selectOption('all');
      assert.equal(await page.locator('[data-pet-select="1"]').isDisabled(), true);
      assert.equal(await page.locator('[data-pet-select="2"]').isDisabled(), true);
      await page.locator('#select-visible').tap();
      assert.deepEqual(await selected(), [0, 3], '장착 펫 보호');
      // 선택 펫 장착 시 방생 대상에서 자동 제외합니다.
      await page.locator('[data-equip="0"]').tap();
      assert.deepEqual(await selected(), [3]);
      assert.deepEqual((await snapshot()).equipped, [2, 1, 0]);
      await page.locator('#inventory-sort').selectOption('rarity-desc');
      await page.locator('[data-equip="3"]').tap();
      assert.deepEqual((await snapshot()).equipped, [2, 1, 3], '정렬 후 교체 장착');
      assert.deepEqual(await selected(), []);
      // 개별 방생도 정렬된 화면의 원래 펫 번호를 사용합니다.
      await page.locator('[data-pet-select="0"]').check();
      page.once('dialog', d => d.accept());
      await page.locator('[data-release="0"]').tap();
      assert.deepEqual((await snapshot()).pets, [6, 9, 2]);
      assert.deepEqual((await snapshot()).equipped, [1, 0, 2]);
      assert.deepEqual(await selected(), []);
      const saved = await snapshot();
      await page.reload();
      assert.deepEqual((await snapshot()).pets, saved.pets);
      assert.deepEqual((await snapshot()).equipped, saved.equipped);
      assert.deepEqual((await snapshot()).discovered, saved.discovered);
      await page.locator('.world-nav [data-menu="inventory-panel"]').tap();
      assert.deepEqual(await order(), [0, 1, 2]);
      assert.equal(await page.locator('#select-visible').isDisabled(), true, '전체 장착 상태');
      // 대표 화면은 선택 상태와 정렬 UI를 보여줍니다.
      await seed();
      await page.locator('#inventory-sort').selectOption('rarity-desc');
      await page.locator('#select-visible').tap();
      await page.locator('#selection-summary').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(preview, `inventory-${width}x${height}.png`) });
      if (width < 1000) {
        for (const selector of ['#inventory-sort', '#inventory-rarity', '#select-visible', '#release-selected', '.pet-selection']) {
          assert.ok((await page.locator(selector).first().boundingBox()).height >= 44, '모바일 터치 크기: ' + selector);
        }
      }
      await seed([], []);
      assert.equal(await page.locator('#release-selected').isDisabled(), true);
      assert.equal(await page.locator('#select-visible').isDisabled(), true);
      console.log(`PASS: ${width}×${height} 필터·정렬·중복 선택·일괄 방생 취소/보상·장착 순서·도감·저장·터치`);
      await context.close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
