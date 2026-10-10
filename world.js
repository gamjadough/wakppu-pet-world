"use strict";

// 이동 상태는 저장/골드 상태와 독립적입니다. 배경은 HTML, 모습은 CSS에서 꾸밉니다.
class PetWorld {
  constructor(map, layer, onSelect) {
    this.map = map; this.layer = layer; this.onSelect = onSelect;
    this.actors = new Map();
    this.width = map.clientWidth; this.height = map.clientHeight;
    this.lastFrame = performance.now();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(map);
    layer.addEventListener("click", event => {
      const button = event.target.closest("[data-world-pet]");
      if (button) this.onSelect(Number(button.dataset.worldPet));
    });
    requestAnimationFrame(time => this.frame(time));
  }
  // 인벤토리 번호로 구분하므로 같은 종류의 펫도 별도로 움직입니다.
  sync(pets) {
    const active = new Set(pets.map(p => p.index));
    for (const [index, actor] of this.actors) {
      if (!active.has(index)) { actor.element.remove(); this.actors.delete(index); }
    }
    pets.forEach((pet, slot) => {
      if (this.actors.has(pet.index)) return;
      const element = document.createElement("button");
      element.className = `world-pet species-${pet.id}`;
      element.dataset.worldPet = pet.index;
      element.setAttribute("aria-label", `${pet.name} 정보 보기`);
      element.style.setProperty("--pet-color", pet.color);
      element.innerHTML = '<span class="pet-shadow"></span><span class="pet-sprite"><span class="pet-ear ear-left"></span><span class="pet-ear ear-right"></span><span class="pet-body"><span class="pet-eyes"></span><span class="pet-cheeks"></span><span class="pet-mouth"></span><span class="pet-belly"></span></span><span class="pet-foot foot-left"></span><span class="pet-foot foot-right"></span></span><span class="pet-name"></span><span class="pet-rest">zzZ</span>';
      element.querySelector(".pet-name").textContent = pet.name;
      this.layer.append(element);
      const actor = { element, x: this.width * (.27 + slot * .23), y: this.height * (.5 + (slot % 2) * .16), angle: .8 + slot * 2, speed: 32 + (pet.index % 7) * 5 + slot * 8, changeIn: 2 + slot, rest: 0 };
      this.actors.set(pet.index, actor); this.clamp(actor); this.paint(actor);
    });
    document.getElementById("world-empty").hidden = pets.length > 0;
    document.getElementById("world-count").textContent = `산책 중 ${pets.length} / 3`;
  }
  // 방생으로 인벤토리 번호가 바뀌면 캐릭터를 다시 연결합니다.
  clear() {
    for (const actor of this.actors.values()) actor.element.remove();
    this.actors.clear();
  }
  resize() {
    const width = this.map.clientWidth, height = this.map.clientHeight;
    const scaleX = width / Math.max(1, this.width), scaleY = height / Math.max(1, this.height);
    this.width = width; this.height = height;
    for (const actor of this.actors.values()) {
      actor.x *= scaleX; actor.y *= scaleY;
      this.clamp(actor); this.paint(actor);
    }
  }
  clamp(actor) {
    // 이름을 포함한 버튼 전체가 맵 경계 안에 머무릅니다.
    const x = Math.max(48, Math.min(this.width - 48, actor.x));
    const y = Math.max(90, Math.min(this.height - 84, actor.y));
    if (x !== actor.x) actor.angle = Math.PI - actor.angle;
    if (y !== actor.y) actor.angle = -actor.angle;
    actor.x = x; actor.y = y;
  }
  paint(actor) {
    actor.element.style.transform = `translate(${actor.x - 45}px, ${actor.y - 65}px)`;
    actor.element.style.zIndex = Math.round(actor.y);
    actor.element.style.setProperty("--facing", Math.cos(actor.angle) < 0 ? -1 : 1);
    actor.element.classList.toggle("resting", actor.rest > 0);
  }
  frame(time) {
    // 탭 복귀 시 순간이동 방지. 수익은 game.js의 별도 타이머에서 계산합니다.
    const dt = Math.min(.05, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    if (!document.hidden) {
      for (const actor of this.actors.values()) {
        actor.changeIn -= dt;
        if (actor.rest > 0) actor.rest = Math.max(0, actor.rest - dt);
        else {
          if (actor.changeIn <= 0) {
            actor.angle += (Math.random() - .5) * Math.PI * 1.5;
            actor.changeIn = 2.5 + Math.random() * 4;
            if (Math.random() < .3) actor.rest = .8 + Math.random() * 1.5;
          }
          actor.x += Math.cos(actor.angle) * actor.speed * dt;
          actor.y += Math.sin(actor.angle) * actor.speed * dt;
        }
        this.clamp(actor);
      }
      // 근접한 펫을 양쪽으로 밀어 겹친 자리에 고정되지 않게 합니다.
      const actors = [...this.actors.values()];
      for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
        const a = actors[i], b = actors[j], dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 88) {
          const ux = distance > .01 ? dx / distance : 1, uy = distance > .01 ? dy / distance : 0;
          const push = (88 - distance) / 2 + .1;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
          a.angle = Math.atan2(-uy, -ux); b.angle = Math.atan2(uy, ux);
          this.clamp(a); this.clamp(b);
        }
      }
      actors.forEach(actor => this.paint(actor));
    }
    requestAnimationFrame(next => this.frame(next));
  }
}
