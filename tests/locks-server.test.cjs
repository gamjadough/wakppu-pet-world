const {setup}=require('./official-server.test.cjs');
const assert=require('node:assert/strict');
(async()=>{const s=await setup();try{
 const old={version:1,catalogVersion:2,gold:123,pets:[0,0,11],equipped:[2],discovered:[0,11]};
 let r=await s.query(s.A,'select public.save_game($1::jsonb,0) as revision',[JSON.stringify(old)]);assert.equal(r.rows[0].revision,1);
 const locked={...old,lockVersion:1,locked:[1]};
 r=await s.query(s.A,'select public.save_game($1::jsonb,1) as revision',[JSON.stringify(locked)]);assert.equal(r.rows[0].revision,2);
 await assert.rejects(s.query(s.A,'select public.save_game($1::jsonb,2)',[JSON.stringify(old)]),/UPDATE_REQUIRED/);
 let stored=(await s.query(s.A,'select state,revision from public.game_saves')).rows[0];assert.deepEqual(stored.state,locked);assert.equal(stored.revision,2);
 assert.equal((await s.query(s.B,'select * from public.game_saves')).rows.length,0);
 await assert.rejects(s.query(s.B,'select public.save_game($1::jsonb,2)',[JSON.stringify(locked)]),/SAVE_CONFLICT/);
 await assert.rejects(s.query(null,'select public.save_game($1::jsonb,0)',[JSON.stringify(locked)]),/permission denied/);
 await assert.rejects(s.query(s.A,'select public.protect_pet_locks()'),/permission denied/);
 r=await s.query(s.A,'select public.save_game($1::jsonb,2) as revision',[JSON.stringify({...locked,locked:[]})]);assert.equal(r.rows[0].revision,3,'새 클라이언트의 잠금 해제 허용');
 r=await s.query(s.A,'select public.save_game($1::jsonb,3) as revision',[JSON.stringify(old)]);assert.equal(r.rows[0].revision,4,'잠금 없는 이전 저장 호환');
 stored=(await s.query(s.A,'select state from public.game_saves')).rows[0];assert.deepEqual(stored.state,old);
 console.log('PASS: PostgreSQL 잠금 저장·구버전 덮어쓰기 차단·정상 해제·기존 저장 호환·타 계정/비로그인/트리거 직접 호출 차단');
}finally{await s.db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
