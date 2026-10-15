"use strict";
(() => {
  const $ = id => document.getElementById(`official-${id}`);
  const PET_CATALOG = [{"name":"새싹뿌","rarity":0,"rate":1,"bonus":0.2,"power":0,"personality":0,"ability":"광합성 · 생산 +0.2 G/s"},{"name":"돌멩뿌","rarity":0,"rate":1,"bonus":0,"power":1,"personality":1,"ability":"단단한 손 · 클릭 위력 +1"},{"name":"물방뿌","rarity":1,"rate":3,"bonus":1,"power":0,"personality":2,"ability":"물의 흐름 · 생산 +1 G/s"},{"name":"바람뿌","rarity":1,"rate":3,"bonus":0,"power":2,"personality":3,"ability":"질풍 · 클릭 위력 +2"},{"name":"달빛뿌","rarity":2,"rate":8,"bonus":3,"power":0,"personality":0,"ability":"달빛 수확 · 생산 +3 G/s"},{"name":"번개뿌","rarity":2,"rate":8,"bonus":0,"power":3,"personality":3,"ability":"전격 · 클릭 위력 +3"},{"name":"별무리뿌","rarity":3,"rate":20,"bonus":8,"power":0,"personality":2,"ability":"별의 축복 · 생산 +8 G/s"},{"name":"용암뿌","rarity":3,"rate":20,"bonus":0,"power":5,"personality":1,"ability":"화산의 힘 · 클릭 위력 +5"},{"name":"태양뿌","rarity":4,"rate":60,"bonus":25,"power":0,"personality":3,"ability":"황금 햇살 · 생산 +25 G/s"},{"name":"우주뿌","rarity":4,"rate":60,"bonus":0,"power":8,"personality":0,"ability":"차원 균열 · 클릭 위력 +8"},{"name":"버섯뿌","rarity":0,"rate":1,"bonus":0.1,"power":0,"personality":2,"ability":"포근한 포자 · 생산 +0.1 G/s"},{"name":"이슬뿌","rarity":1,"rate":3,"bonus":0.5,"power":1,"personality":0,"ability":"새벽 물방울 · 생산 +0.5 G/s · 클릭 +1"},{"name":"서리뿌","rarity":2,"rate":8,"bonus":1,"power":2,"personality":1,"ability":"반짝 서리 · 생산 +1 G/s · 클릭 +2"},{"name":"오로라뿌","rarity":3,"rate":20,"bonus":4,"power":3,"personality":3,"ability":"하늘 커튼 · 생산 +4 G/s · 클릭 +3"},{"name":"은하뿌","rarity":4,"rate":60,"bonus":10,"power":5,"personality":2,"ability":"별의 강 · 생산 +10 G/s · 클릭 +5"}]; // generated from pets.js
  const names = PET_CATALOG.map(p=>p.name);
  const rates = PET_CATALOG.map(p=>p.rate+p.bonus), rarities=['일반','희귀','초희귀','영웅','신화'];
  const colors=['#98ac9e','#75b59c','#88a6d0','#b8a0ce','#d6b36c'];
  const balls=['기본 왁뿌볼','오로라 왁뿌볼','네뷸라 왁뿌볼','태양 왁뿌볼'];
  const prices=[0,50,300,1500], limits=[12,20,30,45];
  const odds=[[70,22,6,1.8,.2],[40,35,18,6,1],[20,35,28,14,3],[10,25,35,23,7]];
  const number = n => Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1});
  let client, owner=null, state=null, pending=null, busy=false, queue=Promise.resolve(), queued=0, epoch=0, page=0;
  let stockKey='',petKey='',codexKey='';
  const key = () => `wakppu-official:pending:${owner}`;
  const errors={LOGIN_REQUIRED:'Google 로그인이 필요합니다.',JOIN_REQUIRED:'공식 정원을 먼저 시작해 주세요.',NOT_ENOUGH_GOLD:'골드가 부족합니다.',NO_BALL:'선택한 볼이 없습니다.',TOO_FAST:'잠시 기다린 뒤 볼을 눌러 주세요.',PET_LIMIT:'펫 보관 한도에 도달했습니다.',STOCK_LIMIT:'볼 보관 한도에 도달했습니다.',INVALID_NAME:'닉네임은 한글·영문·숫자·_ 2~12자로 입력해 주세요. 관리자 이름은 사용할 수 없습니다.',NAME_TAKEN:'이미 사용 중인 닉네임입니다.',UNEQUIP_FIRST:'장착을 해제한 뒤 방생해 주세요.'};
  function notice(text) { $('notice').textContent=text; $('notice').hidden=!text; }
  function errorText(error) {
    const text=String(error?.message||error);
    return Object.entries(errors).find(([code])=>text.includes(code))?.[1] || '연결하지 못했습니다. 기록을 확인한 뒤 다시 시도해 주세요.';
  }
  function clearPending() { localStorage.removeItem(key()); pending=null; $('retry').hidden=true; }
  function render() {
    const active=!!state && !!owner;
    $('game').hidden=!active; $('profile').hidden=!active;
    $('join').hidden=!owner || active; $('login').hidden=!!owner;
    $('session').textContent=owner ? (state?.nickname ? `${state.nickname}님의 공식 정원` : '로그인됨 · 기존 정원과 별도로 저장됩니다.') : '로그인하면 어디서든 같은 공식 정원을 이어갈 수 있습니다.';
    if(!active) return;
    $('gold').textContent=`${number(state.gold)} G`; $('income').textContent=`${number(state.income)} G/s`;
    $('count').textContent=`${state.discovered.length} / ${names.length}`; $('slots').textContent=`장착 ${state.equipped.length} / 3`;
    $('ball-name').textContent=balls[state.selected]; $('ball').dataset.tier=state.selected;
    $('progress').max=limits[state.selected]; $('progress').value=state.cracks;
    $('cracks').textContent=`균열 ${state.cracks} / ${limits[state.selected]}`;
    const nextStock=JSON.stringify([state.stock,state.selected]);
    if(stockKey!==nextStock) {
    $('stock').replaceChildren(...balls.map((name,i)=>{
      const button=document.createElement('button'); button.textContent=`${name} · ${i ? state.stock[i] : '∞'}`;
      button.setAttribute('aria-pressed',String(i===state.selected)); button.disabled=i>0 && !state.stock[i];
      button.addEventListener('click',()=>enqueue('select',{index:i})); return button;
    }));
    stockKey=nextStock;
    }
    document.querySelectorAll('[data-official-buy]').forEach(b=>{b.disabled=state.gold<prices[Number(b.dataset.officialBuy)] || state.stock[Number(b.dataset.officialBuy)]>=9999;});
    if(document.activeElement!==$('nickname')) $('nickname').value=state.nickname||'';
    $('hide').hidden=!state.nickname;
    page=Math.min(page,Math.max(0,Math.ceil(state.pets.length/20)-1));
    const nextPets=JSON.stringify([state.pets,state.equipped,page]);
    if(petKey!==nextPets) {
    const cards=state.pets.slice(page*20,(page+1)*20).map((id,offset)=>{
      const index=page*20+offset, equipped=state.equipped.includes(index), rarity=PET_CATALOG[id].rarity;
      const card=document.createElement('article'); card.className=`pet species-${id}${equipped?' equipped':''}`;
      const icon=document.createElement('div'); icon.className='pet-mark'; icon.style.setProperty('--pet-color',colors[rarity]); icon.textContent=names[id][0];
      const name=document.createElement('h3'); name.textContent=names[id];
      const rate=document.createElement('p'); rate.textContent=`${rarities[rarity]} · ${rates[id]} G/s`;
      const equip=document.createElement('button'); equip.textContent=equipped?'장착 해제':'장착하기'; equip.dataset.equip=index;
      equip.addEventListener('click',()=>enqueue('equip',{index}));
      const release=document.createElement('button'); release.className='release'; release.textContent=`방생 · +${rates[id]} G`; release.disabled=equipped; release.dataset.release=index;
      release.addEventListener('click',()=>{
        if(confirm(`${names[id]}을 방생할까요? 펫은 사라지며 도감 기록은 유지됩니다.`)) enqueue('release',{index});
      });
      const ability=document.createElement('p'); ability.textContent=PET_CATALOG[id].ability;
      card.append(icon,name,rate,ability,equip,release); return card;
    });
    if(!cards.length) { const p=document.createElement('p'); p.className='muted'; p.textContent='아직 친구가 없어요. 무료 볼을 깨 보세요.'; cards.push(p); }
    $('pets').replaceChildren(...cards);
    petKey=nextPets;
    }
    $('prev').disabled=page===0; $('next').disabled=(page+1)*20>=state.pets.length;
    $('page').textContent=`${page+1} / ${Math.max(1,Math.ceil(state.pets.length/20))}`;
    const nextCodex=JSON.stringify(state.discovered);
    if(codexKey!==nextCodex) {
      $('codex').replaceChildren(...names.map((name,id)=>{ const s=document.createElement('span'); const known=state.discovered.includes(id); s.textContent=known?name:'???'; s.className=known?'':'unknown'; return s; }));
      codexKey=nextCodex;
    }
  }
  async function rpc(name,args) {
    const {data,error}=await client.rpc(name==='official_action'?'official_action_v2':name,args);
    if(error) throw error;
    return data;
  }
  async function refreshBoard() {
    if(!client) return;
    const generation=epoch;
    try {
      const data=await rpc('official_leaderboard'); if(generation!==epoch) return;
      $('ranking').replaceChildren(...data.top.map(item=>{
        const row=document.createElement('tr'); if(item.is_me) row.className='me';
        for(const text of [`${item.rank}위`,item.nickname,`${item.count} / ${names.length}`]) {const cell=document.createElement('td');cell.textContent=text;row.append(cell);}return row;
      }));
      $('empty').hidden=data.top.length>0;
      $('me').textContent=data.me?`내 순위 ${data.me.rank}위 · ${data.me.nickname} · ${data.me.count} / ${names.length}`:'닉네임을 등록하면 내 순위가 표시됩니다.';
    } catch { notice('랭킹을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.'); }
  }
  async function load() {
    const generation=epoch;
    try {const data=await rpc('official_action',{p_action:'get'}); if(generation!==epoch) return;state=data;render();}
    catch(error) { if(generation!==epoch) return; if(String(error.message).includes('JOIN_REQUIRED')) {state=null;render();} else throw error; }
  }
  async function send(action,args={},guard=null) {
    if(!owner) {notice(errors.LOGIN_REQUIRED);return;}
    if(pending) {notice('확인하지 못한 동작이 있습니다. 연결을 다시 확인해 주세요.');$('retry').hidden=false;return;}
    if(guard && JSON.stringify(state?.pets)!==guard) {notice('펫 목록이 바뀌었습니다. 현재 목록에서 다시 선택해 주세요.');return;}
    const request={p_action:action,p_args:args,p_revision:state?.revision||0,p_request:crypto.randomUUID()};
    try {localStorage.setItem(key(),JSON.stringify(request));pending=request;}
    catch {notice('브라우저의 복구 기록을 보관할 수 없습니다. 저장 공간과 사이트 데이터 설정을 확인해 주세요.');return;}
    await deliver();
  }
  async function deliver() {
    const generation=epoch, request=pending;
    if(!request || busy) return;
    busy=true;
    try {
      const result=await rpc('official_action',request);
      if(generation!==epoch) return;
      state=result;clearPending();notice('');render();
      if(request.p_action==='tap' && result.hatched!==null) $('result').textContent=`${rarities[PET_CATALOG[result.hatched].rarity]} · ${names[result.hatched]} 부화! 인벤토리에서 장착해 보세요.`;
      if(request.p_action==='nickname' || (request.p_action==='tap' && result.hatched!==null)) await refreshBoard();
    } catch(error) {
      if(generation!==epoch) return;
      const text=String(error.message||error);
      if(text.includes('RANK_CONFLICT') || text.includes('REQUEST_MISMATCH')) {
        try {await load();clearPending();await refreshBoard();notice('다른 기기의 최신 기록을 불러왔습니다. 현재 결과를 확인한 뒤 계속해 주세요.');}
        catch {notice(errorText(error));$('retry').hidden=false;}
      } else if(Object.keys(errors).some(code=>text.includes(code)) || /INVALID_|permission denied|PGRST202/.test(text)) {
        clearPending();notice(errorText(error));
      } else {notice('연결이 끊겼습니다. 이 동작을 보관했으며 연결이 돌아오면 결과를 확인합니다.');$('retry').hidden=false;}
    } finally {busy=false;}
  }
  function enqueue(action,args={}) {
    if(queued>=12) return;
    const generation=epoch, guard=['equip','release'].includes(action)?JSON.stringify(state?.pets):null;
    queued++;
    queue=queue.then(async()=>{if(generation===epoch) await send(action,args,guard);}).catch(error=>notice(errorText(error))).finally(()=>{queued--;});
    return queue;
  }
  async function setUser(user) {
    if((user?.id||null)===owner) return;
    epoch++;owner=user?.id||null;state=null;pending=null;page=0;stockKey=petKey=codexKey='';render();
    if(!owner) {await refreshBoard();return;}
    try {
      try {pending=JSON.parse(localStorage.getItem(key()));} catch {notice('복구 기록을 읽지 못했습니다.');}
      await load();
      if(pending) await deliver();
      await refreshBoard();
    } catch(error) {notice(errorText(error));$('retry').hidden=false;}
  }
  $('join').addEventListener('click',()=>enqueue('join'));
  $('ball').addEventListener('click',()=>enqueue('tap'));
  $('profile').addEventListener('submit',event=>{event.preventDefault();enqueue('nickname',{nickname:$('nickname').value.normalize('NFC').trim()});});
  $('hide').addEventListener('click',()=>enqueue('nickname',{nickname:''}));
  $('refresh').addEventListener('click',refreshBoard);
  $('prev').addEventListener('click',()=>{page--;render();}); $('next').addEventListener('click',()=>{page++;render();});
  $('retry').addEventListener('click',()=>{queue=queue.then(async()=>{if(pending) await deliver();else {await load();await refreshBoard();notice('');$('retry').hidden=true;}}).catch(e=>notice(errorText(e)));});
  $('login').addEventListener('click',async()=>{try {const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error) throw error;}catch(e){notice(errorText(e));}});
  $('shop').replaceChildren(...balls.slice(1).map((name,i)=>{
    const row=document.createElement('div');row.className='shop-row';
    const label=document.createElement('div'), title=document.createElement('strong'), hint=document.createElement('small');title.textContent=name;hint.textContent=`균열 ${limits[i+1]} · 신화 ${odds[i+1][4]}%`;label.append(title,hint);
    const button=document.createElement('button');button.textContent=`${prices[i+1]} G`;button.dataset.officialBuy=i+1;button.addEventListener('click',()=>enqueue('buy',{index:i+1}));row.append(label,button);return row;
  }));
  $('odds').replaceChildren(...balls.map((name,i)=>{const p=document.createElement('p');p.textContent=`${name}: ${rarities.map((r,j)=>`${r} ${odds[i][j]}%`).join(' · ')}`;return p;}));
  async function initialize() {
    try {
      const config=window.WAKPPU_SERVER;
      if(!window.supabase || !config?.url || !config?.publishableKey) throw new Error('SDK unavailable');
      client=window.supabase.createClient(config.url,config.publishableKey,{global:{fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
      let timer;
      const {data,error}=await Promise.race([client.auth.getSession(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Session timeout')),15000);})]).finally(()=>clearTimeout(timer));
      if(error) throw error;
      await setUser(data.session?.user);
      if(!owner) {render();await refreshBoard();}
      client.auth.onAuthStateChange((event,session)=>{if((session?.user?.id||null)!==owner) setTimeout(()=>setUser(session?.user),0);});
      setInterval(()=>{
        if(document.hidden || !owner || queued || busy) return;
        if(pending) queue=queue.then(deliver).catch(e=>notice(errorText(e)));
        else if(state) enqueue('sync');
      },5000);
      window.addEventListener('online',()=>{if(pending && !busy) queue=queue.then(deliver).catch(e=>notice(errorText(e)));});
    } catch(error) {$('session').textContent='계정에 연결하지 못했습니다.';notice(errorText(error));}
  }
  initialize();
})();
