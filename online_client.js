/* Blokus online client (uses BLOKUS core globals + DOM) */
var N=BLOKUS.N,ORI=BLOKUS.ORI,SIZE=BLOKUS.SIZE,COLORS=BLOKUS.COLORS,CNAMES=BLOKUS.CNAMES,CORNERS=BLOKUS.CORNERS;
var PMAP={};BLOKUS.PIECES.forEach(function(p){PMAP[p[0]]=p[1];});
var SRV_DEFAULT='https://blokus-server.ryo5exeg.workers.dev';
var SRV='',PID='',CODE='',MYSEAT=-1,ROOM=null,VIEW=null,REV=0,poll=null,polling=false,failCount=0;
var SEL=null,ORII=0,GHOST=null;
function g(id){return document.getElementById(id);}
function toast(m){var t=g('toast');t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('on');},2200);}
function err(m){g('err').textContent=m;}
function show(id){['lobby','waiting','game'].forEach(function(x){g(x).classList.toggle('hidden',x!==id);});}
function api(path,method,bodyObj){return fetch(SRV.replace(/\/$/,'')+path,{method:method||'GET',headers:{'content-type':'application/json'},body:bodyObj?JSON.stringify(bodyObj):undefined}).then(function(r){return r.json();});}
function saveSession(){try{localStorage.setItem('bk_online',JSON.stringify({SRV:SRV,CODE:CODE,PID:PID}));}catch(e){}}

function createRoom(){SRV=g('srv').value.trim()||SRV_DEFAULT;var nm=g('nm').value.trim()||'プレイヤー';err('');
  api('/api/room/create','POST',{hostName:nm}).then(function(r){if(r.error){err(r.error);return;}PID=r.playerId;CODE=r.code;MYSEAT=r.seat;ROOM=r.room;saveSession();enterWaiting();}).catch(function(){err('接続できませんでした');});}
function joinRoom(){SRV=g('srv').value.trim()||SRV_DEFAULT;var nm=g('nm').value.trim()||'プレイヤー';var c=(g('jc').value||'').trim().toUpperCase();if(!c){err('部屋コードを入れてね');return;}err('');
  api('/api/room/'+c+'/join','POST',{name:nm}).then(function(r){if(r.error){err(r.error);return;}PID=r.playerId;CODE=c;MYSEAT=r.seat;ROOM=r.room;saveSession();enterWaiting();}).catch(function(){err('参加できませんでした');});}
function shareLink(){var url=location.origin+location.pathname+'?server='+encodeURIComponent(SRV)+'&code='+CODE;
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(function(){g('sharemsg').textContent='リンクをコピーしました！仲間に送ってね';}).catch(function(){g('sharemsg').textContent=url;});}else g('sharemsg').textContent=url;}
function enterWaiting(){saveSession();show('waiting');g('wcode').textContent=CODE;startPoll();}
function tryReconnect(sv){SRV=sv.SRV;CODE=sv.CODE;PID=sv.PID;api('/api/room/'+CODE+'/state?playerId='+PID).then(function(r){if(r&&r.ok&&r.you>=0){ROOM=r.room;MYSEAT=r.you;startPoll();}else{localStorage.removeItem('bk_online');show('lobby');}}).catch(function(){localStorage.removeItem('bk_online');show('lobby');});}
function leave(){stopPoll();try{localStorage.removeItem('bk_online');}catch(e){}show('lobby');}

function stopPoll(){polling=false;if(poll){clearTimeout(poll);poll=null;}}
function startPoll(){stopPoll();polling=true;tick();}
function nextDelay(){if(!ROOM||!ROOM.started)return 1500;if(!VIEW)return 1000;if(VIEW.over)return 3000;return (VIEW.turn===MYSEAT)?2500:800;}
function tick(){
  if(!polling)return;if(poll){clearTimeout(poll);poll=null;}
  api('/api/room/'+CODE+'/state?playerId='+PID).then(function(r){
    failCount=0;g('connbar').classList.add('hidden');
    if(!r||r.error)return;ROOM=r.room;MYSEAT=r.you;REV=r.rev||0;
    if(!r.started){renderWaiting();show('waiting');}
    else{VIEW=r.view;show('game');renderGame();}
  }).catch(function(){failCount++;if(failCount>=3)g('connbar').classList.remove('hidden');})
  .then(function(){if(polling)poll=setTimeout(tick,nextDelay());});
}
function renderWaiting(){
  g('wplist').innerHTML=(ROOM.players||[]).map(function(p){return '<div class="prow"><span><span class="dot" style="display:inline-block;width:13px;height:13px;border-radius:3px;background:'+COLORS[p.seat]+';vertical-align:middle"></span> '+p.name+(p.seat===MYSEAT?'<span class="you-badge">YOU</span>':'')+'</span><span class="muted">'+CNAMES[p.seat]+'</span></div>';}).join('');
  g('wstatus').textContent='参加 '+ROOM.players.length+' / 4（足りない席はAIが入ります）';
  var isHost=ROOM.host&&ROOM.players.find(function(p){return p.seat===MYSEAT;})&&ROOM.host===PID;
  g('startBtn').classList.toggle('hidden',!isHost);g('shareRow').classList.toggle('hidden',!isHost);
}
function startGame(){api('/api/room/'+CODE+'/start','POST',{playerId:PID}).then(function(r){if(r.error)toast(r.error);});}
function doRestart(){api('/api/room/'+CODE+'/restart','POST',{playerId:PID}).then(function(r){if(r.error)toast(r.error);clearSel();tick();});}

