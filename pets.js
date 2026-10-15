"use strict";
// 번호는 저장 식별자입니다. 기존 0~9번은 유지하고 새 종류는 뒤에 추가합니다.
const PET_CATALOG = Object.freeze([
  {name:"새싹뿌",rarity:0,rate:1,bonus:.2,power:0,personality:0,ability:"광합성 · 생산 +0.2 G/s"},
  {name:"돌멩뿌",rarity:0,rate:1,bonus:0,power:1,personality:1,ability:"단단한 손 · 클릭 위력 +1"},
  {name:"물방뿌",rarity:1,rate:3,bonus:1,power:0,personality:2,ability:"물의 흐름 · 생산 +1 G/s"},
  {name:"바람뿌",rarity:1,rate:3,bonus:0,power:2,personality:3,ability:"질풍 · 클릭 위력 +2"},
  {name:"달빛뿌",rarity:2,rate:8,bonus:3,power:0,personality:0,ability:"달빛 수확 · 생산 +3 G/s"},
  {name:"번개뿌",rarity:2,rate:8,bonus:0,power:3,personality:3,ability:"전격 · 클릭 위력 +3"},
  {name:"별무리뿌",rarity:3,rate:20,bonus:8,power:0,personality:2,ability:"별의 축복 · 생산 +8 G/s"},
  {name:"용암뿌",rarity:3,rate:20,bonus:0,power:5,personality:1,ability:"화산의 힘 · 클릭 위력 +5"},
  {name:"태양뿌",rarity:4,rate:60,bonus:25,power:0,personality:3,ability:"황금 햇살 · 생산 +25 G/s"},
  {name:"우주뿌",rarity:4,rate:60,bonus:0,power:8,personality:0,ability:"차원 균열 · 클릭 위력 +8"},
  {name:"버섯뿌",rarity:0,rate:1,bonus:.1,power:0,personality:2,ability:"포근한 포자 · 생산 +0.1 G/s"},
  {name:"이슬뿌",rarity:1,rate:3,bonus:.5,power:1,personality:0,ability:"새벽 물방울 · 생산 +0.5 G/s · 클릭 +1"},
  {name:"서리뿌",rarity:2,rate:8,bonus:1,power:2,personality:1,ability:"반짝 서리 · 생산 +1 G/s · 클릭 +2"},
  {name:"오로라뿌",rarity:3,rate:20,bonus:4,power:3,personality:3,ability:"하늘 커튼 · 생산 +4 G/s · 클릭 +3"},
  {name:"은하뿌",rarity:4,rate:60,bonus:10,power:5,personality:2,ability:"별의 강 · 생산 +10 G/s · 클릭 +5"}
].map(p=>Object.freeze(p)));
