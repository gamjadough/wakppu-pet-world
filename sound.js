"use strict";

// 외부 음원 없이 짧은 타격음과 부화음을 만듭니다. 클릭 시에만 오디오를 시작합니다.
class GameSounds {
  constructor() { this.context = null; }
  play(kind) {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      this.context ||= new Audio();
      const context = this.context;
      if (context.state === "suspended") context.resume().catch(() => {});
      const start = context.currentTime;
      const tone = (frequency, offset, duration, volume, type = "sine") => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * .55, start + offset + duration);
        gain.gain.setValueAtTime(volume, start + offset);
        gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(start + offset); oscillator.stop(start + offset + duration);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      };
      if (kind === "click") tone(540, 0, .09, .055, "triangle");
      else {
        tone(130, 0, .18, .08, "triangle");
        [660, 880, 1320].forEach((frequency, i) => tone(frequency, .06 + i * .08, .26, .045));
      }
    } catch { /* 소리 재생이 불가능해도 게임은 계속됩니다. */ }
  }
}
