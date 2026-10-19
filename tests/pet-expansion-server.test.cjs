const {setup}=require('./official-server.test.cjs');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
(async()=>{
 const pending=randomUUID(); let original;
 const s=await setup({beforeExpansion:async db=>{
  await db.query(`insert into wakppu_ranked.players(user_id,nickname,gold,pets,equipped,discovered,stock,selected,cracks,revision,last_request,last_action,last_args,last_base)
   values($1,'기존_수집가',123.5,array[0,9,8],array[0,2,1],array[0,8,9],array[0,3,0,0],1,4,7,$2,'buy','{"index":1}',6)`,['11111111-1111-4111-8111-111111111111',pending]);
  original=(await db.query('select wakppu_ranked.snapshot(p) as s from wakppu_ranked.players p')).rows[0].s;
 }});
 try{
  let a=await s.action(s.A,'get');assert.deepEqual(a,original,'마이그레이션에서 기존 골드·펫·장착·볼·닉네임·버전 보존');
  const replay=await s.action(s.A,'buy',{index:1},6,pending);assert.deepEqual(replay,original,'업데이트 전 미확인 명령의 재전송도 이중 구매 없음');
  const catalog=vm.runInNewContext(fs.readFileSync('pets.js','utf8')+';JSON.stringify(PET_CATALOG)');
  const pets=JSON.parse(catalog);assert.equal(pets.length,15);
  for(const [file,label] of [['game.js','PETS']]) {
   const source=fs.readFileSync(file,'utf8'),literal=source.match(new RegExp('const '+label+' = (\\[.*\\]);'));
   assert.ok(literal,`${file} 내장 카탈로그`);assert.deepEqual(JSON.parse(literal[1]),pets,`${file}와 공유 원본 일치`);
  }
  const rows=(await s.db.query('select * from wakppu_ranked.pet_catalog order by id')).rows;
  for(const [id,p] of pets.entries()) {
   const r=rows[id];assert.equal(r.name,p.name);assert.equal(r.rarity_level,p.rarity);assert.equal(Number(r.income),p.rate+p.bonus);assert.equal(r.click_power,p.power);assert.equal(r.personality,p.personality);
   for(let j=0;j<pets.length;j++) {
    const other=pets[j],friendly=id!==j && p.personality!==1 && other.personality!==1 && (p.personality===2||other.personality===2||p.personality!==other.personality);
    const expected=(p.rate+p.bonus+other.rate+other.bonus)*(friendly?1.1:1);
    const actual=Number((await s.db.query('select wakppu_ranked.income($1,$2) as n',[[id,j],[0,1]])).rows[0].n);
    assert.ok(Math.abs(actual-expected)<1e-9,`모든 펫 조합의 수익 일치 ${id},${j}`);
   }
  }
  await assert.rejects(s.query(s.A,'select * from wakppu_ranked.pet_catalog'),/permission denied/);
  await assert.rejects(s.query(s.A,'update wakppu_ranked.pet_catalog set income=9999'),/permission denied/);
  const normal=JSON.stringify({version:1,catalogVersion:2,gold:50,pets:[0,10,14],discovered:[0,10,14]});
  await s.query(s.A,'select public.save_game($1::jsonb,0)',[normal]);
  await assert.rejects(s.query(s.A,'select public.save_game($1::jsonb,1)',[JSON.stringify({version:1,gold:50,pets:[0],discovered:[0]})]),/UPDATE_REQUIRED/);
  assert.deepEqual((await s.query(s.A,'select state from public.game_saves')).rows[0].state.pets,[0,10,14],'이전 클라이언트가 신규 펫을 제거한 상태를 업로드해도 서버 원본 유지');
  await s.query(s.A,'select public.save_game($1::jsonb,1)',[normal]);
  await assert.rejects(s.query(null,"select public.official_action_v2('join')"),/permission denied/);
  await s.action(s.B,'join');
  await s.db.exec('select setseed(0.314159)');
  const found=new Set();
  for(let i=0;i<1000 && found.size<15;i++) {
   await s.db.query("update wakppu_ranked.players set pets='{}',equipped='{}',selected=3,stock=array[0,0,0,1],cracks=44,next_tap='-infinity' where user_id=$1",[s.B]);
   const r=await s.action(s.B,'get');const next=await s.action(s.B,'tap',{},r.revision);
   assert.ok(next.hatched>=0&&next.hatched<15);found.add(next.hatched);
   assert.equal(next.stock[3],0);
  }
  assert.equal(found.size,15,'실제 서버 부화에서 15종 모두 도달 가능');
  await s.db.query('update wakppu_ranked.players set discovered=$1 where user_id=$2',[Array.from({length:15},(_,i)=>i),s.B]);
  let b=await s.action(s.B,'get');b=await s.action(s.B,'nickname',{nickname:'전체_수집가'},b.revision);
  assert.equal((await s.board(s.B)).me.count,15);assert.equal((await s.board(s.B)).me.rank,1);
  await assert.rejects(s.query(s.B,"select public.official_action('get')"),/UPDATE_REQUIRED/);
  const legacy=await s.query(s.A,"select public.official_action('get') as result");assert.equal(legacy.rows[0].result.pets.length,3);
  await s.db.exec(fs.readFileSync('supabase/audit-official.sql','utf8'));
  console.log('PASS: 기존 기록·이전 미확인 요청 보존, 15종 클라이언트/서버 규칙 일치, 225개 성격 조합 수익, 신규 5종 실제 부화·랭킹 15종, 구버전 보호, 카탈로그 쓰기·비로그인 차단');
 }finally{await s.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
