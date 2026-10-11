"use strict";

// 개인 클라우드 저장. 게임 결과 검증과 공식 랭킹은 별도 서버 규칙이 필요합니다.
(function () {
  const game = window.wakppuGame;
  const el = id => document.getElementById(id);
  const config = window.WAKPPU_SERVER || {};
  let client, userId = null, revision = 0, ready = false, conflicted = false;
  let inFlight = null, lastUploaded = "", cloudMessage = "";
  let switching = false;

  function status(text) {
    cloudMessage = text;
    el("cloud-status").textContent = text;
    if (userId) el("save-status").textContent = text;
  }
  function panel(open) {
    el("account-panel").hidden = !open;
    el("account-toggle").setAttribute("aria-expanded", String(open));
  }
  function pause(value) {
    game.pause(value);
    document.querySelector("main").inert = value;
    document.querySelector(".world-nav").inert = value;
    el("reset").disabled = value;
  }
  function fail(error) {
    if (String(error?.message || error).includes("SAVE_CONFLICT")) {
      conflicted = true; ready = false; pause(true); panel(true);
      status("다른 브라우저에 새 기록이 있어요. 서버 기록을 다시 불러오세요.");
    } else {
      status("서버 저장 실패 · 이 브라우저에만 보관 중입니다. 연결 후 다시 저장하세요.");
    }
  }

  async function upload() {
    if (inFlight) return inFlight;
    if (!client || !userId || !ready || conflicted || switching) return false;
    const owner = userId, payload = game.snapshot(), encoded = JSON.stringify(payload);
    if (encoded === lastUploaded) { status("계정 서버 저장 완료"); return true; }
    status("계정 서버에 저장 중…");
    inFlight = (async () => {
      try {
        const { data, error } = await client.rpc("save_game", { p_state: payload, p_revision: revision });
        if (error) throw error;
        if (owner !== userId) return false;
        revision = Number(data); lastUploaded = encoded;
        status(JSON.stringify(game.snapshot()) === encoded ? "계정 서버 저장 완료" : "변경사항 저장 대기 중");
        return true;
      } catch (error) { if (owner === userId) fail(error); return false; }
      finally { inFlight = null; }
    })();
    return inFlight;
  }

  async function loadUser(user, force = false) {
    if (switching || (!force && user.id === userId)) return;
    switching = true; ready = false; pause(true);
    if (inFlight) await inFlight;
    userId = user.id; conflicted = false;
    el("account-status").textContent = "로그인됨 · 내 계정";
    el("account-login").hidden = true;
    el("account-actions").hidden = false;
    status("계정 진행상태를 불러오는 중…");
    try {
      const { data, error } = await client.from("game_saves").select("state, revision").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (data && data.state?.version !== 1) throw new Error("Unsupported save version");
      let incoming;
      if (data) {
        revision = Number(data.revision); incoming = data.state;
        // 서버가 원본입니다. 이전 기기의 캐시를 자동 업로드하지 않습니다.
        lastUploaded = JSON.stringify(incoming);
      } else {
        revision = 0; lastUploaded = "";
        const guest = game.guestSave();
        const hasProgress = guest.pets.length || guest.gold || guest.cracks || guest.discovered.length || guest.stock.some(Boolean);
        incoming = hasProgress && confirm("새 계정입니다. 이 브라우저의 게스트 진행상태를 계정에 연결할까요? 취소하면 새 게임으로 시작합니다.")
          ? guest : game.freshSave();
      }
      game.useSave(incoming, userId);
      ready = true; switching = false;
      status(data ? "계정 진행상태 불러오기 완료" : "첫 계정 저장 준비 중…");
      await upload();
      if (ready) pause(false);
    } catch {
      ready = false; switching = false; panel(true);
      status("계정 기록을 불러오지 못했어요. 다시 불러오거나 로그아웃해 주세요.");
    }
  }

  async function guestMode() {
    ready = false; pause(true);
    if (inFlight) await inFlight;
    userId = null; revision = 0; lastUploaded = ""; conflicted = false;
    game.useSave(game.guestSave());
    el("account-status").textContent = "게스트로 플레이 중";
    el("account-login").hidden = false;
    el("account-actions").hidden = true;
    status("진행상태는 이 브라우저에 저장됩니다.");
    pause(false);
  }

  window.wakppuCloud = {
    changed() {
      if (!userId) return;
      const dirty = ready && JSON.stringify(game.snapshot()) !== lastUploaded;
      if (dirty && !inFlight) status("변경사항 저장 대기 중 · 이 브라우저에 보관됨");
      else el("save-status").textContent = cloudMessage;
    }
  };
  el("account-toggle").addEventListener("click", () => panel(el("account-panel").hidden));
  el("account-close").addEventListener("click", () => panel(false));
  el("account-save").addEventListener("click", upload);
  el("account-reload").addEventListener("click", async () => {
    if (!client || !userId || switching) return;
    if (!confirm("서버 기록을 불러오면 현재 화면의 미저장 진행은 대체됩니다. 계속할까요?")) return;
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) { status("로그인 확인 실패 · 다시 로그인해 주세요."); return; }
    await loadUser(data.user, true);
  });
  el("account-logout").addEventListener("click", async () => {
    if (switching) return;
    pause(true);
    if (ready) {
      let saved = await upload();
      if (saved && JSON.stringify(game.snapshot()) !== lastUploaded) saved = await upload();
      if (!saved && !confirm("서버에 저장되지 않은 진행이 있습니다. 이 브라우저의 계정 백업은 남지만, 다음 로그인은 서버 기록에서 시작합니다. 로그아웃할까요?")) {
        pause(conflicted); return;
      }
    }
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) { status("로그아웃 실패 · 다시 시도하세요."); pause(!ready); return; }
    await guestMode();
  });
  el("account-login").addEventListener("click", async () => {
    if (!client) { status("서버 설정이 필요합니다. SERVER_SETUP.md를 확인해 주세요."); return; }
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    if (error) status("로그인 시작 실패 · Google 로그인 설정을 확인하세요.");
  });

  async function initialize() {
    if (!config.url || !config.publishableKey) {
      status("서버 준비 중 · 현재는 브라우저에 저장됩니다."); return;
    }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url) || config.publishableKey.startsWith("sb_secret_")) {
      status("공개 서버 설정을 확인하세요."); return;
    }
    if (location.protocol === "file:") { status("계정 로그인은 웹 주소에서 사용할 수 있어요."); return; }
    pause(true);
    try {
      if (!window.supabase) await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.js";
        const timer = setTimeout(() => reject(new Error("SDK timeout")), 15000);
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); reject(new Error("SDK unavailable")); };
        document.head.appendChild(script);
      });
      client = window.supabase.createClient(config.url, config.publishableKey, {
        global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) }
      });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session?.user) await loadUser(data.session.user);
      else pause(false);
      client.auth.onAuthStateChange((event, session) => {
        // Supabaseの認証コールバック内では追加の非同期APIを待ちません。
        if (session?.user && session.user.id !== userId) setTimeout(() => loadUser(session.user), 0);
        else if (event === "SIGNED_OUT" && userId) setTimeout(guestMode, 0);
      });
      setInterval(upload, 10000);
      window.addEventListener("online", upload);
      document.addEventListener("visibilitychange", () => { if (document.hidden) upload(); });
      window.addEventListener("beforeunload", event => {
        if (userId && JSON.stringify(game.snapshot()) !== lastUploaded) { event.preventDefault(); event.returnValue = ""; }
      });
    } catch {
      pause(false); status("서버 연결 실패 · 게스트 저장으로 플레이합니다.");
    }
  }
  initialize();
})();
