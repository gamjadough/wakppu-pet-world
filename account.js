"use strict";

// 개인 클라우드 저장. 게임 결과 검증과 공식 랭킹은 별도 서버 규칙이 필요합니다.
(function () {
  const game = window.wakppuGame;
  const el = id => document.getElementById(id);
  const config = window.WAKPPU_SERVER || {};
  let client, userId = null, revision = 0, ready = false, conflicted = false;
  let inFlight = null, lastUploaded = "", cloudMessage = "";
  let switching = false, syncNeeded = false;
  // 정상 저장은 조용히 진행하고, 계정 창에는 해결이 필요한 문제만 표시합니다.
  el("save-status").hidden = true;
  el("cloud-status").hidden = true;
  let saveTimer = null;
  const pendingKey = () => `wakppu-v01:account-pending:${userId}`;
  function rememberPending() {
    if (!userId || !ready || switching || conflicted) return;
    try {
      const state = game.snapshot();
      if (JSON.stringify(state) === lastUploaded) localStorage.removeItem(pendingKey());
      else localStorage.setItem(pendingKey(), JSON.stringify({ revision, state }));
    } catch { status("브라우저 백업 실패 · 서버 자동 저장을 확인해 주세요."); }
  }
  function scheduleSave() {
    if (saveTimer || !ready || switching || conflicted) return;
    // 수익이 계속 변해도 타이머를 뒤로 미루지 않습니다.
    saveTimer = setTimeout(() => { saveTimer = null; upload(); }, 1000);
  }
  async function readSession() {
    let timer;
    try {
      return await Promise.race([
        client.auth.getSession(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Session timeout")), 15000); })
      ]);
    } finally { clearTimeout(timer); }
  }

  function hasProgress(save) {
    return !!(save.pets.length || save.gold || save.cracks || save.discovered.length || save.stock.some(Boolean));
  }
  function guestInfo() {
    const guest = game.guestSave();
    el("guest-status").textContent = hasProgress(guest)
      ? `이 브라우저의 기존 기록: 펫 ${guest.pets.length}마리 · ${Math.floor(guest.gold).toLocaleString("ko-KR")} G`
      : "이 브라우저에 기존 게스트 진행상태가 없습니다.";
    el("account-import").hidden = !hasProgress(guest);
  }

  function status(text) {
    cloudMessage = text;
    el("cloud-status").textContent = text;
    el("cloud-status").hidden = !/실패|다른 브라우저|못했|불가/.test(text);
    if (userId) el("save-status").textContent = text;
  }
  function panel(open) {
    if (open) guestInfo();
    el("account-panel").hidden = !open;
    el("account-toggle").setAttribute("aria-expanded", String(open));
  }
  function pause(value) {
    game.pause(value);
    document.querySelector("main").inert = value;
    document.querySelector(".world-nav").inert = value;
    el("reset").disabled = value;
  }
  function backupConflict(state) {
    // 최신 서버 기록으로 전환하기 전에 미전송 진행을 별도로 보존합니다.
    localStorage.setItem(`wakppu-v01:account-backup:${userId}:${Date.now()}:${crypto.randomUUID()}`, JSON.stringify(state));
  }
  function fail(error) {
    if (String(error?.message || error).includes("UPDATE_REQUIRED")) {
      conflicted = true; ready = false; pause(true); panel(true);
      status("새 친구를 불러오려면 페이지를 새로고침해 주세요. 서버 기록은 보관되어 있습니다.");
      el("cloud-status").hidden = false;
      return;
    }
    if (String(error?.message || error).includes("SAVE_CONFLICT")) {
      conflicted = true; ready = false; pause(true);
      try {
        backupConflict(game.snapshot());
        syncNeeded = true;
        status("최신 계정 진행상태를 반영하는 중…");
        // 현재 저장 요청이 종료된 다음 조회해 inFlight 대기를 피합니다.
        setTimeout(upload, 0);
      } catch {
        panel(true);
        status("브라우저 백업 실패 · 현재 기록을 보존하기 위해 동기화를 멈췄어요. 저장 공간을 확인한 뒤 다시 불러오세요.");
      }
    } else {
      status("서버 저장 실패 · 브라우저에 보관 중 · 자동 재시도합니다.");
    }
  }

  async function upload() {
    if (inFlight) return inFlight;
    if (syncNeeded && userId && !switching) return loadUser({ id: userId }, true);
    if (!client || !userId || !ready || conflicted || switching) return false;
    const owner = userId, payload = game.snapshot(), encoded = JSON.stringify(payload);
    rememberPending();
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
      finally {
        inFlight = null;
        rememberPending();
        if (owner === userId && JSON.stringify(game.snapshot()) !== encoded && lastUploaded === encoded) scheduleSave();
      }
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
      if (data && (data.state?.version !== 1 || data.state?.catalogVersion > 2)) throw new Error("Unsupported save version");
      let pending = null;
      if (!force) {
        try { pending = JSON.parse(localStorage.getItem(pendingKey())); } catch { /* 손상된 백업은 서버 기록으로 시작합니다. */ }
      }
      if (!Number.isSafeInteger(pending?.revision) || pending.revision < 0 || pending.state?.version !== 1) pending = null;
      let incoming;
      if (data) {
        revision = Number(data.revision); incoming = data.state;
        // 서버가 원본입니다. 이전 기기의 캐시를 자동 업로드하지 않습니다.
        lastUploaded = JSON.stringify(incoming);
      } else {
        revision = 0; lastUploaded = "";
        const guest = game.guestSave();
        // 첫 계정 저장은 기존 브라우저 기록을 그대로 이어갑니다. 게스트 원본은 유지합니다.
        incoming = guest;
      }
      if (pending && pending.revision === revision) incoming = pending.state;
      else if (pending && JSON.stringify(pending.state) !== JSON.stringify(data?.state)) {
        // 종료 직전 남은 백업이 오래되었어도 진입을 막지 않습니다.
        // 백업에 실패하면 useSave 전에 중단하여 기존 기록을 보존합니다.
        backupConflict(pending.state);
      }
      game.useSave(incoming, userId);
      syncNeeded = false;
      ready = true; switching = false;
      rememberPending();
      status(data ? "계정 진행상태 불러오기 완료" : "첫 계정 저장 준비 중…");
      // 기록 전환이 끝났으면 서버 저장은 백그라운드에서 처리합니다.
      pause(false);
      await upload();
    } catch {
      ready = false; switching = false; panel(true);
      status("계정 기록을 불러오지 못했어요. 다시 불러오거나 로그아웃해 주세요.");
    }
  }

  async function guestMode() {
    ready = false; pause(true);
    if (inFlight) await inFlight;
    userId = null; revision = 0; lastUploaded = ""; conflicted = false; syncNeeded = false;
    game.useSave(game.guestSave());
    el("account-status").textContent = "게스트로 플레이 중";
    el("account-login").hidden = false;
    el("account-actions").hidden = true;
    status("진행상태는 이 브라우저에 저장됩니다.");
    pause(false);
  }

  window.wakppuCloud = {
    blocked() {
      // 자동 저장 로그는 숨기지만, 입력이 잠긴 이유와 해결 버튼은 숨기지 않습니다.
      panel(true);
      el("cloud-status").hidden = false;
    },
    changed() {
      if (!userId) return;
      const dirty = ready && JSON.stringify(game.snapshot()) !== lastUploaded;
      if (dirty && !switching && !conflicted) {
        rememberPending(); scheduleSave();
        if (!inFlight) status("자동 저장 대기 중 · 이 브라우저에 보관됨");
      }
      else el("save-status").textContent = cloudMessage;
    }
  };
  el("account-toggle").addEventListener("click", () => panel(el("account-panel").hidden));
  el("account-close").addEventListener("click", () => panel(false));
  el("account-save").addEventListener("click", upload);
  el("account-import").addEventListener("click", async () => {
    if (!client || !userId || !ready || switching || conflicted) return;
    const guest = game.guestSave();
    if (!hasProgress(guest)) { guestInfo(); return; }
    if (!confirm(`기존 브라우저 기록(펫 ${guest.pets.length}마리 · ${Math.floor(guest.gold)} G)으로 계정 진행상태를 교체할까요? 합치지 않습니다. 현재 계정 기록은 이 브라우저에 백업하고, 기존 게스트 원본도 유지합니다.`)) return;
    switching = true; pause(true);
    if (inFlight) await inFlight;
    if (!ready || conflicted) { switching = false; pause(conflicted); return; }
    try {
      // 백업이 실패하면 서버 기록을 교체하지 않습니다.
      localStorage.setItem(`wakppu-v01:account-backup:${userId}:${Date.now()}`, JSON.stringify(game.snapshot()));
      const { data, error } = await client.rpc("save_game", { p_state: guest, p_revision: revision });
      if (error) throw error;
      revision = Number(data); lastUploaded = JSON.stringify(guest);
      game.useSave(guest, userId);
      status("기존 브라우저 기록 연결 완료 · 계정 서버 저장 완료");
    } catch (error) { fail(error); }
    finally { switching = false; rememberPending(); pause(conflicted); guestInfo(); }
  });
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
    status("계정 연결을 확인하는 중… 잠시 기다려 주세요.");
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
      const { data, error } = await readSession();
      if (error) throw error;
      if (data.session?.user) await loadUser(data.session.user);
      else pause(false);
      client.auth.onAuthStateChange((event, session) => {
        // Supabaseの認証コールバック内では追加の非同期APIを待ちません。
        if (session?.user && session.user.id !== userId) setTimeout(() => loadUser(session.user), 0);
        else if (event === "SIGNED_OUT" && userId) setTimeout(guestMode, 0);
      });
      setInterval(upload, 5000);
      window.addEventListener("online", upload);
      document.addEventListener("visibilitychange", () => { if (document.hidden) upload(); });
      window.addEventListener("pagehide", () => { rememberPending(); upload(); });
      window.addEventListener("beforeunload", event => {
        if (userId && JSON.stringify(game.snapshot()) !== lastUploaded) { event.preventDefault(); event.returnValue = ""; }
      });
    } catch {
      pause(false); status("서버 연결 실패 · 게스트 저장으로 플레이합니다."); panel(true);
    }
  }
  initialize();
})();
