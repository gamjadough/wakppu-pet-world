"use strict";
// 서버가 반환하는 공개 필드만 텍스트로 표시합니다. 저장 기록이나 계정 ID는 받지 않습니다.
(() => {
  const el = id => document.getElementById(id);
  let request = 0, busy = false, profile = null;
  function controls() {
    const ready = !!window.wakppuCloud?.rankingReady();
    el("ranking-form").hidden = !ready;
    el("ranking-guest").hidden = ready;
    el("ranking-join").disabled = busy;
    el("ranking-leave").disabled = busy;
    el("ranking-leave").hidden = !profile;
    el("ranking-join").textContent = profile ? "별칭 변경" : "랭킹 참여 · 별칭 공개";
  }
  function draw(data) {
    if (!data || !Array.isArray(data.top) || !Number.isSafeInteger(data.total)) throw new Error("INVALID_RESPONSE");
    profile = window.wakppuCloud?.rankingReady() ? data.me : null;
    el("ranking-list").replaceChildren();
    for (const row of data.top.slice(0, 100)) {
      if (!Number.isFinite(Number(row.income)) || !Number.isSafeInteger(Number(row.rank)) || typeof row.nickname !== "string") throw new Error("INVALID_RESPONSE");
      const li = document.createElement("li"); li.dataset.me = String(!!row.is_me);
      for (const [text, cls] of [[`${row.rank}위`, "rank-number"], [row.nickname + (row.is_me ? " · 나" : ""), "rank-name"], [`${format(Number(row.income))} G/s`, "rank-income"]]) {
        const span = document.createElement("span"); span.className = cls; span.textContent = text; li.append(span);
      }
      el("ranking-list").append(li);
    }
    el("ranking-status").textContent = data.total ? `참여 ${data.total}명 · 방금 갱신` : "아직 참여한 정원사가 없어요. 첫 순위에 도전해 보세요!";
    el("ranking-me").textContent = profile ? `내 순위 ${profile.rank}위 · ${format(Number(profile.income))} G/s · ${profile.nickname}` : "참여하면 내 순위가 여기에 표시돼요.";
    if (profile && document.activeElement !== el("ranking-name")) el("ranking-name").value = profile.nickname;
    controls();
  }
  async function refresh() {
    if (busy) return;
    const token = ++request;
    controls(); el("ranking-refresh").disabled = true;
    el("ranking-status").textContent = "랭킹을 불러오는 중…";
    try {
      const data = await window.wakppuCloud?.leaderboard();
      if (token === request) draw(data);
    } catch {
      if (token === request) el("ranking-status").textContent = "랭킹을 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요.";
    } finally { if (token === request) el("ranking-refresh").disabled = false; }
  }
  async function change(nickname) {
    if (busy || !window.wakppuCloud?.rankingReady()) return;
    busy = true; const token = ++request; controls(); el("ranking-refresh").disabled = true;
    el("ranking-status").textContent = "랭킹 참여 정보를 저장하는 중…";
    try {
      const data = await window.wakppuCloud.rankingProfile(nickname);
      // 계정 전환 중 시작된 요청의 응답은 화면에 적용하지 않습니다.
      if (token === request && window.wakppuCloud.rankingReady()) draw(data);
    } catch (error) {
      const reason = String(error?.message || "");
      el("ranking-status").textContent = reason.includes("NAME_TAKEN") ? "이미 사용 중인 별칭이에요." : reason.includes("INVALID_NAME") ? "별칭은 한글·영문·숫자·공백·밑줄·하이픈 2~16자로 입력해 주세요." : "랭킹 변경 실패 · 기존 참여 정보와 게임 기록은 유지돼요. 다시 시도해 주세요.";
    } finally { busy = false; controls(); el("ranking-refresh").disabled = false; }
  }
  el("ranking-refresh").addEventListener("click", refresh);
  el("ranking-form").addEventListener("submit", event => { event.preventDefault(); change(el("ranking-name").value.trim()); });
  el("ranking-leave").addEventListener("click", () => change(null));
  el("ranking-login").addEventListener("click", () => { closeMenu(); el("account-toggle").click(); });
  window.addEventListener("wakppu-account", () => {
    ++request; profile = null; el("ranking-me").textContent = "계정 정보를 확인하고 있어요.";
    el("ranking-list").replaceChildren(); el("ranking-name").value = "";
    el("ranking-refresh").disabled = false; controls();
    if (activeMenu === "ranking-panel") refresh();
  });
  window.wakppuRanking = { refresh };
  setInterval(() => { if (!document.hidden && activeMenu === "ranking-panel") refresh(); }, 15000);
  controls();
})();
