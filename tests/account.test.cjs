// 실제 브라우저에서 서버 응답을 모의합니다. 실제 Supabase 권한 검증은 별도입니다.
const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const base = path.resolve(__dirname, '..');
const blank = () => ({ version: 1, gold: 0, pets: [], equipped: [], discovered: [], stock: [0,0,0,0], selected: 0, cracks: 0 });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let row = null, failWrites = false, failReads = false, writeDelay = 0, sessionDelay = 0;
  const errors = [], dialogs = [];
  let acceptDialogs = true;
  async function context(user, duringLoad) {
    const ctx = await browser.newContext(process.env.TEST_ACCOUNT_MOBILE === '1'
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
    // 로컬 네트워크 권한 없이 저장소 파일을 브라우저 응답으로 제공합니다.
    await ctx.route('https://wakppu.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const file = path.join(base, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!file.startsWith(base + path.sep)) return route.fulfill({ status: 403 });
      if (process.env.TEST_ACCOUNT_ASSET_URL) {
        const response = await route.fetch({ url: process.env.TEST_ACCOUNT_ASSET_URL + (pathname === '/' ? 'index.html' : pathname.slice(1)) });
        return route.fulfill({ response });
      }
      try {
        // 다른 작업의 미완성 게임 편집과 분리하여 배포된 게임 + 수정 계정 코드도 검사할 수 있습니다.
        const body = process.env.TEST_COMMITTED_GAME === '1' && ['index.html', 'style.css', 'game.js', 'world.js'].includes(path.basename(file))
          ? execFileSync('git', ['show', `HEAD:${path.basename(file)}`], { cwd: base }) : fs.readFileSync(file);
        return route.fulfill({ body, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
      }
      catch { return route.fulfill({ status: 404 }); }
    });
    await ctx.exposeBinding('fakeCloud', async (_, action, payload) => {
      if (action === 'session') { if (sessionDelay) await new Promise(resolve => setTimeout(resolve, sessionDelay)); return; }
      if (action === 'load') return failReads ? { error: { message: 'read failed' } } : { data: row && JSON.parse(JSON.stringify(row)), error: null };
      if (writeDelay) await new Promise(resolve => setTimeout(resolve, writeDelay));
      if (failWrites) return { error: { message: 'network failed' } };
      if (payload.p_revision !== (row?.revision || 0)) return { error: { message: 'SAVE_CONFLICT' } };
      row = { state: payload.p_state, revision: (row?.revision || 0) + 1 };
      return { data: row.revision, error: null };
    });
    await ctx.route('**/server-config.js', route => route.fulfill({
      contentType: 'text/javascript', body: 'window.WAKPPU_SERVER={url:"https://test.supabase.co",publishableKey:"sb_publishable_test"};'
    }));
    await ctx.addInitScript(({ user, blank }) => {
      if (!localStorage.getItem('wakppu-v01')) localStorage.setItem('wakppu-v01', JSON.stringify({ ...blank, gold: 25, pets: [0] }));
      let callback;
      window.supabase = { createClient: () => ({
        auth: {
          getSession: async () => { await window.fakeCloud('session'); return { data: { session: { user: { id: user } } } }; },
          getUser: async () => ({ data: { user: { id: user } } }),
          onAuthStateChange: fn => { callback = fn; },
          signOut: async () => { callback?.('SIGNED_OUT', null); return {}; }
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => window.fakeCloud('load') }) }) }),
        rpc: (_, payload) => window.fakeCloud('save', payload)
      }) };
    }, { user, blank: blank() });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => { dialogs.push(d.message()); return acceptDialogs ? d.accept() : d.dismiss(); });
    await page.goto('https://wakppu.test/');
    const skipReady = duringLoad && await duringLoad(page) === false;
    if (!skipReady) {
      try { await page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료'); }
      catch (error) {
        console.error('계정 준비 실패:', await page.evaluate(() => ({ status: document.getElementById('cloud-status').textContent, paused: gamePaused })), errors);
        throw error;
      }
    }
    return { ctx, page };
  }
  try {
    writeDelay = 2000; sessionDelay = 4000;
    const a = await context('user-a', async page => {
      await page.waitForFunction(() => gamePaused && document.getElementById('cloud-status').textContent.includes('계정 연결을 확인'));
      const menu = await page.locator('.world-nav [data-menu="hatch-panel"]').boundingBox();
      await page.mouse.click(menu.x + menu.width / 2, menu.y + menu.height / 2);
      assert.equal(await page.locator('#account-panel').isVisible(), true);
      assert.equal(await page.locator('#cloud-status').isVisible(), true, '입력 잠금 안내는 숨기지 않습니다');
      await page.locator('#account-close').click();
      await page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버에 저장 중…');
      assert.equal(await page.evaluate(() => gamePaused), false, '계정 기록을 불러온 뒤 저장 응답을 기다려도 클릭은 잠그지 않습니다');
      await page.locator('.world-nav [data-menu="hatch-panel"]').click({ timeout: 1000 });
      assert.equal(await page.locator('#hatch-panel').isVisible(), true);
      await page.locator('#close-menu').click();
    });
    writeDelay = 0; sessionDelay = 0;
    assert.equal(row.state.gold, 25);
    assert.deepEqual(row.state.pets, [0]);
    assert.equal(dialogs.length, 0, '첫 로그인은 확인창 없이 게스트 진행을 가져옵니다');
    await a.page.evaluate(() => { state.gold = 70; state.scene = "dusk"; state.locked = [0]; save(); });
    await a.page.locator('#account-toggle').click();
    await a.page.locator('#account-save').click();
    await a.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(row.state.gold, 70);
    assert.equal(row.state.scene, "dusk");
    assert.deepEqual(row.state.locked, [0], "계정 서버에 잠금 저장");
    const b = await context('user-a');
    assert.equal(await b.page.evaluate(() => state.gold), 70);
    assert.equal(await b.page.evaluate(() => state.scene), "dusk");
    assert.deepEqual(await b.page.evaluate(() => state.locked), [0], "다른 브라우저에서 잠금 복원");
    await a.page.evaluate(() => { state.gold = 90; save(); });
    await a.page.locator('#account-save').click();
    await a.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    await b.page.evaluate(() => { state.gold = 110; save(); });
    await b.page.locator('#account-toggle').click();
    await b.page.locator('#account-save').click();
    await b.page.waitForFunction(() => !gamePaused && state.gold === 90);
    assert.equal(row.state.gold, 90);
    assert.equal(await b.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('wakppu-v01:account-backup:user-a:') && JSON.parse(localStorage.getItem(key)).gold === 110)), true);
    assert.equal(await b.page.evaluate(() => state.gold), 90);
    assert.equal(dialogs.length, 0, '저장 충돌은 확인창 없이 자동 반영');
    await b.page.locator('#account-close').click();
    await b.page.locator('.world-nav [data-menu="hatch-panel"]').click();
    await b.page.locator('#ball').click();
    assert.equal(await b.page.evaluate(() => state.cracks), 1, '자동 반영 후 게임 입력 복구');
    await b.page.locator('#close-menu').click();
    await b.page.locator('#account-toggle').click();
    console.log('PASS: 게스트 연결, 다른 브라우저 복원, 저장 충돌 자동 반영·미전송 기록 백업·입력 복구');

    failWrites = true;
    await b.page.evaluate(() => { state.gold = 120; save(); });
    await b.page.locator('#account-save').click();
    await b.page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('서버 저장 실패'));
    assert.equal(await b.page.evaluate(() => JSON.parse(localStorage.getItem('wakppu-v01:account:user-a')).gold), 120);
    failWrites = false;
    await b.page.locator('#account-save').click();
    await b.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(row.state.gold, 120);

    // 서버 기록이 이미 있어도 원래 게스트 기록을 명시적으로 복구할 수 있습니다.
    assert.match(await b.page.locator('#guest-status').textContent(), /펫 1마리.*25 G/);
    acceptDialogs = false;
    await b.page.locator('#account-import').click();
    assert.equal(row.state.gold, 120, '취소하면 계정 기록을 유지합니다');
    acceptDialogs = true; failWrites = true;
    await b.page.locator('#account-import').click();
    await b.page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('서버 저장 실패'));
    assert.equal(await b.page.evaluate(() => state.gold), 120, '가져오기 실패 시 현재 계정 진행을 유지합니다');
    assert.equal(row.state.gold, 120);
    failWrites = false;
    await b.page.locator('#account-import').click();
    await b.page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('기존 브라우저 기록 연결 완료'));
    assert.equal(row.state.gold, 25);
    assert.deepEqual(row.state.pets, [0]);
    assert.equal(await b.page.evaluate(() => state.gold), 25);
    assert.equal(await b.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('wakppu-v01:account-backup:user-a:') && JSON.parse(localStorage.getItem(key)).gold === 120)), true);
    assert.equal(await b.page.evaluate(() => JSON.parse(localStorage.getItem('wakppu-v01')).gold), 25);
    await b.page.reload();
    await b.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(await b.page.evaluate(() => state.gold), 25);
    await b.page.locator('#account-toggle').click();
    await b.page.screenshot({ path: path.join(process.env.TEST_SCREENSHOT_DIR || path.join(base, 'preview'), 'account-import-verified.png') });
    console.log('PASS: 첫 로그인 자동 가져오기, 기존 계정 가져오기 취소/실패/성공, 원본과 계정 백업 유지, 서버 복원');
    await b.page.locator('#account-logout').click();
    await b.page.waitForFunction(() => document.getElementById('account-status').textContent === '게스트로 플레이 중');
    assert.equal(await b.page.evaluate(() => state.gold), 25);
    assert.equal(await b.page.evaluate(() => JSON.parse(localStorage.getItem('wakppu-v01')).gold), 25);
    console.log('PASS: 서버 오류/브라우저 백업/재시도, 로그아웃 시 게스트 기록 분리');

    await a.ctx.close(); await b.ctx.close();
    const c = await context('user-a');
    await c.page.evaluate(() => { state.gold = 200; save(); });
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(row.state.gold, 200, '수동 버튼 없이 변경 후 자동 저장');
    await c.page.reload();
    await c.page.waitForFunction(() => !gamePaused);
    assert.equal(await c.page.evaluate(() => state.gold), 200);

    // 전송 전 즉시 새로고침: 서버 버전이 같으면 미전송 기록을 복구하고 전송합니다.
    await c.page.evaluate(() => { state.gold = 210; save(); });
    await c.page.reload();
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(await c.page.evaluate(() => state.gold), 210);
    assert.equal(row.state.gold, 210);

    failWrites = true;
    await c.page.evaluate(() => { state.gold = 220; save(); });
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('서버 저장 실패'));
    await c.page.reload();
    await c.page.waitForFunction(() => !gamePaused);
    assert.equal(await c.page.evaluate(() => state.gold), 220, '실패 후 재접속에도 미전송 기록 유지');
    failWrites = false;
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(row.state.gold, 220, '연결 복구 후 버튼 없이 자동 재시도');
    // 서버 저장은 성공했지만 응답 확인 전 종료된 경우에도 거짓 충돌을 만들지 않습니다.
    await c.page.evaluate(record => localStorage.setItem('wakppu-v01:account-pending:user-a', JSON.stringify(record)), { revision: row.revision - 1, state: row.state });
    await c.page.reload();
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(await c.page.evaluate(() => state.gold), 220);
    assert.equal(await c.page.evaluate(() => localStorage.getItem('wakppu-v01:account-pending:user-a')), null);

    // 요청 처리 중 새 변경이 생기면 후속 자동 저장을 빠뜨리지 않습니다.
    writeDelay = 800;
    await c.page.evaluate(() => { state.gold = 230; save(); });
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버에 저장 중…');
    await c.page.evaluate(() => { state.gold = 240; save(); });
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(row.state.gold, 240);
    writeDelay = 0;

    // 다른 기기에서 서버 버전이 바뀌면 오래된 미전송 기록은 자동 덮어쓰지 않습니다.
    await c.page.evaluate(() => { state.gold = 250; save(); });
    row = { state: { ...row.state, gold: 260 }, revision: row.revision + 1 };
    await c.page.reload();
    await c.page.waitForFunction(() => !gamePaused && state.gold === 260);
    assert.equal(row.state.gold, 260);
    assert.equal(await c.page.locator('#account-panel').isVisible(), false, '진입할 때 계정 창을 자동으로 열지 않음');
    assert.equal(await c.page.locator('#cloud-status').isVisible(), false);
    assert.equal(await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('wakppu-v01:account-backup:user-a:') && JSON.parse(localStorage.getItem(key)).gold === 250)), true);
    assert.equal(await c.page.evaluate(() => state.gold), 260);
    assert.equal(await c.page.evaluate(() => localStorage.getItem('wakppu-v01:account-pending:user-a')), null);
    await c.page.reload();
    await c.page.waitForFunction(() => !gamePaused && state.gold === 260);
    assert.equal(await c.page.locator('#account-panel').isVisible(), false, '재진입에도 같은 충돌이 반복되지 않음');

    // 충돌 뒤 서버 조회에 실패하면 화면/백업을 유지하고 복구 후 자동 반영합니다.
    failReads = true;
    row = { state: { ...row.state, gold: 280 }, revision: row.revision + 1 };
    await c.page.evaluate(() => { state.gold = 270; save(); });
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('불러오지 못했'));
    assert.equal(await c.page.evaluate(() => gamePaused), true);
    assert.equal(await c.page.evaluate(() => state.gold), 270);
    assert.equal(row.state.gold, 280);
    assert.equal(await c.page.evaluate(() => JSON.parse(localStorage.getItem('wakppu-v01:account-pending:user-a')).state.gold), 270);
    failReads = false;
    await c.page.waitForFunction(() => !gamePaused && state.gold === 280);
    assert.equal(await c.page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('wakppu-v01:account-backup:user-a:') && JSON.parse(localStorage.getItem(key)).gold === 270)), true);
    await c.page.locator('#account-close').click();

    // 오래된 백업은 골드 외에도 펫/잠금/장착/볼/도감 전체가 보존됩니다.
    const pendingState = { ...row.state, gold: 290, pets: [0, 1], locked: [1], equipped: [1], discovered: [0, 1], stock: [0, 3, 2, 1], cracks: 4 };
    await c.page.evaluate(record => window.wakppuGame.useSave(record, 'user-a'), pendingState);
    row = { ...row, revision: row.revision + 1 };
    await c.page.reload();
    await c.page.waitForFunction(() => !gamePaused && state.gold === 280);
    const preserved = await c.page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('wakppu-v01:account-backup:user-a:')).map(key => JSON.parse(localStorage.getItem(key))).find(record => record.gold === 290));
    assert.deepEqual(preserved, pendingState);

    // 백업 공간이 없을 때는 현재 기록과 pending을 대체하지 않습니다.
    await c.page.evaluate(record => window.wakppuGame.useSave(record, 'user-a'), pendingState);
    row = { ...row, revision: row.revision + 1 };
    await c.ctx.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('wakppu-v01:account-backup:')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await c.page.reload();
    await c.page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('불러오지 못했'));
    assert.equal(await c.page.evaluate(() => gamePaused), true);
    assert.equal(await c.page.evaluate(() => JSON.parse(localStorage.getItem('wakppu-v01:account-pending:user-a')).state.gold), 290);
    assert.equal(row.state.gold, 280);
    console.log('PASS: 버튼 없는 자동 저장, 즉시 재접속 복구, 서버 오류 후 재접속/자동 재시도, 전송 중 변경, 다른 기기 충돌 보호');
    await c.ctx.close();
    sessionDelay = 16000;
    const stalled = await context('user-a', async page => {
      await page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('서버 연결 실패'), null, { timeout: 20000 });
      assert.equal(await page.evaluate(() => gamePaused), false);
      await page.locator('#account-close').click();
      await page.locator('.world-nav [data-menu="hatch-panel"]').click();
      await page.locator('#ball').click();
      assert.equal(await page.evaluate(() => state.cracks), 1, '세션 조회가 멈춰도 무한 입력 잠금 없이 게스트 조작 가능');
      return false;
    });
    await stalled.ctx.close();
    console.log('PASS: 세션 조회 지연 제한과 게스트 클릭 복구');
    sessionDelay = 0;
    // 바로 장착도 자동 저장되고 다른 브라우저에서 같은 구성으로 복원됩니다.
    row = { state: { ...blank(), catalogVersion: 2, lockVersion: 1, pets: [0, 0, 0], equipped: [0, 1, 2], locked: [0, 1, 2] }, revision: 1 };
    const quick = await context('user-quick-equip');
    await quick.page.locator('.world-nav [data-menu="hatch-panel"]').click();
    await quick.page.evaluate(() => { rollPet = () => 0; state.cracks = 11; renderBall(); });
    await quick.page.locator('#ball').click();
    await quick.page.waitForFunction(() => !hatching);
    await quick.page.locator('#hatch-equip').click();
    await quick.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.deepEqual(row.state.equipped, [0, 1, 3]);
    assert.deepEqual(row.state.locked, [0, 1, 2]);
    await quick.ctx.close();
    const restored = await context('user-quick-equip');
    assert.deepEqual(await restored.page.evaluate(() => state.equipped), [0, 1, 3]);
    assert.deepEqual(await restored.page.evaluate(() => state.locked), [0, 1, 2]);
    await restored.ctx.close();
    console.log('PASS: 바로 장착 후 버튼 없는 계정 자동 저장·다른 브라우저 복원·교체한 펫 잠금 유지');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
