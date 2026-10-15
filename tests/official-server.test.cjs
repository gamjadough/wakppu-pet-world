// 실제 PostgreSQL (PGlite)로 함수·권한·상태 전이를 검증합니다.
const { PGlite } = require(process.env.TEST_PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const migration = path.join(__dirname, '../supabase/migrations/20261015091950_official_collection.sql');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${A}'),('${B}');`);
  await db.exec(fs.readFileSync(migration,'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/schema.sql'),'utf8'));
  let transaction = Promise.resolve();
  function query(user, sql, params=[]) {
    const result = transaction.then(()=>runQuery(user,sql,params));
    transaction = result.catch(()=>{});
    return result;
  }
  async function runQuery(user, sql, params=[]) {
    await db.exec('begin');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || '']);
      await db.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
      const result = await db.query(sql,params);
      await db.exec('commit'); return result;
    } catch(e) { await db.exec('rollback'); throw e; }
  }
  const action = async (user,name,args={},rev=0,id=randomUUID()) => (await query(user,
    'select public.official_action($1,$2::jsonb,$3,$4::uuid) as result',[name,JSON.stringify(args),rev,id])).rows[0].result;
  const board = async user => (await query(user,'select public.official_leaderboard() as result')).rows[0].result;
  return { db,query,action,board,A,B };
}
module.exports = { setup };
if (require.main === module) (async()=>{
  const { db,query,action,board } = await setup();
  try {
    let a = await action(A,'join'), b = await action(B,'join');
    assert.equal(a.gold,0); assert.deepEqual(a.pets,[]);
    await query(A,'select public.save_game($1::jsonb,0)',[JSON.stringify({version:1,gold:999999999,pets:[8,9],discovered:[0,1,2,3,4,5,6,7,8,9]})]);
    assert.equal((await action(A,'get')).gold,0,'기존 업로드 API의 골드와 펫은 공식 정원에 유입되지 않습니다');
    assert.deepEqual((await action(A,'get')).discovered,[]);
    await assert.rejects(action(null,'join'),/permission denied/);
    await assert.rejects(query(A,'select * from wakppu_ranked.players'),/permission denied/);
    await assert.rejects(query(A,"update wakppu_ranked.players set gold=9999"),/permission denied/);
    await assert.rejects(action(A,'sync',{gold:999999},a.revision),/INVALID_ACTION/);
    await assert.rejects(action(A,'buy',{index:1},a.revision),/NOT_ENOUGH_GOLD/);
    await assert.rejects(action(A,'select',{index:1},a.revision),/NO_BALL/);
    await assert.rejects(action(A,'equip',{index:0},a.revision),/INVALID_INDEX/);
    await assert.rejects(action(A,'nickname',{nickname:'<script>'},a.revision),/INVALID_NAME/);
    await assert.rejects(action(A,'nickname',{},a.revision),/INVALID_NAME/);
    a = await action(A,'nickname',{nickname:'수집가_A'},a.revision);
    await assert.rejects(action(B,'nickname',{nickname:'수집가_a'},b.revision),/NAME_TAKEN/);
    b = await action(B,'nickname',{nickname:'수집가_B'},b.revision);
    let ranks = await board(null);
    assert.equal(ranks.top.length,2); assert.equal(ranks.me,null);
    assert.ok(ranks.top.every(x=>x.rank===1 && !('user_id' in x)));
    const request = randomUUID(), base = a.revision;
    a = await action(A,'tap',{},base,request);
    const same = await action(A,'tap',{},base,request);
    assert.equal(same.revision,a.revision); assert.equal(same.cracks,1);
    await assert.rejects(action(A,'tap',{},base),/RANK_CONFLICT/);
    await assert.rejects(action(A,'sync',{},base,request),/REQUEST_MISMATCH/);
    await assert.rejects(action(A,'tap',{},a.revision),/TOO_FAST/);
    for(let i=0;i<11;i++) {
      await db.query("update wakppu_ranked.players set next_tap='-infinity' where user_id=$1",[A]);
      a = await action(A,'tap',{},a.revision);
    }
    assert.equal(a.pets.length,1); assert.equal(a.discovered.length,1); assert.equal(a.cracks,0);
    const pet = a.pets[0];
    assert.ok(pet>=0 && pet<=9);
    a = await action(A,'equip',{index:0},a.revision);
    assert.ok(a.income>0);
    await db.query("update wakppu_ranked.players set last_seen=clock_timestamp()-interval '5 seconds' where user_id=$1",[A]);
    a = await action(A,'sync',{},a.revision);
    assert.ok(a.gold >= a.income*4.9 && a.gold < a.income*6, '서버 경과 시간에 따른 수익');
    await db.query("update wakppu_ranked.players set last_seen=clock_timestamp()-interval '1 day' where user_id=$1",[A]);
    const before=a.gold;
    a = await action(A,'sync',{},a.revision);
    assert.equal(a.gold,before,'오프라인 수익 차단');
    await assert.rejects(action(A,'release',{index:0},a.revision),/UNEQUIP_FIRST/);
    ranks = await board(A);
    assert.equal(ranks.me.rank,1); assert.equal(ranks.me.count,1);
    assert.equal((await board(B)).me.rank,2);
    a=await action(A,'equip',{index:0},a.revision);
    a=await action(A,'release',{index:0},a.revision);
    assert.equal(a.pets.length,0); assert.equal(a.discovered.length,1);
    a=await action(A,'nickname',{nickname:''},a.revision);
    assert.equal((await board(A)).me,null);
    assert.equal((await board(null)).top.length,1);
    assert.equal((await action(B,'get')).gold,0,'다른 사용자 진행 격리');
    // 유료 볼은 서버 구매로만 늘고 부화 시 정확히 한 개 소모합니다.
    await db.query('update wakppu_ranked.players set gold=100 where user_id=$1',[A]);
    a=await action(A,'buy',{index:1},a.revision);
    assert.equal(a.gold,50); assert.equal(a.stock[1],1);
    a=await action(A,'select',{index:1},a.revision);
    for(let i=0;i<20;i++) {
      await db.query("update wakppu_ranked.players set next_tap='-infinity' where user_id=$1",[A]);
      a=await action(A,'tap',{},a.revision);
    }
    assert.equal(a.stock[1],0); assert.equal(a.selected,0); assert.equal(a.pets.length,1);
    a=await action(A,'nickname',{nickname:'수집가_A'},a.revision);
    await db.exec(`do $$ declare id uuid; begin for i in 1..55 loop id:=gen_random_uuid();
      insert into auth.users values(id); insert into wakppu_ranked.players(user_id,nickname,discovered) values(id,'경쟁자_'||i,array[0,1,2]);
      end loop; end $$;`);
    ranks=await board(A);
    assert.equal(ranks.top.length,50);
    assert.equal(ranks.me.rank,56,'상위 50명 밖에서도 내 순위 표시');
    assert.ok(ranks.top.every(r=>r.rank===1));
    console.log('PASS: 실제 PostgreSQL 권한·계정 격리·변조 차단·서버 구매/부화/수익·중복 요청·버전 충돌·닉네임·공동 순위·참가 해제');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
