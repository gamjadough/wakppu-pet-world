const {setup}=require('./official-server.test.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const pets=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pets.js'),'utf8')+';JSON.stringify(PET_CATALOG)');
const catalog=JSON.parse(pets);
function expected(ids,fighting=[]){return ids.reduce((sum,id,i)=>{if(fighting.includes(i))return sum;const a=catalog[id];const friend=ids.some((other,j)=>{const b=catalog[other];return i!==j&&!fighting.includes(j)&&id!==other&&a.personality!==1&&b.personality!==1&&(a.personality===2||b.personality===2||a.personality!==b.personality);});return sum+(a.rate+a.bonus)*(friend?1.1:1);},0);}
(async()=>{const s=await setup();try{
 const save=(ids,equipped=ids.map((_,i)=>i),extra={})=>({version:1,catalogVersion:2,lockVersion:1,pets:ids,equipped,locked:[0],gold:12,...extra});
 const put=async(user,state,rev)=>(await s.query(user,'select public.save_game($1::jsonb,$2) as rev',[JSON.stringify(state),rev])).rows[0].rev;
 const board=async user=>(await s.query(user,'select public.income_leaderboard() as result')).rows[0].result;
 const profile=async(user,name)=>(await s.query(user,'select public.set_income_profile($1) as result',[name])).rows[0].result;
 assert.deepEqual((await board(null)).top,[]);
 await assert.rejects(profile(null,'익명'),/permission denied/);
 await assert.rejects(profile(s.A,'첫정원'),/SAVE_REQUIRED/);
 let rev=await put(s.A,save([0,2,4]),0);await put(s.B,save([0,2,4]),0);
 assert.equal((await board(null)).total,0,'기존 저장은 자동 공개하지 않음');
 const before=(await s.query(s.A,'select state,revision from public.game_saves')).rows[0];
 let b=await profile(s.A,'정원_A');assert.equal(b.me.rank,1);assert.ok(Math.abs(Number(b.me.income)-expected([0,2,4]))<1e-8);
 assert.deepEqual((await s.query(s.A,'select state,revision from public.game_saves')).rows[0],before,'참여가 게임 기록을 바꾸지 않음');
 for(const bad of ['a','<script>','두줄\n이름','😀😀','가'.repeat(17)]) await assert.rejects(profile(s.A,bad),/INVALID_NAME/);
 await assert.rejects(profile(s.B,'정원_a'),/NAME_TAKEN/);
 b=await profile(s.B,'정원_B');assert.equal(b.me.rank,1);assert.ok(b.top.every(x=>x.rank===1));
 assert.equal((await board(null)).me,null);assert.ok((await board(null)).top.every(x=>!x.is_me));
 for(const user of [null,s.A,s.B]) {
  await assert.rejects(s.query(user,'select * from wakppu_income.profiles'),/permission denied/);
  await assert.rejects(s.query(user,"delete from wakppu_income.profiles"),/permission denied/);
  await assert.rejects(s.query(user,'select wakppu_income.rate($1::jsonb)',[JSON.stringify(save([8]))]),/permission denied/);
 }
 assert.equal((await s.query(s.B,'select * from public.game_saves')).rows.length,1);
 const publicFields=['rank','nickname','income','updated_at','is_me'];assert.ok((await board(s.A)).top.every(row=>Object.keys(row).every(k=>publicFields.includes(k))));
 for(let a=0;a<15;a++)for(let c=0;c<15;c++){
  const ids=[a,c,(a+c)%15], state=save(ids);
  const r=await s.db.query('select wakppu_income.rate($1::jsonb) as income',[JSON.stringify(state)]);
  assert.ok(Math.abs(Number(r.rows[0].income)-expected(ids))<1e-8,'카탈로그와 궁합 '+ids);
 }
 rev=await put(s.A,save([0,1,2],[0,1,2],{fights:[[0,1]],fightEndsAt:Date.now()+20000}),rev);
 b=await board(s.A);assert.equal(Number(b.me.income),4,'다툼 참가자와 응원 제외');
 await s.db.query("update public.game_saves set state=jsonb_set(state,'{fightEndsAt}','1') where user_id=$1",[s.A]);
 b=await board(s.A);assert.ok(Math.abs(Number(b.me.income)-expected([0,1,2]))<1e-8,'다툼 자동 만료 반영');
 rev=await put(s.A,save([8,8,8]),rev);b=await board(s.A);assert.equal(Number(b.me.income),255);assert.equal(b.me.rank,1);
 await assert.rejects(put(s.A,save([0]),rev-1),/SAVE_CONFLICT/);assert.equal(Number((await board(s.A)).me.income),255);
 rev=await put(s.A,save([8],[0,0,9999]),rev);assert.equal(Number((await board(s.A)).me.income),85,'중복·잘못된 장착 번호 제외');
 for(const state of [{},{pets:null,equipped:[]},{pets:[8],equipped:'bad'},{pets:[999],equipped:[0]},{pets:[8],equipped:[0],fights:[null,1,[],['x',0]],fightEndsAt:Date.now()+5000}]){
  const r=await s.db.query('select wakppu_income.rate($1::jsonb) as income',[JSON.stringify(state)]);assert.ok(Number.isFinite(Number(r.rows[0].income)));
 }
 await profile(s.A,null);assert.equal((await board(s.A)).me,null);assert.equal((await board(null)).total,1);assert.equal((await board(s.B)).me.nickname,'정원_B');
 // 상위 100명 밖의 내 순위와 동률 정렬을 확인합니다.
 await s.db.exec(`insert into auth.users select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,101)i;
 insert into public.game_saves(user_id,state) select id,'{"version":1,"pets":[8,8,8],"equipped":[0,1,2]}'::jsonb from auth.users where id::text like '00000000%';
 insert into wakppu_income.profiles(user_id,nickname) select id,'참여자_'||right(id::text,3) from auth.users where id::text like '00000000%';`);
 b=await board(s.B);assert.equal(b.top.length,100);assert.equal(b.me.rank,102);assert.equal(b.total,102);
 const policies=(await s.db.query("select relrowsecurity from pg_class where oid='wakppu_income.profiles'::regclass")).rows;assert.equal(policies[0].relrowsecurity,true);
 console.log('PASS: PostgreSQL 수익·15종 궁합225조합·다툼 만료·동률·상위100/내순위·참여/취소·개인정보/타계정 접근 차단·저장 보존·오류 롤백');
}finally{await s.db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
