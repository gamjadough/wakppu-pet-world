"use strict";

// 설정만 바꾸면 가격, 확률, 펫 능력을 쉽게 조정할 수 있습니다.
const SAVE_KEY = "wakppu-v01";
const SLOT_LIMIT = 3;
const RARITIES = ["일반", "희귀", "초희귀", "영웅", "신화"];
const COLORS = ["#aab9cb", "#74d8ae", "#7caaff", "#c592ff", "#ffd27d"];
const BALLS = [
  { name: "기본 왁뿌볼", price: 0, clicks: 12, odds: [70, 22, 6, 1.8, 0.2] },
  { name: "오로라 왁뿌볼", price: 50, clicks: 20, odds: [40, 35, 18, 6, 1] },
  { name: "네뷸라 왁뿌볼", price: 300, clicks: 30, odds: [20, 35, 28, 14, 3] },
  { name: "태양 왁뿌볼", price: 1500, clicks: 45, odds: [10, 25, 35, 23, 7] }
];
const PETS = [
  { name: "새싹뿌", rarity: 0, rate: 1, bonus: 0.2, power: 0, ability: "광합성 · 생산 +0.2 G/s" },
  { name: "돌멩뿌", rarity: 0, rate: 1, bonus: 0, power: 1, ability: "단단한 손 · 클릭 위력 +1" },
  { name: "물방뿌", rarity: 1, rate: 3, bonus: 1, power: 0, ability: "물의 흐름 · 생산 +1 G/s" },
  { name: "바람뿌", rarity: 1, rate: 3, bonus: 0, power: 2, ability: "질풍 · 클릭 위력 +2" },
  { name: "달빛뿌", rarity: 2, rate: 8, bonus: 3, power: 0, ability: "달빛 수확 · 생산 +3 G/s" },
  { name: "번개뿌", rarity: 2, rate: 8, bonus: 0, power: 3, ability: "전격 · 클릭 위력 +3" },
  { name: "별무리뿌", rarity: 3, rate: 20, bonus: 8, power: 0, ability: "별의 축복 · 생산 +8 G/s" },
  { name: "용암뿌", rarity: 3, rate: 20, bonus: 0, power: 5, ability: "화산의 힘 · 클릭 위력 +5" },
  { name: "태양뿌", rarity: 4, rate: 60, bonus: 25, power: 0, ability: "황금 햇살 · 생산 +25 G/s" },
  { name: "우주뿌", rarity: 4, rate: 60, bonus: 0, power: 8, ability: "차원 균열 · 클릭 위력 +8" }
];
const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1, notation: n >= 1000000 ? "compact" : "standard" }).format(n);
const defaults = () => ({ version: 1, gold: 0, pets: [], equipped: [], discovered: [], stock: [0, 0, 0, 0], selected: 0, cracks: 0 });
const integer = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
let storageOK = true;

// 저장 데이터는 외부 입력처럼 검증합니다. 잘못된 필드는 기본값으로 복구합니다.
function load() {
  const clean = defaults();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return clean;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return clean;
    if (Number.isFinite(data.gold) && data.gold >= 0) clean.gold = Math.min(data.gold, 1e15);
    if (Array.isArray(data.pets)) clean.pets = data.pets.filter(p => integer(p, PETS.length - 1)).slice(0, 10000);
    if (Array.isArray(data.equipped)) clean.equipped = [...new Set(data.equipped)].filter(i => integer(i, clean.pets.length - 1)).slice(0, SLOT_LIMIT);
    const discoveries = Array.isArray(data.discovered) ? data.discovered.filter(p => integer(p, PETS.length - 1)) : [];
    clean.discovered = [...new Set([...discoveries, ...clean.pets])];
    if (Array.isArray(data.stock)) clean.stock = BALLS.map((_, i) => i > 0 && integer(data.stock[i], 9999) ? data.stock[i] : 0);
    if (integer(data.selected, BALLS.length - 1) && (data.selected === 0 || clean.stock[data.selected] > 0)) clean.selected = data.selected;
    if (integer(data.cracks, BALLS[clean.selected].clicks - 1)) clean.cracks = data.cracks;
    return clean;
  } catch { return clean; }
}
let state = load();
let hatching = false;
let hatchTimer;
let lastTick = performance.now();

