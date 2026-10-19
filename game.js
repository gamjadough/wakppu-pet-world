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
const PETS = [{"name":"새싹뿌","rarity":0,"rate":1,"bonus":0.2,"power":0,"personality":0,"ability":"광합성 · 생산 +0.2 G/s"},{"name":"돌멩뿌","rarity":0,"rate":1,"bonus":0,"power":1,"personality":1,"ability":"단단한 손 · 클릭 위력 +1"},{"name":"물방뿌","rarity":1,"rate":3,"bonus":1,"power":0,"personality":2,"ability":"물의 흐름 · 생산 +1 G/s"},{"name":"바람뿌","rarity":1,"rate":3,"bonus":0,"power":2,"personality":3,"ability":"질풍 · 클릭 위력 +2"},{"name":"달빛뿌","rarity":2,"rate":8,"bonus":3,"power":0,"personality":0,"ability":"달빛 수확 · 생산 +3 G/s"},{"name":"번개뿌","rarity":2,"rate":8,"bonus":0,"power":3,"personality":3,"ability":"전격 · 클릭 위력 +3"},{"name":"별무리뿌","rarity":3,"rate":20,"bonus":8,"power":0,"personality":2,"ability":"별의 축복 · 생산 +8 G/s"},{"name":"용암뿌","rarity":3,"rate":20,"bonus":0,"power":5,"personality":1,"ability":"화산의 힘 · 클릭 위력 +5"},{"name":"태양뿌","rarity":4,"rate":60,"bonus":25,"power":0,"personality":3,"ability":"황금 햇살 · 생산 +25 G/s"},{"name":"우주뿌","rarity":4,"rate":60,"bonus":0,"power":8,"personality":0,"ability":"차원 균열 · 클릭 위력 +8"},{"name":"버섯뿌","rarity":0,"rate":1,"bonus":0.1,"power":0,"personality":2,"ability":"포근한 포자 · 생산 +0.1 G/s"},{"name":"이슬뿌","rarity":1,"rate":3,"bonus":0.5,"power":1,"personality":0,"ability":"새벽 물방울 · 생산 +0.5 G/s · 클릭 +1"},{"name":"서리뿌","rarity":2,"rate":8,"bonus":1,"power":2,"personality":1,"ability":"반짝 서리 · 생산 +1 G/s · 클릭 +2"},{"name":"오로라뿌","rarity":3,"rate":20,"bonus":4,"power":3,"personality":3,"ability":"하늘 커튼 · 생산 +4 G/s · 클릭 +3"},{"name":"은하뿌","rarity":4,"rate":60,"bonus":10,"power":5,"personality":2,"ability":"별의 강 · 생산 +10 G/s · 클릭 +5"}]; // generated from pets.js
const $ = id => document.getElementById(id);
const format = n => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1, notation: n >= 1000000 ? "compact" : "standard" }).format(n);
const defaults = () => ({ version: 1, catalogVersion: 2, lockVersion: 1, gold: 0, pets: [], equipped: [], locked: [], discovered: [], stock: [0, 0, 0, 0], selected: 0, cracks: 0, soundEnabled: true, fights: [], peaceUntil: {}, fightEndsAt: 0, scene: "day" });
const integer = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
let storageOK = true;
let activeSaveKey = SAVE_KEY;
let gamePaused = false;