/* ---- game render ---- */
function renderGame(){
  renderScores();
  var P=VIEW.players[MYSEAT];
  g('turnmsg').innerHTML=VIEW.over?'ゲーム終了':('<span style="color:'+COLORS[VIEW.turn]+'">●</span> '+CNAMES[VIEW.turn]+' の番'+(VIEW.turn===MYSEAT?'（あなた）':''));
  if(VIEW.turn!==MYSEAT||VIEW.over){if(SEL){SEL=null;GHOST=null;}}
  renderBoard();renderTray();renderSelPreview();updateHint();
  if(VIEW.over)renderEnd();else g('endCard').classList.add('hidden');
}
function renderScores(){
  var connMap={};((ROOM&&ROOM.players)||[]).forEach(function(rp){connMap[rp.seat]=rp;});
  var h='';for(var s=0;s<4;s++){var P=VIEW.players[s];var rp=connMap[s];var bot=rp&&rp.bot;
    h+='<div class="scd'+(VIEW.turn===s&&!VIEW.over?' turn':'')+(P.passed?' passed':'')+'">'+
       '<div class="nm"><span class="dot" style="background:'+COLORS[s]+'"></span>'+P.name+(s===MYSEAT?'<span class="you-badge">YOU</span>':'')+(bot?'<span class="discon">切断中</span>':'')+'</div>'+
       '<div class="det">残り'+P.remain.length+'個｜得点 '+P.score+(P.passed?'｜パス':'')+'</div></div>';}
  g('scores').innerHTML=h;
}
function anchorCells(seat){var b=VIEW.board,res=[];if(VIEW.players[seat].first)return [CORNERS[seat]];
  for(var r=0;r<N;r++)for(var c=0;c<N;c++){if(b[r][c]!==0)continue;var e=false,co=false;
    if(r>0&&b[r-1][c]===seat+1)e=true;if(r<N-1&&b[r+1][c]===seat+1)e=true;if(c>0&&b[r][c-1]===seat+1)e=true;if(c<N-1&&b[r][c+1]===seat+1)e=true;
    if(r>0&&c>0&&b[r-1][c-1]===seat+1)co=true;if(r>0&&c<N-1&&b[r-1][c+1]===seat+1)co=true;if(r<N-1&&c>0&&b[r+1][c-1]===seat+1)co=true;if(r<N-1&&c<N-1&&b[r+1][c+1]===seat+1)co=true;
    if(co&&!e)res.push([r,c]);}return res;}