// 상태 계산과 화면 갱신을 분리합니다. 인벤토리 번호로 같은 종류도 구분합니다.
function equippedPets() { return state.equipped.map(index => PETS[state.pets[index]]); }
function income() { return equippedPets().reduce((sum, p) => sum + p.rate + p.bonus, 0); }
function clickPower() { return 1 + equippedPets().reduce((sum, p) => sum + p.power, 0); }
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); storageOK = true; }
  catch { storageOK = false; }
  $("save-status").textContent = storageOK ? "브라우저에 자동 저장 · 저장 완료" : "저장 불가 · 현재 플레이는 가능하지만 새로고침 시 사라질 수 있어요";
}
function message(text) { $("result").textContent = text; }
function renderStats() {
  $("gold").textContent = `${format(state.gold)} G`;
  $("shop-gold").textContent = `${format(state.gold)} G`;
  $("income").textContent = `${format(income())} G/s`;
  $("price").textContent = BALLS[state.selected].price ? `${format(BALLS[state.selected].price)} G` : "무료";
  $("discovered").textContent = `${state.discovered.length} / ${PETS.length}`;
  document.querySelectorAll("[data-buy]").forEach(btn => { btn.disabled = hatching || state.gold < BALLS[Number(btn.dataset.buy)].price || state.stock[Number(btn.dataset.buy)] >= 9999; });
}
function renderBall() {
  const ball = BALLS[state.selected];
  $("ball-name").textContent = ball.name;
  $("ball").dataset.tier = state.selected;
  $("ball").dataset.crack = Math.min(4, Math.ceil(state.cracks / ball.clicks * 4));
  $("ball").disabled = hatching;
  $("progress").max = ball.clicks;
  $("progress").value = state.cracks;
  $("click-label").textContent = `균열 ${state.cracks} / ${ball.clicks}`;
  $("power").textContent = `클릭 위력 ${clickPower()}`;
  $("queue").innerHTML = BALLS.map((b, i) => `<button data-select="${i}" class="${state.selected === i ? "selected" : ""}" aria-pressed="${state.selected === i}" ${hatching || (i > 0 && !state.stock[i]) ? "disabled" : ""}>${b.name} · ${i === 0 ? "∞" : state.stock[i]}</button>`).join("");
}
function petCard(petId, index, codex = false) {
  const p = PETS[petId];
  const known = !codex || state.discovered.includes(petId);
  const equipped = !codex && state.equipped.includes(index);
  return `<article class="pet-card ${equipped ? "equipped" : ""} ${known ? "" : "unknown"}" style="--rarity:${COLORS[p.rarity]}"><div class="pet-art" aria-hidden="true"></div><span class="rarity">${RARITIES[p.rarity]}</span><h3>${known ? p.name : "???"}</h3><p class="rate">${known ? `${format(p.rate + p.bonus)} G/s` : "미발견"}</p><p>${known ? p.ability : "부화하여 비밀을 발견하세요"}</p>${codex ? "" : `<button data-equip="${index}" ${!equipped && state.equipped.length >= SLOT_LIMIT ? "disabled" : ""}>${equipped ? "장착 해제" : "장착하기"}</button>`}</article>`;
}
function renderPets() {
  $("slots").textContent = `장착 ${state.equipped.length} / ${SLOT_LIMIT}`;
  $("pet-count").textContent = `${state.pets.length}마리`;
  $("inventory").innerHTML = state.pets.length ? state.pets.map((id, i) => petCard(id, i)).join("") : '<p class="empty">아직 펫이 없어요. 첫 왁뿌볼을 깨 보세요!</p>';
  $("codex").innerHTML = PETS.map((_, id) => petCard(id, id, true)).join("");
  world.sync(state.equipped.map(index => {
    const id = state.pets[index], pet = PETS[id];
    return { index, id, name: pet.name, color: COLORS[pet.rarity] };
  }));
  if (selectedWorldPet !== null && !state.equipped.includes(selectedWorldPet)) {
    selectedWorldPet = null; $("pet-info").hidden = true;
  }
}
function render() { renderStats(); renderBall(); renderPets(); }