// 저장 데이터는 외부 입력처럼 검증합니다. 잘못된 필드는 기본값으로 복구합니다.
function validateSave(data) {
  const clean = defaults();
  try {
    if (!data || data.version !== 1) return clean;
    if (["day", "dusk"].includes(data.scene)) clean.scene = data.scene;
    if (typeof data.soundEnabled === "boolean") clean.soundEnabled = data.soundEnabled;
    if (Number.isFinite(data.gold) && data.gold >= 0) clean.gold = Math.min(data.gold, 1e15);
    if (Array.isArray(data.pets)) clean.pets = data.pets.filter(p => integer(p, PETS.length - 1)).slice(0, 10000);
    if (Array.isArray(data.equipped)) clean.equipped = [...new Set(data.equipped)].filter(i => integer(i, clean.pets.length - 1)).slice(0, SLOT_LIMIT);
    if (Array.isArray(data.locked)) clean.locked = [...new Set(data.locked)].filter(i => integer(i, clean.pets.length - 1));
    const discoveries = Array.isArray(data.discovered) ? data.discovered.filter(p => integer(p, PETS.length - 1)) : [];
    clean.discovered = [...new Set([...discoveries, ...clean.pets])];
    if (Array.isArray(data.stock)) clean.stock = BALLS.map((_, i) => i > 0 && integer(data.stock[i], 9999) ? data.stock[i] : 0);
    if (integer(data.selected, BALLS.length - 1) && (data.selected === 0 || clean.stock[data.selected] > 0)) clean.selected = data.selected;
    if (integer(data.cracks, BALLS[clean.selected].clicks - 1)) clean.cracks = data.cracks;
    // 이전 저장에는 싸움 필드가 없어도 그대로 사용할 수 있습니다.
    const used = new Set();
    if (Array.isArray(data.fights)) clean.fights = data.fights.filter(pair => {
      if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] ||
          !pair.every(i => clean.equipped.includes(i) && !used.has(i)) ||
          PETS[clean.pets[pair[0]]].ability === PETS[clean.pets[pair[1]]].ability) return false;
      pair.forEach(i => used.add(i)); return true;
    }).map(pair => [...pair]);
    if (clean.fights.length) {
      clean.fightEndsAt = Number.isFinite(data.fightEndsAt) && data.fightEndsAt > 0
        ? Math.min(data.fightEndsAt, Date.now() + 20000) : Date.now() + 20000;
      if (clean.fightEndsAt <= Date.now()) { clean.fights = []; clean.fightEndsAt = 0; }
    }
    if (data.peaceUntil && typeof data.peaceUntil === "object") {
      clean.pets.forEach((_, i) => {
        const until = data.peaceUntil[i];
        if (Number.isFinite(until) && until > Date.now()) clean.peaceUntil[i] = Math.min(until, Date.now() + 10000);
      });
    }
    return clean;
  } catch { return clean; }
}
function load() {
  try { return validateSave(JSON.parse(localStorage.getItem(activeSaveKey))); }
  catch { return defaults(); }
}
const sounds = new GameSounds();
let state = load();
let hatching = false;
let hatchTimer;
// 현재 화면의 부화 결과만 가리킵니다. 계정 전환·초기화 시 폐기합니다.
let latestHatch = null;
let lastTick = performance.now();

