// 실제 브라우저에서 서버 응답을 모의합니다. 실제 Supabase 권한 검증은 별도입니다.
const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const blank = () => ({ version: 1, gold: 0, pets: [], equipped: [], discovered: [], stock: [0,0,0,0], selected: 0, cracks: 0 });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let row = null, failWrites = false;
  const errors = [], dialogs = [];
  let acceptDialogs = true;
  async function context(user) {
    const ctx = await browser.newContext();
    // 로컬 네트워크 권한 없이 저장소 파일을 브라우저 응답으로 제공합니다.
    await ctx.route('https://wakppu.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      const file = path.join(base, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!file.startsWith(base + path.sep)) return route.fulfill({ status: 403 });
      try { return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); }
      catch { return route.fulfill({ status: 404 }); }
    });
    await ctx.exposeBinding('fakeCloud', async (_, action, payload) => {
      if (action === 'load') return { data: row && JSON.parse(JSON.stringify(row)), error: null };
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
          getSession: async () => ({ data: { session: { user: { id: user } } } }),
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
    await page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    return { ctx, page };
  }
  try {
    const a = await context('user-a');
    assert.equal(row.state.gold, 25);
    assert.deepEqual(row.state.pets, [0]);
    assert.equal(dialogs.length, 0, '첫 로그인은 확인창 없이 게스트 진행을 가져옵니다');
    await a.page.evaluate(() => { state.gold = 70; save(); });
    await a.page.locator('#account-toggle').click();
    await a.page.locator('#account-save').click();
    await a.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    assert.equal(row.state.gold, 70);
    const b = await context('user-a');
    assert.equal(await b.page.evaluate(() => state.gold), 70);
    await a.page.evaluate(() => { state.gold = 90; save(); });
    await a.page.locator('#account-save').click();
    await a.page.waitForFunction(() => document.getElementById('cloud-status').textContent === '계정 서버 저장 완료');
    await b.page.evaluate(() => { state.gold = 110; save(); });
    await b.page.locator('#account-toggle').click();
    await b.page.locator('#account-save').click();
    await b.page.waitForFunction(() => document.getElementById('cloud-status').textContent.includes('다른 브라우저'));
    assert.equal(row.state.gold, 90);
    assert.equal(await b.page.evaluate(() => gamePaused), true);
    await b.page.locator('#account-reload').click();
    await b.page.waitForFunction(() => !gamePaused);
    assert.equal(await b.page.evaluate(() => state.gold), 90);
    console.log('PASS: 게스트 연결, 계정 저장, 다른 브라우저 복원, 저장 충돌 차단/재로드');

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
    await b.page.screenshot({ path: path.join(base, 'preview/account-import-verified.png') });
    console.log('PASS: 첫 로그인 자동 가져오기, 기존 계정 가져오기 취소/실패/성공, 원본과 계정 백업 유지, 서버 복원');
    await b.page.locator('#account-logout').click();
    await b.page.waitForFunction(() => document.getElementById('account-status').textContent === '게스트로 플레이 중');
    assert.equal(await b.page.evaluate(() => state.gold), 25);
    assert.equal(await b.page.evaluate(() => JSON.parse(localStorage.getItem('wakppu-v01')).gold), 25);
    console.log('PASS: 서버 오류/브라우저 백업/재시도, 로그아웃 시 게스트 기록 분리');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
