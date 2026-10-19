// 공유 원본을 기존 스크립트에 포함해, 캐시된 HTML에서도 새 의존성 누락으로 클릭이 멈추지 않게 합니다.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const catalog=vm.runInNewContext(fs.readFileSync(path.join(root,'pets.js'),'utf8')+';JSON.stringify(PET_CATALOG)');
const pets=JSON.parse(catalog);
function edit(file,fn){const p=path.join(root,file);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
edit('game.js',t=>t.replace(/^const PETS = [^\r\n]+;[^\r\n]*/m,`const PETS = ${catalog}; // generated from pets.js`));
edit('relationships.js',t=>t.replace(/const PET_PERSONALITY = [^\r\n]+;/,`const PET_PERSONALITY = ${JSON.stringify(pets.map(p=>p.personality))};`));