// 상태 계산과 화면 갱신을 분리합니다. 인벤토리 번호로 같은 종류도 구분합니다.
function equippedPets() { return state.equipped.map(index => PETS[state.pets[index]]); }
function petRelationship(a,b) {
  if(a===b) return "neutral";
  const left=PETS[a].personality,right=PETS[b].personality;
  if(left===1||right===1) return left===right?"neutral":"bicker";
  return left===2||right===2||left!==right?"friends":"neutral";
}
function isFighting(index) { return state.fights.some(pair => pair.includes(index)); }
function petIncome(index) {
  if (isFighting(index)) return 0;
  const id = state.pets[index], p = PETS[id];
  const friend = state.equipped.some(other => other !== index && !isFighting(other) && petRelationship(id, state.pets[other]) === "friends");
  return (p.rate + p.bonus) * (friend ? 1.1 : 1);
}
function income() { return state.equipped.reduce((sum, index) => sum + petIncome(index), 0); }
function friendshipBonus() {
  return income() - state.equipped.filter(index => !isFighting(index)).reduce((sum, index) => {
    const p = PETS[state.pets[index]]; return sum + p.rate + p.bonus;
  }, 0);
}
// 다툼은 저장되는 게임 상태입니다. 클릭 중재 또는 20초 뒤 자연스럽게 화해합니다.
function reconcileFights() {
  state.fights = state.fights.filter(pair => {
    if (pair.every(index => state.equipped.includes(index))) return true;
    pair.forEach(index => { if (state.equipped.includes(index)) state.peaceUntil[index] = Date.now() + 10000; });
    return false;
  });
  if (!state.fights.length) state.fightEndsAt = 0;
  for (const index of Object.keys(state.peaceUntil)) {
    if (!integer(Number(index), state.pets.length - 1) || state.peaceUntil[index] <= Date.now()) delete state.peaceUntil[index];
  }
}
function startFight(a, b) {
  if (gamePaused) return;
  if (a === b || !state.equipped.includes(a) || !state.equipped.includes(b) || isFighting(a) || isFighting(b) ||
      state.peaceUntil[a] > Date.now() || state.peaceUntil[b] > Date.now() ||
      petRelationship(state.pets[a], state.pets[b]) !== "bicker") return;
  accrueGold(); // 만난 시각까지 이전 수익으로 정산한 다음 두 펫의 생산을 멈춥니다.
  state.fights.push([a, b]);
  state.fightEndsAt = Date.now() + 20000;
  save(); renderStats();
}
function mediate(index) {
  if (gamePaused) return false;
  const pair = state.fights.find(pair => pair.includes(index));
  if (!pair) return false;
  accrueGold();
  state.fights = state.fights.filter(item => item !== pair);
  if (!state.fights.length) state.fightEndsAt = 0;
  pair.forEach(i => {
    state.peaceUntil[i] = Date.now() + 10000;
    const actor = world.actors.get(i);
    if (actor) { actor.rest = 0; actor.changeIn = 2; world.paint(actor); }
  });
  save(); renderStats();
  return true;
}
// 만남은 매 프레임 재추첨하지 않습니다. 한 번 만난 뒤 12초 쉬어 갑니다.
function meetPets(a, b) {
  if (gamePaused || isFighting(a) || isFighting(b) || state.peaceUntil[a] > Date.now() || state.peaceUntil[b] > Date.now()) return;
  const left = world.actors.get(a), right = world.actors.get(b);
  if (!left || !right || left.socialReadyAt > Date.now() || right.socialReadyAt > Date.now()) return;
  left.socialReadyAt = right.socialReadyAt = Date.now() + 12000;
  const relation = petRelationship(state.pets[a], state.pets[b]);
  if (relation === "friends") {
    left.playIn = right.playIn = 2.5;
    left.rest = right.rest = 2.5;
  } else if (relation === "bicker" && Math.random() < .25) startFight(a, b);
}
function clickPower() { return 1 + equippedPets().reduce((sum, p) => sum + p.power, 0); }
// 장착을 바꾸기 전에 이전 구성으로 벌었던 골드를 먼저 정산합니다.
function accrueGold() {
  const now = performance.now();
  if (gamePaused) { lastTick = now; return; }
  const elapsed = Math.min(60, Math.max(0, (now - lastTick) / 1000));
  lastTick = now;
  const deadline = state.fightEndsAt;
  if (state.fights.length && deadline > 0 && deadline <= Date.now()) {
    // 다툼이 끝난 시각 앞뒤를 나눠 계산해 종료 전 수익을 소급 지급하지 않습니다.
    const stopped = Math.min(elapsed, Math.max(0, (deadline - (Date.now() - elapsed * 1000)) / 1000));
    const oldIncome = income();
    state.fights.forEach(pair => pair.forEach(index => { state.peaceUntil[index] = Date.now() + 10000; }));
    state.fights = []; state.fightEndsAt = 0;
    state.gold = Math.min(1e15, state.gold + oldIncome * stopped + income() * (elapsed - stopped));
    save();
  } else state.gold = Math.min(1e15, state.gold + income() * elapsed);
}
function save() {
  reconcileFights();
  try { localStorage.setItem(activeSaveKey, JSON.stringify(state)); storageOK = true; }
  catch { storageOK = false; }
  $("save-status").textContent = storageOK ? "브라우저에 자동 저장 · 저장 완료" : "저장 불가 · 현재 플레이는 가능하지만 새로고침 시 사라질 수 있어요";
  if (window.wakppuCloud) window.wakppuCloud.changed();
}
function message(text) { $("result").textContent = text; }
function renderStats() {
  document.body.dataset.scene = state.scene;
  $("garden-name").textContent = state.scene === "day" ? "햇살 정원" : "별빛 정원";
  $("scene-toggle").textContent = state.scene === "day" ? "해질녘으로" : "햇살로";
  $("scene-toggle").setAttribute("aria-pressed", String(state.scene === "dusk"));
  if (selectedWorldPet !== null && state.equipped.includes(selectedWorldPet)) $("info-rate").textContent = `${format(petIncome(selectedWorldPet))} G/s`;
  const bonus = Math.max(0, friendshipBonus());
  $("team-summary").textContent = bonus > 0 ? `친구의 응원 +${format(bonus)} G/s` : "잘 맞는 친구를 함께 장착해 보세요";
  $("garden-goal").textContent = state.pets.length === 0 ? "첫 친구를 만나러 가기" : state.equipped.length < 3 ? `정원 친구 ${state.equipped.length}/3 · 장착하기` : `도감 ${state.discovered.length}/${PETS.length} · 새 친구 만나기`;
  $("fight-status").hidden = state.fights.length === 0;
  $("fight-status").textContent = `싸우는 중 ${state.fights.length * 2}마리 · 클릭해 중재 · 최대 20초`;
  $("sound-toggle").textContent = state.soundEnabled ? "소리 켜짐" : "소리 꺼짐";
  $("sound-toggle").setAttribute("aria-pressed", String(state.soundEnabled));
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
  const locked = !codex && state.locked.includes(index);
  return `<article class="pet-card species-${petId} ${equipped ? "equipped" : ""} ${locked ? "locked" : ""} ${known ? "" : "unknown"}" style="--rarity:${COLORS[p.rarity]}">${codex ? "" : `<label class="pet-selection"><input type="checkbox" data-pet-select="${index}" aria-label="${p.name} ${index + 1}번 방생 선택" ${selectedPets.has(index) ? "checked" : ""} ${equipped || locked ? "disabled" : ""}>${locked ? "잠금 중" : equipped ? "장착 중" : "방생 선택"}</label>`}<div class="pet-art" aria-hidden="true"></div><span class="rarity">${RARITIES[p.rarity]}</span><h3>${known ? p.name : "???"}</h3><p class="rate">${known ? `${format(p.rate + p.bonus)} G/s` : "미발견"}</p><p class="personality">${known ? PERSONALITIES[PETS[petId].personality] + " 성격" : "성격 미발견"}</p><p>${known ? p.ability : "부화하여 비밀을 발견하세요"}</p>${codex ? "" : `<button data-equip="${index}" >${equipped ? "장착 해제" : state.equipped.length >= SLOT_LIMIT ? "교체 장착" : "장착하기"}</button><button data-lock="${index}" class="pet-lock" aria-pressed="${locked}" aria-label="${p.name} ${index + 1}번 ${locked ? "잠금 해제" : "잠그기"}">${locked ? "🔒 잠금 해제" : "잠그기"}</button><button data-release="${index}" class="release" ${locked ? "disabled" : ""}>방생 · +${format(p.rate + p.bonus)} G</button>`}</article>`;
}
// 정렬은 표시 목록에만 적용합니다. 저장 배열의 번호는 장착·중복 펫을 구분합니다.
const selectedPets = new Set();
function inventoryItems() {
  const rarity = $("inventory-rarity").value, sort = $("inventory-sort").value;
  const items = state.pets.map((id, index) => ({ id, index }))
    .filter(item => rarity === "all" || PETS[item.id].rarity === Number(rarity));
  if (sort !== "obtained") items.sort((a, b) =>
    (PETS[a.id].rarity - PETS[b.id].rarity) * (sort === "rarity-desc" ? -1 : 1) || a.index - b.index);
  return items;
}
function renderSelection() {
  const eligible = inventoryItems().filter(item => !state.equipped.includes(item.index) && !state.locked.includes(item.index));
  const allowed = new Set(eligible.map(item => item.index));
  for (const index of selectedPets) if (!allowed.has(index)) selectedPets.delete(index);
  const reward = [...selectedPets].reduce((sum, index) => {
    const p = PETS[state.pets[index]]; return sum + p.rate + p.bonus;
  }, 0);
  $("selection-summary").textContent = `선택 ${selectedPets.size}마리 · 보상 ${format(reward)} G`;
  $("release-selected").disabled = selectedPets.size === 0;
  $("clear-selection").disabled = selectedPets.size === 0;
  $("select-visible").disabled = eligible.length === 0 || eligible.every(item => selectedPets.has(item.index));
  document.querySelectorAll("[data-pet-select]").forEach(input => { input.checked = selectedPets.has(Number(input.dataset.petSelect)); });
}
function equipPet(index) {
  if (!integer(index, state.pets.length - 1) || state.equipped.includes(index)) return false;
  if (state.equipped.length >= SLOT_LIMIT) state.equipped.pop();
  state.equipped.push(index);
  $("inventory-notice").textContent = `${PETS[state.pets[index]].name} 장착 완료`;
  return true;
}
function renderHatchAction() {
  const result = latestHatch;
  const valid = result && integer(result.index, state.pets.length - 1) && state.pets[result.index] === result.petId;
  $("hatch-actions").hidden = !valid || hatching;
  $("hatch-equip").disabled = !valid || hatching;
  if (!valid || hatching) return;
  const equipped = state.equipped.includes(result.index), name = PETS[result.petId].name;
  $("hatch-equip").disabled = equipped;
  $("hatch-equip").textContent = equipped ? "장착 완료" : "바로 장착";
  if (equipped) $("hatch-equip-note").textContent = `${name}이 초원에 합류했어요.`;
  else if (state.equipped.length >= SLOT_LIMIT) {
    const replacing = PETS[state.pets[state.equipped[state.equipped.length - 1]]];
    $("hatch-equip-note").textContent = `마지막으로 장착한 ${replacing.name}과 교체해요. 기존 펫은 인벤토리에 남아요.`;
  } else $("hatch-equip-note").textContent = `${name} 장착 · 남은 슬롯 ${SLOT_LIMIT - state.equipped.length}개`;
}
$("hatch-equip").addEventListener("click", () => {
  renderHatchAction();
  if (gamePaused || hatching || !latestHatch || $("hatch-equip").disabled) return;
  accrueGold();
  if (equipPet(latestHatch.index)) { save(); render(); }
});
function renderPets() {
  $("recommend").disabled = state.pets.length === 0;
  $("slots").textContent = `장착 ${state.equipped.length} / ${SLOT_LIMIT}`;
  $("pet-count").textContent = `${state.pets.length}마리`;
  renderSelection();
  const items = inventoryItems();
  $("inventory").innerHTML = items.length ? items.map(item => petCard(item.id, item.index)).join("") : `<p class="empty">${state.pets.length ? "이 등급의 펫이 없어요." : "아직 펫이 없어요. 첫 왁뿌볼을 깨 보세요!"}</p>`;
  // 도감 표시만 등급순으로 정렬하고 저장 식별자인 펫 번호는 유지합니다.
  $("codex").innerHTML = PETS.map((pet, id) => ({ pet, id }))
    .sort((a, b) => a.pet.rarity - b.pet.rarity || a.id - b.id)
    .map(({ id }) => petCard(id, id, true)).join("");
  world.sync(state.equipped.map(index => {
    const id = state.pets[index], pet = PETS[id];
    return { index, id, name: pet.name, color: COLORS[pet.rarity] };
  }));
  renderHatchAction();
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
  if (state.soundEnabled) sounds.play("break");
  const petId = rollPet(state.selected);
  const p = PETS[petId];
  if (state.selected > 0) state.stock[state.selected]--;
  latestHatch = { index: state.pets.length, petId };
  state.pets.push(petId);
  renderHatchAction();
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
    message(`${RARITIES[p.rarity]} · ${p.name} 부화! ${format(p.rate + p.bonus)} G/s`);
    render();
  }, 650);
}
$("ball").addEventListener("click", () => {
  if (hatching || state.pets.length >= 10000) { if (!hatching) message("인벤토리 한도 10,000마리에 도달했어요."); return; }
  if (latestHatch) {
    latestHatch = null; renderHatchAction(); message("볼을 클릭해 새 친구를 만나세요!");
  }
  if (state.soundEnabled) sounds.play("click");
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
function releasePets(indices) {
  indices = indices.filter(index => integer(index, state.pets.length - 1) && !state.locked.includes(index));
  if (!indices.length) return 0;
  accrueGold();
  const released = new Set(indices), nextPets = [];
  let reward = 0;
  state.pets.forEach((id, index) => {
    if (released.has(index)) { const p = PETS[id]; reward += p.rate + p.bonus; }
    else nextPets.push(id);
  });
  // 배열 번호가 바뀌어도 최근 장착 순서를 유지합니다.
  const remap = new Map();
  let nextIndex = 0;
  state.pets.forEach((_, index) => { if (!released.has(index)) remap.set(index, nextIndex++); });
  const nextPeace = {};
  for (const [index, until] of Object.entries(state.peaceUntil)) if (remap.has(Number(index))) nextPeace[remap.get(Number(index))] = until;
  state.fights = state.fights.filter(pair => {
    if (pair.every(index => remap.has(index))) return true;
    pair.forEach(index => { if (remap.has(index)) nextPeace[remap.get(index)] = Date.now() + 10000; });
    return false;
  }).map(pair => pair.map(index => remap.get(index)));
  state.peaceUntil = nextPeace;
  state.equipped = state.equipped.filter(index => !released.has(index)).map(index => remap.get(index));
  state.locked = state.locked.filter(index => !released.has(index)).map(index => remap.get(index));
  if (latestHatch) {
    if (released.has(latestHatch.index)) latestHatch = null;
    else latestHatch.index = remap.get(latestHatch.index);
  }
  state.pets = nextPets;
  state.gold = Math.min(1e15, state.gold + reward);
  selectedPets.clear(); world.clear(); selectedWorldPet = null; $("pet-info").hidden = true;
  return reward;
}
$("inventory-rarity").addEventListener("change", () => {
  selectedPets.clear(); renderPets();
  $("inventory-notice").textContent = "등급을 변경해 방생 선택을 해제했어요.";
});
$("inventory-sort").addEventListener("change", renderPets);
$("inventory").addEventListener("change", event => {
  const input = event.target.closest("[data-pet-select]");
  if (!input) return;
  const index = Number(input.dataset.petSelect);
  if (!integer(index, state.pets.length - 1) || state.equipped.includes(index) || state.locked.includes(index)) return;
  if (input.checked) selectedPets.add(index); else selectedPets.delete(index);
  renderSelection();
});
$("select-visible").addEventListener("click", () => {
  inventoryItems().forEach(item => { if (!state.equipped.includes(item.index) && !state.locked.includes(item.index)) selectedPets.add(item.index); });
  renderSelection();
});
$("clear-selection").addEventListener("click", () => { selectedPets.clear(); renderSelection(); });
$("release-selected").addEventListener("click", () => {
  renderSelection();
  if (!selectedPets.size) return;
  const indices = [...selectedPets];
  const reward = indices.reduce((sum, index) => { const p = PETS[state.pets[index]]; return sum + p.rate + p.bonus; }, 0);
  if (!confirm(`선택한 펫 ${indices.length}마리를 방생하고 총 ${format(reward)} G를 받을까요? 삭제한 펫은 되돌릴 수 없습니다. 장착·잠금 펫과 도감 기록은 유지됩니다.`)) return;
  releasePets(indices);
  $("inventory-notice").textContent = `${indices.length}마리 방생 완료 · +${format(reward)} G`;
  save(); render();
});
$("inventory").addEventListener("click", e => {
  const button = e.target.closest("[data-equip], [data-release], [data-lock]");
  if (!button) return;
  const release = button.hasAttribute("data-release");
  const toggleLock = button.hasAttribute("data-lock");
  const index = Number(toggleLock ? button.dataset.lock : release ? button.dataset.release : button.dataset.equip);
  if (!integer(index, state.pets.length - 1)) return;
  const pet = PETS[state.pets[index]];
  if (toggleLock) {
    const wasLocked = state.locked.includes(index);
    state.locked = wasLocked ? state.locked.filter(i => i !== index) : [...state.locked, index];
    $("inventory-notice").textContent = `${pet.name} ${wasLocked ? "잠금 해제" : "잠금 완료 · 방생에서 보호됩니다"}`;
    save(); renderPets(); return;
  }
  if (release && state.locked.includes(index)) return;
  if (release && !confirm(`${pet.name}을 방생하고 ${format(pet.rate + pet.bonus)} G를 받을까요? 인벤토리에서 삭제되며 되돌릴 수 없습니다. 도감 기록은 유지됩니다.`)) return;
  accrueGold();
  if (release) {
    releasePets([index]);
    $("inventory-notice").textContent = `${pet.name} 방생 완료 · +${format(pet.rate + pet.bonus)} G`;
  } else if (state.equipped.includes(index)) state.equipped = state.equipped.filter(i => i !== index);
  else equipPet(index);
  save(); render();
});
$("recommend").addEventListener("click", () => {
  accrueGold();
  state.equipped = state.pets.map((id, index) => ({ pet: PETS[id], index }))
    .sort((a, b) => b.pet.rarity - a.pet.rarity || (b.pet.rate + b.pet.bonus) - (a.pet.rate + a.pet.bonus) || a.index - b.index)
    .slice(0, SLOT_LIMIT).map(item => item.index);
  $("inventory-notice").textContent = "높은 등급 우선 · 같은 등급은 높은 초당 수익 순으로 장착했어요.";
  save(); render();
});
$("sound-toggle").addEventListener("click", () => {
  state.soundEnabled = !state.soundEnabled;
  if (state.soundEnabled) sounds.play("click");
  save(); renderStats();
});
$("reset").addEventListener("click", () => {
  if (!confirm("골드, 펫, 도감, 구매 기록을 모두 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) return;
  clearTimeout(hatchTimer); hatching = false; latestHatch = null; state = defaults(); lastTick = performance.now();
  world.clear(); selectedPets.clear(); $("inventory-rarity").value = "all"; $("inventory-sort").value = "obtained";
  $("ball").classList.remove("breaking", "hit"); $("burst").classList.remove("active");
  save(); render(); message("새로운 연구를 시작합니다. 첫 왁뿌볼을 깨 보세요!");
});
// 실제 경과 시간으로 생산합니다. 백그라운드 수익은 틱당 최대 60초이며 오프라인 수익은 없습니다.
setInterval(() => {
  accrueGold();
  renderStats();
}, 250);
setInterval(save, 2000);
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

// 메뉴 열고 닫기는 표시만 바꾸며 게임 진행과 저장값은 유지합니다.
const menuTitles = { "shop-panel": "왁뿌볼 상점", "hatch-panel": "왁뿌볼 부화실", "inventory-panel": "펫 인벤토리", "codex-panel": "펫 도감", "guide-panel": "정원의 생활 안내" };
let activeMenu = null;
let menuTrigger = null;
function openMenu(id, trigger) {
  if (!menuTitles[id]) return;
  activeMenu = id;
  $("menu-panel").dataset.page = id;
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
  if (mediate(index)) return;
  selectedWorldPet = index;
  const pet = PETS[state.pets[index]];
  $("info-rarity").textContent = RARITIES[pet.rarity];
  $("info-name").textContent = pet.name;
  $("info-rate").textContent = `${format(petIncome(index))} G/s`;
  $("info-personality").textContent = `${PERSONALITIES[PETS[state.pets[index]].personality]} 성격 · 친구의 응원은 생산 +10%`;
  $("info-ability").textContent = pet.ability;
  $("pet-info").hidden = false;
}, { isFighting, meet: meetPets });
$("scene-toggle").addEventListener("click", () => { state.scene = state.scene === "day" ? "dusk" : "day"; save(); renderStats(); });
$("garden-goal").addEventListener("click", event => { openMenu(state.pets.length > 0 && state.equipped.length < 3 ? "inventory-panel" : "hatch-panel", event.currentTarget); });
$("fight-status").addEventListener("click", () => { if (state.fights.length) mediate(state.fights[0][0]); });
$("close-pet-info").addEventListener("click", () => { selectedWorldPet = null; $("pet-info").hidden = true; });
render(); save();

// 서버 로그인 전환 중에는 조작과 수익을 함께 멈춥니다.
document.addEventListener("click", event => {
  if (gamePaused && !event.target.closest("#account-panel, #account-toggle")) {
    window.wakppuCloud?.blocked();
    event.preventDefault(); event.stopImmediatePropagation();
  }
}, true);
window.wakppuGame = {
  snapshot: () => JSON.parse(JSON.stringify(state)),
  pause(value) { gamePaused = value; lastTick = performance.now(); },
  useSave(data, userId = null) {
    clearTimeout(hatchTimer); hatching = false; latestHatch = null;
    message("볼을 클릭해 새 친구를 만나세요!");
    activeSaveKey = userId ? `${SAVE_KEY}:account:${userId}` : SAVE_KEY;
    state = validateSave(data); lastTick = performance.now();
    selectedPets.clear(); world.clear(); selectedWorldPet = null;
    $("pet-info").hidden = true;
    $("ball").classList.remove("breaking", "hit"); $("burst").classList.remove("active");
    render(); save();
  },
  guestSave() {
    try { return validateSave(JSON.parse(localStorage.getItem(SAVE_KEY))); }
    catch { return defaults(); }
  },
  freshSave: defaults
};
