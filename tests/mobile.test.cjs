// 실제 touch 입력과 짧은 화면의 스크롤 도달성을 검증합니다.
const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const audit = process.argv.includes('--audit');
const sizes = [[320, 568], [360, 640], [390, 844], [430, 932], [667, 375], [844, 390], [932, 430]];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const preview = process.env.TEST_SCREENSHOT_DIR || path.resolve(__dirname, '../preview');
  fs.mkdirSync(preview, { recursive: true });
  try {
    for (const [width, height] of sizes) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.TEST_GAME_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.waitForLoadState('networkidle');
      await page.locator('.world-nav [data-menu="hatch-panel"]').tap();
      const metrics = await page.evaluate(() => {
        const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        return { viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth,
          ball: rect('ball'), close: rect('close-menu'), sound: rect('sound-toggle'), queue: rect('queue'), panel: rect('menu-panel') };
      });
      if (audit) { console.log(JSON.stringify({ width, height, ...metrics })); await page.screenshot({ path: path.join(preview, `before-${width}x${height}.png`) }); await context.close(); continue; }
      assert.equal(metrics.overflow, false, '가로 넘침: ' + width);
      assert.ok(metrics.ball.width >= 120, '부화 볼 최소 크기: ' + JSON.stringify(metrics));
      assert.ok(metrics.close.width >= 44 && metrics.close.height >= 44, '닫기 터치 크기');
      assert.ok(metrics.sound.height >= 44, '소리 터치 크기');
      assert.ok(metrics.panel.y >= 0 && metrics.panel.y + metrics.panel.height <= height, '팝업 화면 내 표시');
      assert.equal(await page.locator('#ball').evaluate(el => getComputedStyle(el).touchAction), 'manipulation');
      const content = page.locator('.menu-content');
      if (await content.evaluate(el => el.scrollHeight > el.clientHeight + 1)) {
        // 프로그램으로 scrollTop을 바꾸지 않고 손가락 스와이프로 스크롤합니다.
        const session = await context.newCDPSession(page);
        const box = await content.boundingBox(), x = box.x + box.width - 8;
        const start = box.y + box.height - 16, end = box.y + 16;
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
        for (let i = 1; i <= 8; i++) {
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start + (end - start) * i / 8 }] });
          await page.waitForTimeout(16);
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => document.querySelector('.menu-content').scrollTop > 0);
        // 관성 스크롤 중의 첫 터치는 스크롤 정지로 소비되므로 멈춘 뒤 부화합니다.
        await page.waitForFunction(() => {
          const top = document.querySelector('.menu-content').scrollTop, now = performance.now();
          if (!window.testScroll || window.testScroll.top !== top) window.testScroll = { top, time: now };
          return now - window.testScroll.time >= 250;
        }, null, { polling: 50 });
        await session.detach();
      }
      // synthetic click 대신 빠른 실제 터치로 무료 부화를 완료합니다.
      for (let i = 0; i < 12; i++) await page.locator('#ball').tap();
      await page.waitForFunction(() => !document.getElementById('ball').disabled);
      assert.equal(await page.evaluate(() => state.pets.length), 1);
      assert.match(await page.locator('#result').textContent(), /부화!/);
      for (const button of await page.locator('#queue button').all()) {
        const box = await button.boundingBox(); assert.ok(box.height >= 44, '볼 선택 터치 크기');
        await button.scrollIntoViewIfNeeded();
        assert.ok(await button.evaluate(el => {
          const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit === el || el.contains(hit);
        }), '스크롤 후 볼 선택 도달');
      }
      // 여러 페이지의 구매, 선택, 장착과 저장을 실제 터치로 이어서 검사합니다.
      await page.locator('.world-nav [data-menu="inventory-panel"]').tap();
      await page.locator('[data-equip="0"]').tap();
      assert.deepEqual(await page.evaluate(() => state.equipped), [0]);
      await page.waitForFunction(() => state.gold > 0);
      await page.evaluate(() => { state.gold = 100; save(); renderStats(); });
      await page.locator('.world-nav [data-menu="shop-panel"]').tap();
      await page.locator('[data-buy="1"]').tap();
      assert.equal(await page.evaluate(() => state.stock[1]), 1);
      await page.locator('.world-nav [data-menu="hatch-panel"]').tap();
      await page.locator('[data-select="1"]').tap();
      assert.equal(await page.evaluate(() => state.selected), 1);
      await page.reload();
      assert.equal(await page.evaluate(() => state.selected), 1);
      assert.deepEqual(await page.evaluate(() => state.equipped), [0]);
      // 각 메뉴의 마지막 항목까지 스크롤할 수 있어야 합니다.
      for (const [menu, last] of [['shop-panel', '#shop-panel > button'], ['inventory-panel', '[data-release="0"]'], ['codex-panel', '#codex .pet-card:last-child .rate']]) {
        await page.locator(`.world-nav [data-menu="${menu}"]`).tap();
        await page.locator(last).scrollIntoViewIfNeeded();
        assert.ok(await page.locator(last).evaluate(el => {
          const r = el.getBoundingClientRect(), b = document.querySelector('.menu-content').getBoundingClientRect();
          return r.bottom <= b.bottom + 1 && r.top >= b.top - 1;
        }), '메뉴 스크롤 도달: ' + menu);
        await page.locator('#close-menu').tap();
        assert.equal(await page.locator('#menu-panel').isVisible(), false);
      }
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.world-pet')].every(el => {
        const r = el.getBoundingClientRect(), m = document.getElementById('world-map').getBoundingClientRect();
        return r.left >= m.left && r.right <= m.right && r.top >= m.top && r.bottom <= m.bottom;
      })), true, '가로 화면 펫 경계');
      await page.screenshot({ path: path.join(preview, `mobile-${width}x${height}.png`) });
      await page.locator('.world-nav [data-menu="hatch-panel"]').tap();
      await page.screenshot({ path: path.join(preview, `hatch-${width}x${height}.png`) });
      if (width === 390) {
        await page.setViewportSize({ width: 844, height: 390 });
        await page.locator('#ball').tap();
        await page.setViewportSize({ width, height });
        assert.equal(await page.locator('#hatch-panel').isVisible(), true, '회전 후 열린 메뉴 유지');
        assert.equal(await page.evaluate(() => state.selected), 1, '회전 후 볼 선택 유지');
      }
      // 실제 기기 없이도 노치 20px, 홈 영역 34px, 가로 노치 44px을 주입해 배치를 확인합니다.
      const safeCSS = fs.readFileSync(path.resolve(__dirname, '../style.css'), 'utf8')
        .replaceAll('env(safe-area-inset-top)', '20px').replaceAll('env(safe-area-inset-bottom)', '34px')
        .replaceAll('env(safe-area-inset-left)', width > height ? '44px' : '0px')
        .replaceAll('env(safe-area-inset-right)', width > height ? '44px' : '0px');
      await page.addStyleTag({ content: safeCSS });
      assert.ok(await page.evaluate(() => {
        const panel = document.getElementById('menu-panel').getBoundingClientRect(), nav = document.querySelector('.world-nav').getBoundingClientRect();
        return panel.top >= 20 && panel.bottom <= nav.top && nav.bottom <= innerHeight - 34;
      }), '안전 영역과 메뉴 겹침 방지');
      console.log(`PASS: ${width}×${height} 터치 부화·구매·선택·장착·저장·스크롤·닫기·펫 경계`);
      await context.close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