function renderBoard(){
  var bd=g('board');
  if(bd.children.length!==N*N){bd.innerHTML='';for(var i=0;i<N*N;i++){var d=document.createElement('div');d.className='cell';d.dataset.r=Math.floor(i/N);d.dataset.c=i%N;d.onclick=cellTap;bd.appendChild(d);}}
  var anchors={};if(!VIEW.over&&VIEW.turn===MYSEAT)anchorCells(MYSEAT).forEach(function(a){anchors[a[0]*100+a[1]]=1;});
  var gs={},gv=false;if(GHOST){gv=GHOST.valid;GHOST.cells.forEach(function(c){gs[c[0]*100+c[1]]=1;});}
  for(var i2=0;i2<N*N;i2++){var d2=bd.children[i2],r=Math.floor(i2/N),c=i2%N,v=VIEW.board[r][c];var cls='cell';if(v)cls+=' s'+v;
    if(((r===0&&c===0)||(r===0&&c===19)||(r===19&&c===19)||(r===19&&c===0))&&!v)cls+=' cor';
    if(anchors[r*100+c]&&!v)cls+=' anchor';if(gs[r*100+c])cls+=(gv?' gok':' gng');d2.className=cls;}
}
function pieceMiniCells(cells,color,s){var mr=Math.max.apply(null,cells.map(function(p){return p[0];}))+1,mc=Math.max.apply(null,cells.map(function(p){return p[1];}))+1;var grid={};cells.forEach(function(c){grid[c[0]*100+c[1]]=1;});s=s||12;var h='<div class="pg" style="grid-template-columns:repeat('+mc+','+s+'px)">';for(var r=0;r<mr;r++)for(var c=0;c<mc;c++){h+='<div style="width:'+s+'px;height:'+s+'px;background:'+(grid[r*100+c]?color:'transparent')+';border-radius:2px"></div>';}return h+'</div>';}
function renderTray(){
  var P=VIEW.players[MYSEAT],color=COLORS[MYSEAT],myturn=(VIEW.turn===MYSEAT&&!VIEW.over),h='';
  BLOKUS.PIECES.forEach(function(p){var pid=p[0],used=P.remain.indexOf(pid)<0;
    h+='<div class="pc'+(used?' used':'')+(SEL===pid?' sel':'')+'"'+(myturn&&!used?' onclick="selPiece(\''+pid+'\')"':'')+'>'+pieceMiniCells(PMAP[pid],used?'#ccc':color,11)+'</div>';});
  g('tray').innerHTML=h;
}
function renderSelPreview(){var el=g('selPreview');if(!SEL){el.innerHTML='<span class="muted" style="font-size:11px">ピース</span>';return;}el.innerHTML='<div style="font-size:10px;color:var(--mut);text-align:center;margin-bottom:2px;font-weight:700">選択中</div>'+pieceMiniCells(ORI[SEL][ORII],COLORS[MYSEAT],13);}
function updateHint(){var ok=GHOST&&GHOST.valid;g('placeBtn').disabled=!(ok&&VIEW.turn===MYSEAT&&!VIEW.over);
  if(VIEW.over){g('hint').textContent='';return;}
  if(VIEW.turn!==MYSEAT){g('hint').textContent='ほかのプレイヤーの番を待っています…';return;}
  if(!SEL){g('hint').textContent='上のピースを選んでね';return;}
  g('hint').innerHTML=ok?'✓ ここに置けます。「ここに置く」で確定。<br><span class="muted">同じマスを再タップ＝別の置き方に切替／矢印＝1マス移動</span>':'盤をタップして位置合わせ（回転/反転で向き・矢印で1マス移動）。';}

function curCells(){return ORI[SEL][ORII];}
function startPoint(){if(VIEW.players[MYSEAT].first)return CORNERS[MYSEAT];var a=anchorCells(MYSEAT);return a.length?a[0]:[9,9];}
function selPiece(pid){if(VIEW.turn!==MYSEAT||VIEW.over)return;if(VIEW.players[MYSEAT].remain.indexOf(pid)<0)return;SEL=pid;ORII=0;GHOST=null;renderTray();renderSelPreview();var sp=startPoint();placeGhostNear(sp[0],sp[1]);}
function clearSel(){SEL=null;GHOST=null;TAPC.key=-1;renderTray();renderBoard();renderSelPreview();updateHint();}
function rotate(){if(!SEL)return;ORII=(ORII+1)%ORI[SEL].length;renderSelPreview();var p=GHOST?[GHOST.R,GHOST.C]:startPoint();placeGhostNear(p[0],p[1]);}
function flipP(){if(!SEL)return;var fl=BLOKUS.norm(ORI[SEL][ORII].map(function(p){return [p[0],-p[1]];}));var os=ORI[SEL];for(var i=0;i<os.length;i++){if(JSON.stringify(os[i])===JSON.stringify(fl)){ORII=i;break;}}renderSelPreview();var p=GHOST?[GHOST.R,GHOST.C]:startPoint();placeGhostNear(p[0],p[1]);}
function placeGhostNear(R,C){if(!SEL)return;TAPC.key=-1;var o=curCells(),first=VIEW.players[MYSEAT].first;var mr=Math.max.apply(null,o.map(function(c){return c[0];})),mc=Math.max.apply(null,o.map(function(c){return c[1];}));
  for(var rad=0;rad<=14;rad++){var found=null,bd=1e9;for(var dr=-rad;dr<=rad;dr++)for(var dc=-rad;dc<=rad;dc++){if(Math.max(Math.abs(dr),Math.abs(dc))!==rad)continue;var rr=Math.max(0,Math.min(R+dr,N-1-mr)),cc=Math.max(0,Math.min(C+dc,N-1-mc));if(BLOKUS.canPlace(VIEW.board,MYSEAT,o,rr,cc,first)){var d=(rr-R)*(rr-R)+(cc-C)*(cc-C);if(d<bd){bd=d;found=[rr,cc];}}}if(found){setGhost(found[0],found[1]);return;}}
  setGhost(R,C);}
