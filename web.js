/* 🕹️ 오락실 웹 버전 연결부
   오락실 코드는 Claude 화면의 window.claude.use('db' | 'user' | 'downloads') 로 저장·순위표를 써요.
   웹 버전에서는 같은 모양의 연결부를 Firebase(구글 로그인 + Firestore)로 만들어 끼워요.
   → 게임·저장·순위표 코드는 그대로 두고, 이 파일만 웹 전용. */
(function(){
  window.ARCADE_WEB = true;
  var CFG = {
    apiKey: "AIzaSyAtBfYf52FiKRcOGeHNfCjupNrQ86jtPOc",
    authDomain: "jhimdotcom.firebaseapp.com",
    projectId: "jhimdotcom",
    storageBucket: "jhimdotcom.firebasestorage.app",
    messagingSenderId: "111943898731",
    appId: "1:111943898731:web:9a2c9891345b148ea0432e"
  };
  // 오락실 주인 계정 번호 (💾 저장·백업 → 내 계정 번호). 주인만: 🧪 테스트 지갑 · 친구 기록 등록·빼기
  var OWNER_UIDS = ['AVB1aUE1fXgfSJWsoVcO7oCfglE2'];

  var fb = window.firebase;
  if (!fb || !fb.initializeApp){ console.warn('Firebase를 불러오지 못해서 이 기기에만 저장해요'); return; }
  var auth, fs;
  try { fb.initializeApp(CFG); auth = fb.auth(); fs = fb.firestore(); }
  catch(e){ console.warn(e); return; }

  var current = null;
  var ready = new Promise(function(res){
    var done = false;
    var un = auth.onAuthStateChanged(function(u){ current = u; if (!done){ done = true; res(u); } paintAccount(); });
    setTimeout(function(){ if (!done){ done = true; res(null); } }, 8000);   // 응답이 없으면 이 기기 모드
  });

  // Firebase 오류 이름 → 오락실 코드가 아는 이름 (Claude 쪽 이름)
  var ERR = { 'permission-denied': 'invalid_argument', 'unauthenticated': 'not_granted', 'resource-exhausted': 'quota_exceeded',
              'unavailable': 'unavailable', 'deadline-exceeded': 'unavailable', 'invalid-argument': 'invalid_argument' };
  function mapErr(e){ var c = (e && e.code) || ''; return { code: ERR[c] || c || 'unknown', message: e && e.message }; }
  function rethrow(e){ throw mapErr(e); }
  function snapDoc(s){ return { id: s.id, exists: s.exists, data: function(){ return s.data(); } }; }
  function wrapRef(r){
    return {
      id: r.id,
      get: function(){ return r.get().then(snapDoc, rethrow); },
      set: function(b){ return r.set(b).catch(rethrow); },
      update: function(b){ return r.update(b).catch(rethrow); },
      delete: function(){ return r.delete().catch(rethrow); }
    };
  }
  function wrapQuery(q){
    var o = {
      limit: function(n){ return wrapQuery(q.limit(n)); },
      get: function(){ return q.get().then(function(s){ return { docs: s.docs.map(snapDoc), size: s.size, empty: s.empty }; }, rethrow); },
      onSnapshot: function(cb, err){
        return q.onSnapshot(function(s){ cb({ docs: s.docs.map(snapDoc), size: s.size, empty: s.empty }); }, function(e){ if (err) err(mapErr(e)); });
      }
    };
    if (typeof q.doc === 'function') o.doc = function(id){ return wrapRef(q.doc(id)); };
    return o;
  }
  var db = { collection: function(p){ return wrapQuery(fs.collection(p)); }, doc: function(p){ return wrapRef(fs.doc(p)); } };
  var user = {
    id: function(){ return ready.then(function(u){ return u ? u.uid : null; }); },
    can: function(){ return ready.then(function(u){ return !!u; }); },
    isOwner: function(){ return !!(current && OWNER_UIDS.indexOf(current.uid) !== -1); },
    canEdit: function(){ return user.isOwner(); }
  };
  var downloads = {
    save: function(o){
      try {
        var blob = new Blob([o.data], { type: 'application/json' }), url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = o.filename || 'arcade_backup.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
        return Promise.resolve();
      } catch(e){ return Promise.reject({ code: 'unknown' }); }
    }
  };
  window.claude = {
    use: function(name){
      return ready.then(function(u){
        if (name === 'downloads') return downloads;
        if (!u) return null;                 // 로그인 안 했으면 이 기기 모드
        if (name === 'db') return db;
        if (name === 'user') return user;
        return null;
      });
    }
  };

  /* ---------- 🔑 로그인 · 로그아웃 ---------- */
  function toast(t){ var el = document.getElementById('arcToast'); if (!el) return; el.hidden = true; void el.offsetWidth; el.textContent = t; el.hidden = false; setTimeout(function(){ el.hidden = true; }, 3200); }
  function login(){
    var p = new fb.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
    auth.signInWithPopup(p).then(function(){ toast('🔑 로그인했어요. 기록을 불러와요…'); setTimeout(function(){ location.reload(); }, 500); }, function(e){
      var c = e && e.code;
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return;
      if (c === 'auth/popup-blocked') toast('팝업이 막혔어요. 브라우저에서 이 사이트의 팝업을 허용해 주세요');
      else if (c === 'auth/unauthorized-domain') toast('이 주소가 Firebase 승인된 도메인에 없어요 (주인에게 알려 주세요)');
      else if (c === 'auth/network-request-failed') toast('인터넷 연결을 확인해 주세요');
      else toast('로그인하지 못했어요 (' + (c || '알 수 없는 오류') + ')');
    });
  }
  function logout(){
    auth.signOut().then(function(){ toast('로그아웃했어요. 기록은 이 기기에 남아 있어요'); setTimeout(function(){ location.reload(); }, 600); });
  }
  function esc(s){ return String(s || '').replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function paintAccount(){
    var row = document.querySelector('.arc-save-row'), board = document.querySelector('#saveBoard .arc-inner');
    if (!row || !board) return;
    var btn = document.getElementById('acctBtn');
    if (!btn){ btn = document.createElement('button'); btn.id = 'acctBtn'; btn.className = 'arc-save-btn acct-btn'; btn.addEventListener('click', login); row.insertBefore(btn, row.lastElementChild); }
    btn.hidden = !!current; btn.textContent = '🔑 구글 로그인';
    var box = document.getElementById('acctBox');
    if (!box){ box = document.createElement('div'); box.id = 'acctBox'; box.className = 'acct-box'; var head = board.querySelector('.arc-head'); board.insertBefore(box, head ? head.nextSibling : board.firstChild); }
    if (current){
      box.innerHTML = '🔑 <b>' + esc(current.displayName || '구글 계정') + '</b> <small>' + esc(current.email || '') + '</small>' +
        '<div class="acct-row"><button class="sv-btn" id="acctOut">로그아웃</button><button class="sv-btn" id="acctUid">내 계정 번호 복사</button></div>' +
        '<small class="acct-uid">계정 번호: <span id="acctUidTxt">' + esc(current.uid) + '</span>' + (user.isOwner() ? ' · 👑 오락실 주인' : '') + '</small>';
      document.getElementById('acctOut').addEventListener('click', logout);
      document.getElementById('acctUid').addEventListener('click', function(){
        var b = this, t = current.uid;
        try { navigator.clipboard.writeText(t).then(function(){ b.textContent = '✅ 복사했어요'; }, function(){ b.textContent = t; }); } catch(e){ b.textContent = t; }
      });
    } else {
      box.innerHTML = '🔑 <b>구글로 로그인하면</b> 기록이 내 구글 계정에 저장돼서 폰·PC 어디서나 이어서 할 수 있고, 친구 순위표에도 올릴 수 있어요.' +
        '<div class="acct-row"><button class="sv-btn acct-in" id="acctIn">🔑 구글로 로그인</button></div>';
      document.getElementById('acctIn').addEventListener('click', login);
    }
  }
  var css = document.createElement('style');
  css.textContent = '.acct-box{ background: rgba(255,255,255,0.07); border-radius: 14px; padding: 12px; font-size: 13.5px; line-height: 1.55; word-break: keep-all; }' +
    '.acct-box small{ color: #bdb3a0; } .acct-row{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; } .acct-uid{ display: block; margin-top: 6px; word-break: break-all; }' +
    '.acct-in{ background: #ffd166 !important; color: #2a1c00 !important; border-color: #ffd166 !important; font-weight: 900; }' +
    '.acct-btn{ background: #ffd166; color: #2a1c00; border-color: #ffd166; font-weight: 900; }';
  document.head.appendChild(css);
  document.addEventListener('DOMContentLoaded', function(){
    paintAccount();
    var dad = document.getElementById('dadTetris'); if (dad) dad.href = 'tetris.html';   // 아버지 테트리스도 같은 사이트에
  });
  if (document.readyState !== 'loading') paintAccount();
})();
