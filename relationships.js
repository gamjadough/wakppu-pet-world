"use strict";

// 종류별 성격은 고정입니다. 기존 펫 저장 번호를 바꾸거나 다시 뽑지 않습니다.
const PERSONALITIES = ["차분한", "고집센", "다정한", "호기심 많은"];
const PET_PERSONALITY = [0, 1, 2, 3, 0, 3, 2, 1, 3, 0];
function relationship(a, b) {
  if (a === b) return "neutral";
  const left = PET_PERSONALITY[a], right = PET_PERSONALITY[b];
  if (left === 1 || right === 1) return left === right ? "neutral" : "bicker";
  if (left === 2 || right === 2 || left !== right) return "friends";
  return "neutral";
}