function setGhost(R,C){var o=curCells();var mr=Math.max.apply(null,o.map(function(c){return c[0];})),mc=Math.max.apply(null,o.map(function(c){return c[1];}));R=Math.max(0,Math.min(R,N-1-mr));C=Math.max(0,Math.min(C,N-1-mc));var cells=o.map(function(c){return [R+c[0],C+c[1]];});var valid=BLOKUS.canPlace(VIEW.board,MYSEAT,o,R,C,VIEW.players[MYSEAT].first);GHOST={R:R,C:C,cells:cells,valid:valid};renderBoard();updateHint();}
/* タップ位置を覆う置き方を近い順に列挙。同じマスを再タップすると次の候補に切替。 */
var TAPC={key:-1,list:[],idx:0};
function candidatesNear(R,C){
  var o=curCells(),first=VIEW.players[MYSEAT].first,res=[];
  var mr=Math.max.apply(null,o.map(function(c){return c[0];})),mc=Math.max.apply(null,o.map(function(c){return c[1];}));
  for(var rr=0;rr<=N-1-mr;rr++)for(var cc=0;cc<=N-1-mc;cc++){
    if(!BLOKUS.canPlace(VIEW.board,MYSEAT,o,rr,cc,first))continue;
    var cover=0,bd=1e9;
    for(var k=0;k<o.length;k++){var pr=rr+o[k][0],pc=cc+o[k][1];var d=(pr-R)*(pr-R)+(pc-C)*(pc-C);if(d<bd)bd=d;if(pr===R&&pc===C)cover=1;}
    res.push({rr:rr,cc:cc,cover:cover,d:bd});
  }
  res.sort(function(a,b){return (b.cover-a.cover)||(a.d-b.d);});
  return res.slice(0,12);
}
function cellTap(e){if(!VIEW||VIEW.over||VIEW.turn!==MYSEAT||!SEL)return;
  var r=+e.currentTarget.dataset.r,c=+e.currentTarget.dataset.c,key=r*100+c;
  if(TAPC.key===key&&TAPC.list.length>1){TAPC.idx=(TAPC.idx+1)%TAPC.list.length;}
  else{TAPC.key=key;TAPC.list=candidatesNear(r,c);TAPC.idx=0;}
  if(TAPC.list.length){var g0=TAPC.list[TAPC.idx];setGhost(g0.rr,g0.cc);if(TAPC.list.length>1)toast('置き方 '+(TAPC.idx+1)+'/'+TAPC.list.length+'（同じマスをタップで切替）');}
  else placeGhostNear(r,c);}
function nudge(dr,dc){if(!SEL||!GHOST)return;TAPC.key=-1;setGhost(GHOST.R+dr,GHOST.C+dc);}
function confirmPlace(){if(!SEL||!GHOST||!GHOST.valid||VIEW.turn!==MYSEAT)return;
  var mv={kind:'place',pid:SEL,cells:curCells(),R:GHOST.R,C:GHOST.C};SEL=null;GHOST=null;
  api('/api/room/'+CODE+'/action','POST',{playerId:PID,move:mv,rev:REV}).then(function(r){if(!r.ok&&r.err)toast(r.err);tick();}).catch(function(){toast('送信できませんでした');tick();});}

function renderEnd(){
  var arr=VIEW.players.map(function(P,s){return {s:s,sc:P.score,rem:P.remain.length};}).sort(function(a,b){return b.sc-a.sc;});
  var top=arr[0].sc,winners=arr.filter(function(a){return a.sc===top;}).map(function(a){return VIEW.players[a.s].name;});
  var h='<div class="win">🏆 勝者：'+winners.join('・')+'（'+top+'点）</div><div style="margin-top:8px">';
  arr.forEach(function(a){h+='<div style="margin:3px 0"><span class="dot" style="display:inline-block;width:12px;height:12px;border-radius:3px;background:'+COLORS[a.s]+';margin-right:6px;vertical-align:middle"></span><b>'+VIEW.players[a.s].name+'</b> … '+a.sc+'点（残り'+a.rem+'個）</div>';});
  h+='</div><div class="controls" style="margin-top:12px"><button onclick="doRestart()">もう一度（同じメンバー）</button></div>';
  g('endCard').innerHTML=h;g('endCard').classList.remove('hidden');
}
/* reconnect / join link prefill */
(function(){var hadQ=false;try{var q=new URLSearchParams(location.search);if(q.get('server')){g('srv').value=q.get('server');hadQ=true;}if(q.get('code')){g('jc').value=(q.get('code')||'').toUpperCase();hadQ=true;}}catch(e){}
  if(!hadQ){try{var sv=JSON.parse(localStorage.getItem('bk_online')||'null');if(sv&&sv.SRV&&sv.CODE&&sv.PID)tryReconnect(sv);}catch(e){}}})();
