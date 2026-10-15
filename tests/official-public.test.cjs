// 운영 공개 키로 비로그인 접근 권한만 확인합니다. 사용자 데이터는 변경하지 않습니다.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server-config.js'),'utf8'),context);
 const config=context.window.WAKPPU_SERVER;
 const headers={apikey:config.publishableKey,'Content-Type':'application/json'};
 const board=await fetch(`${config.url}/rest/v1/rpc/official_leaderboard`,{method:'POST',headers,body:'{}'});
 assert.equal(board.status,200);
 const data=await board.json();assert.ok(Array.isArray(data.top));assert.equal(data.me,null);
 assert.ok(data.top.every(row=>Object.keys(row).every(key=>['nickname','count','rank','is_me'].includes(key))));
 const denied=await fetch(`${config.url}/rest/v1/rpc/official_action`,{method:'POST',headers,body:JSON.stringify({p_action:'join'})});
 assert.ok([401,403].includes(denied.status),'비로그인 명령 차단');
 const deniedV2=await fetch(`${config.url}/rest/v1/rpc/official_action_v2`,{method:'POST',headers,body:JSON.stringify({p_action:'join'})});
 assert.ok([401,403].includes(deniedV2.status),'비로그인 15종 명령 차단');
 const privateTable=await fetch(`${config.url}/rest/v1/players?select=*`,{headers:{...headers,'Accept-Profile':'wakppu_ranked'}});
 assert.ok([401,403,406].includes(privateTable.status),'비공개 스키마/테이블 접근 차단');
 const legacy=await fetch(`${config.url}/rest/v1/game_saves?select=user_id`,{headers});
 assert.ok([401,403].includes(legacy.status),'기존 비공개 저장 권한 유지');
 console.log('PASS: 운영 공개 랭킹 조회·반환 필드, 비로그인 공식 명령 차단, 비공개 스키마 차단, 기존 저장 권한 유지');
})().catch(e=>{console.error(e);process.exitCode=1;});