function rollPet(tier) {
  let roll = Math.random() * 100;
  let rarity = 4;
  for (let i = 0; i < 5; i++) { roll -= BALLS[tier].odds[i]; if (roll < 0) { rarity = i; break; } }
  const pool = PETS.map((p, id) => ({ p, id })).filter(item => item.p.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)].id;
}
function hatch() {
  // 잠금을 먼저 걸고 보상과 소모를 한 번에 저장합니다. 애니메이션은 화면 효과입니다.
  hatching = true;
  const petId = rollPet(state.selected);
  const p = PETS[petId];
  if (state.selected > 0) state.stock[state.selected]--;
  state.pets.push(petId);
  if (!state.discovered.includes(petId)) state.discovered.push(petId);
  state.cracks = 0;
  if (state.selected > 0 && state.stock[state.selected] === 0) state.selected = 0;
  save();
  $("ball").disabled = true;
  $("ball").classList.remove("hit");
  $("ball").classList.add("breaking");
  $("burst").classList.add("active");
  document.querySelectorAll("[data-select], [data-buy]").forEach(b => b.disabled = true);
  message("균열이 열리고 있어요…");
  hatchTimer = setTimeout(() => {
    hatching = false;
    $("ball").classList.remove("breaking");
    $("burst").classList.remove("active");
    message(`${RARITIES[p.rarity]} · ${p.name} 부화! ${format(p.rate + p.bonus)} G/s — 인벤토리에서 장착하세요.`);
    render();
  }, 650);
}
$("ball").addEventListener("click", () => {
  if (hatching || state.pets.length >= 10000) { if (!hatching) message("인벤토리 한도 10,000마리에 도달했어요."); return; }
  state.cracks = Math.min(BALLS[state.selected].clicks, state.cracks + clickPower());
  $("ball").classList.remove("hit");
  void $("ball").offsetWidth; // 같은 애니메이션을 다시 시작합니다.
  $("ball").classList.add("hit");
  renderBall();
  if (state.cracks >= BALLS[state.selected].clicks) hatch(); else save();
});
$("queue").addEventListener("click", e => {
  const button = e.target.closest("[data-select]");
  if (!button || hatching) return;
  const tier = Number(button.dataset.select);
  if (tier === state.selected || (tier > 0 && state.stock[tier] === 0)) return;
  state.selected = tier; state.cracks = 0; save(); renderBall(); renderStats();
});
$("shop").innerHTML = BALLS.slice(1).map((b, i) => `<div class="shop-card"><div class="mini-ball" aria-hidden="true"></div><div><strong>${b.name}</strong><small>균열 ${b.clicks} · 신화 ${b.odds[4]}%</small></div><button data-buy="${i + 1}" aria-label="${b.name} 구매">${format(b.price)} G</button></div>`).join("");
$("odds").innerHTML = BALLS.map(b => `<p><strong>${b.name}</strong><br>${RARITIES.map((r, i) => `${r} ${b.odds[i]}%`).join(" · ")}</p>`).join("");
$("shop").addEventListener("click", e => {
  const button = e.target.closest("[data-buy]");
  if (!button || hatching) return;
  const tier = Number(button.dataset.buy), cost = BALLS[tier].price;
  if (state.gold < cost || state.stock[tier] >= 9999) return;
  state.gold = Math.max(0, state.gold - cost); state.stock[tier]++;
  save(); renderStats(); renderBall(); message(`${BALLS[tier].name} 구매 완료! 보유 왁뿌볼에서 선택하세요.`);
});
$("inventory").addEventListener("click", e => {
  const button = e.target.closest("[data-equip]");
  if (!button) return;
  const index = Number(button.dataset.equip);
  if (!integer(index, state.pets.length - 1)) return;
  if (state.equipped.includes(index)) state.equipped = state.equipped.filter(i => i !== index);
  else if (state.equipped.length < SLOT_LIMIT) state.equipped.push(index);
  else return;
  save(); render();
});
$("reset").addEventListener("click", () => {
  if (!confirm("골드, 펫, 도감, 구매 기록을 모두 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) return;
  clearTimeout(hatchTimer); hatching = false; state = defaults(); lastTick = performance.now();
  $("ball").classList.remove("breaking", "hit"); $("burst").classList.remove("active");
  save(); render(); message("새로운 연구를 시작합니다. 첫 왁뿌볼을 깨 보세요!");
});
// 실제 경과 시간으로 생산합니다. 백그라운드 수익은 틱당 최대 60초이며 오프라인 수익은 없습니다.
setInterval(() => {
  const now = performance.now();
  const elapsed = Math.min(60, Math.max(0, (now - lastTick) / 1000)); lastTick = now;
  state.gold = Math.min(1e15, state.gold + income() * elapsed);
  renderStats();
}, 250);
setInterval(save, 2000);
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

// 메뉴 열고 닫기는 표시만 바꾸며 게임 진행과 저장값은 유지합니다.
const menuTitles = { "shop-panel": "왁뿌볼 상점", "hatch-panel": "왁뿌볼 부화실", "inventory-panel": "펫 인벤토리", "codex-panel": "펫 도감" };
let activeMenu = null;
let menuTrigger = null;
function openMenu(id, trigger) {
  if (!menuTitles[id]) return;
  activeMenu = id;
  menuTrigger = document.querySelector(`.world-nav [data-menu="${id}"]`) || trigger || menuTrigger;
  $("menu-panel").hidden = false;
  $("menu-backdrop").hidden = false;
  $("menu-title").textContent = menuTitles[id];
  document.querySelector(".menu-content").scrollTop = 0;
  document.querySelectorAll(".menu-page").forEach(page => { page.hidden = page.id !== id; });
  document.querySelectorAll(".world-nav [data-menu]").forEach(button => button.setAttribute("aria-expanded", String(button.dataset.menu === id)));
  $("close-menu").focus({ preventScroll: true });
}
function closeMenu() {
  activeMenu = null; $("menu-panel").hidden = true;
  $("menu-backdrop").hidden = true;
  document.querySelectorAll(".world-nav [data-menu]").forEach(button => button.setAttribute("aria-expanded", "false"));
  menuTrigger?.focus({ preventScroll: true });
}
document.querySelectorAll("[data-menu]").forEach(button => button.addEventListener("click", () => {
  if (activeMenu === button.dataset.menu) closeMenu(); else openMenu(button.dataset.menu, button);
}));
$("close-menu").addEventListener("click", closeMenu);
$("menu-backdrop").addEventListener("click", closeMenu);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") { if (activeMenu) closeMenu(); else $("pet-info").hidden = true; }
});
let selectedWorldPet = null;
const world = new PetWorld($("world-map"), $("world-pets"), index => {
  if (!state.equipped.includes(index)) return;
  selectedWorldPet = index;
  const pet = PETS[state.pets[index]];
  $("info-rarity").textContent = RARITIES[pet.rarity];
  $("info-name").textContent = pet.name;
  $("info-rate").textContent = `${format(pet.rate + pet.bonus)} G/s`;
  $("info-ability").textContent = pet.ability;
  $("pet-info").hidden = false;
});
$("close-pet-info").addEventListener("click", () => { selectedWorldPet = null; $("pet-info").hidden = true; });
render(); save();
