/* ==========================================================================
   scripts.js — Full site logic (updated)
   - Enforces strict equip rules for Top1/Top2/Top3 titles (exact rank only)
   - Adds default profile picture fallback (defaultProfilePicture.png)
   - Prevents redirect/reload loops with a guard flag
   - Full feature set: auth, sessions, bans, levels, submissions, mod tools
   ========================================================================== */

/* ----------------------- Configuration / Constants ----------------------- */
const DEFAULT_PFP = 'defaultProfilePicture.png'; // <-- place this PNG in your site's root
const KEY_USERS = 'dl_users_v1_explicit';
const KEY_LEVELS = 'dl_levels_v1_explicit';
const KEY_SUBS = 'dl_subs_v1_explicit';
const KEY_SESSION = 'dl_session_v1_explicit';
const KEY_AUDIT = 'dl_audit_v1';

/* ----------------------- Storage helpers ----------------------- */
function readJSON(key, fallback){ try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(fallback)); } catch(e){ console.error('readJSON', key, e); return JSON.parse(JSON.stringify(fallback)); } }
function writeJSON(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){ console.error('writeJSON', key, e); } }

function getUsers(){ return readJSON(KEY_USERS, []); }
function saveUsers(v){ writeJSON(KEY_USERS, v); }
function getLevels(){ return readJSON(KEY_LEVELS, []); }
function saveLevels(v){ writeJSON(KEY_LEVELS, v); }
function getSubs(){ return readJSON(KEY_SUBS, []); }
function saveSubs(v){ writeJSON(KEY_SUBS, v); }
function getAudit(){ return readJSON(KEY_AUDIT, []); }
function saveAudit(v){ writeJSON(KEY_AUDIT, v); }

function setSession(obj){ localStorage.setItem(KEY_SESSION, JSON.stringify(obj)); }
function getSession(){ return JSON.parse(localStorage.getItem(KEY_SESSION) || 'null'); }
function clearSession(){ localStorage.removeItem(KEY_SESSION); }

function uid(){ return Math.random().toString(36).slice(2,9); }
function now(){ return Date.now(); }
function escapeHTML(s){ if(s===null||s===undefined) return ''; return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
function formatDate(ms){ if(!ms) return '-'; try{ return new Date(ms).toLocaleString(); } catch(e){ return String(ms); } }
function durationFromNow(ms){ if(!ms) return 'permanent'; const s = Math.max(0, Math.floor((ms - Date.now())/1000)); if(s<=0) return 'expired'; const h = Math.floor(s/3600); if(h>=24) return Math.floor(h/24) + ' day' + (Math.floor(h/24)===1?'':'s'); if(h>0) return h + ' hour' + (h===1?'':'s'); return Math.floor(s/60) + ' min'; }

/* ----------------------- YouTube helpers ----------------------- */
function youtubeID(url){
  if(!url) return null;
  const q = /[?&]v=([^&]+)/.exec(url);
  if(q && q[1]) return q[1];
  const b = /youtu\.be\/([^?&]+)/.exec(url);
  if(b && b[1]) return b[1];
  const e = /youtube\.com\/embed\/([^?&/]+)/.exec(url);
  if(e && e[1]) return e[1];
  const parts = url.split('/');
  return parts[parts.length-1] || null;
}
function youtubeThumb(url){ const id = youtubeID(url); return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''; }
function youtubeEmbed(url){ const id = youtubeID(url); return id ? `https://www.youtube.com/embed/${id}` : null; }

/* ----------------------- Tags ----------------------- */
const ALL_TAGS = [
  "Cube Carried","Ship Carried","Wave Carried","Ufo Carried","Ball Carried","Spider Carried","Swing Carried",
  "Medium Length","Long Length","XL Length","XXL Length (3+ Minutes)","Slow Paced","Fast Paced","Memory Level","Visibility Level"
];

function tagToBadgeClass(tag){
  switch(tag){
    case 'Cube Carried': return 'tag-badge-cube';
    case 'Ship Carried': return 'tag-badge-ship';
    case 'Wave Carried': return 'tag-badge-wave';
    case 'Ufo Carried': return 'tag-badge-ufo';
    case 'Ball Carried': return 'tag-badge-ball';
    case 'Spider Carried': return 'tag-badge-spider';
    case 'Swing Carried': return 'tag-badge-swing';
    default: return 'tag-badge-default';
  }
}
function renderTagBadgesHTML(tags){
  if (!tags || tags.length === 0) return '';
  return tags.map(t => `<span class="tag-badge ${tagToBadgeClass(t)}">${escapeHTML(t)}</span>`).join('');
}

/* ----------------------- Leaderboard & Titles ----------------------- */
function getLeaderboardSortedUsers(){
  return (getUsers()||[]).slice().sort((a,b) => (b.points||0) - (a.points||0));
}
function getUserRank(username){
  const sorted = getLeaderboardSortedUsers();
  const idx = sorted.findIndex(u => u.username === username);
  return idx === -1 ? null : idx + 1; // 1-based rank
}

const TITLES = [
  { id:'fresh', label:'Fresh', reqText:'Free — available to everyone' },
  { id:'maybe_him', label:'Maybe him', reqText:'100 points' },
  { id:'let_me_cook', label:'Let me Cook...', reqText:'300 points' },
  { id:'just_better', label:"I'm just better", reqText:'500 points' },
  { id:'god_like', label:'God-Like', reqText:'1000 points' },
  { id:'fart', label:'Fart', reqText:'3000 points' },
  { id:'top3', label:'Top 3', reqText:'Only user ranked #3' },
  { id:'top2', label:'Top 2', reqText:'Only user ranked #2' },
  { id:'top1', label:"Yes I'm him, the Top 1", reqText:'Only user ranked #1' }
];

/* central rule-checker for whether a user may equip a title
   NOTE: top3/top2/top1 require exact rank equality (3,2,1) as requested */
function canEquipTitle(user, titleId){
  if(!user) return false;
  const pts = user.points || 0;
  const rank = getUserRank(user.username);
  switch(titleId){
    case 'fresh': return true;
    case 'maybe_him': return pts >= 100;
    case 'let_me_cook': return pts >= 300;
    case 'just_better': return pts >= 500;
    case 'god_like': return pts >= 1000;
    case 'fart': return pts >= 3000;
    case 'top3': return rank !== null && rank === 3; // EXACTLY position 3
    case 'top2': return rank !== null && rank === 2; // EXACTLY position 2
    case 'top1': return rank === 1;                 // EXACTLY position 1
    default: return false;
  }
}
function eligibleTitlesForUser(user){ return TITLES.filter(t => canEquipTitle(user, t.id)); }

/* ----------------------- Seed (only if empty) ----------------------- */
function seedIfEmpty(){
  const users = getUsers();
  if(users && users.length) return;
  const headAdmin = {
    id: uid(),
    username: 'zmmieh.',
    password: '123456',
    role: 'headadmin',
    nationality: 'United Kingdom',
    points: 0,
    createdAt: now(),
    profilePic: '', // will fallback to DEFAULT_PFP on render
    showCountry: true,
    bio: '',
    completedRecords: [],
    equippedTitle: 'fresh'
  };
  saveUsers([headAdmin]);
  saveLevels([]);
  saveSubs([]);
  saveAudit([]);
}
seedIfEmpty();

/* ----------------------- Mention autocomplete (creators) ----------------------- */
function initCreatorsMentionAutocomplete(){
  const input = document.getElementById('lev-creators'); if(!input) return;
  let ac = document.getElementById('mention-autocomplete');
  if(!ac){
    ac = document.createElement('div'); ac.id='mention-autocomplete';
    ac.style.position='absolute'; ac.style.display='none'; ac.style.zIndex='99999';
    ac.style.background = '#0f0f12'; ac.style.border = '1px solid rgba(255,255,255,0.06)'; ac.style.padding = '6px'; ac.style.borderRadius='8px'; ac.style.minWidth='220px';
    document.body.appendChild(ac);
  }
  function reposition(){ const r = input.getBoundingClientRect(); ac.style.left = `${r.left}px`; ac.style.top = `${r.bottom + 6 + window.scrollY}px`; }
  window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition);

  input.addEventListener('input', function(){
    const val = input.value; const caret = input.selectionStart || val.length;
    const sub = val.slice(0, caret); const atIndex = sub.lastIndexOf('@'); if(atIndex === -1){ ac.style.display='none'; return; }
    const query = sub.slice(atIndex+1); if(query.includes(' ')){ ac.style.display='none'; return; }
    const q = query.toLowerCase();
    const users = getUsers().filter(u => u.username.toLowerCase().startsWith(q)).slice(0,8);
    if(!users.length){ ac.style.display='none'; return; }
    reposition(); ac.innerHTML = '';
    users.forEach(u => {
      const item = document.createElement('div');
      item.textContent = u.username;
      item.style.padding = '6px';
      item.style.cursor = 'pointer';
      item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.02)';
      item.onmouseleave = () => item.style.background = 'transparent';
      item.onclick = () => {
        const before = val.slice(0, atIndex);
        const after = val.slice(caret);
        input.value = before + '@' + u.username + (after || '');
        ac.style.display = 'none';
        input.focus();
      };
      ac.appendChild(item);
    });
    ac.style.display = 'block';
  });

  input.addEventListener('blur', () => setTimeout(()=> { ac.style.display = 'none'; }, 150));
}

/* ----------------------- Creators rendering (mentions -> clickable links) ----------------------- */
function renderCreatorsHTML(creatorsArray){
  if(!creatorsArray || !creatorsArray.length) return '';
  return creatorsArray.map(entry => {
    entry = String(entry || '');
    return entry.split(/\s+/).map(token => {
      if(token.startsWith('@')){
        const uname = token.slice(1);
        if(!uname) return escapeHTML(token);
        return `<a class="user-link" href="profile.html?user=${encodeURIComponent(uname)}">${escapeHTML(token)}</a>`;
      }
      return escapeHTML(token);
    }).join(' ');
  }).join(', ');
}

/* ----------------------- Ban helpers ----------------------- */
function isUserBanned(username){
  if(!username) return false;
  const users = getUsers();
  const u = users.find(x => x.username === username);
  if(!u) return false;
  if(!u.bannedUntil) return false;
  if(u.bannedUntil === 9999999999999) return true;
  if(Date.now() < u.bannedUntil) return true;
  delete u.bannedUntil; delete u.banReason; delete u.bannedBy; delete u.bannedAt;
  saveUsers(users);
  return false;
}
function showBanOverlay(user){
  if(!user) return;
  if(document.getElementById('banOverlay')) return;
  const overlay = document.createElement('div'); overlay.id = 'banOverlay';
  Object.assign(overlay.style, {position:'fixed', inset:'0', background:'rgba(0,0,0,0.9)', zIndex:999999, display:'flex', alignItems:'center', justifyContent:'center'});
  overlay.innerHTML = `
    <div style="max-width:760px;background:linear-gradient(180deg,#111,#0b0b0b);padding:28px;border-radius:12px;color:#fff;text-align:center;border:1px solid rgba(255,255,255,0.04)">
      <h2 style="margin:0 0 8px">You are banned</h2>
      <p style="color:var(--muted)">Username: <strong>${escapeHTML(user.username)}</strong></p>
      <p style="color:var(--muted)">Banned until: <strong>${escapeHTML(user.bannedUntil===9999999999999?'Permanent':formatDate(user.bannedUntil))}</strong></p>
      <p style="color:var(--muted)">Reason: <strong>${escapeHTML(user.banReason||'No reason provided')}</strong></p>
      <div style="margin-top:16px"><button id="banSignOutBtn" class="btn">Sign out</button></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('banSignOutBtn').onclick = () => { clearSession(); overlay.remove(); window.location.href = 'index.html'; };
}
function enforceBanForSession(){
  const s = getSession(); if(!s) return false;
  const users = getUsers(); const me = users.find(u => u.username === s.username);
  if(!me) return false;
  if(isUserBanned(me.username)){ showBanOverlay(me); return true; }
  return false;
}

/* ----------------------- Topbar ----------------------- */
function countryToFlag(country){
  const map = {'United Kingdom':'🇬🇧','Hungary':'🇭🇺','Austria':'🇦🇹','Belgium':'🇧🇪','Germany':'🇩🇪','France':'🇫🇷','Japan':'🇯🇵','China':'🇨🇳','India':'🇮🇳','South Korea':'🇰🇷','Indonesia':'🇮🇩','United States':'🇺🇸','Canada':'🇨🇦','Mexico':'🇲🇽','Brazil':'🇧🇷'};
  return map[country] || '';
}
function renderTopbar(){
  const top = document.querySelector('.topbar'); if(!top) return;
  top.innerHTML = '';
  const session = getSession();
  const title = document.createElement('div'); title.className = 'site-title'; title.textContent = 'The All Levels Lists'; top.appendChild(title);
  const nav = document.createElement('nav'); nav.className = 'topnav';
  [['mainlist.html','Main List'],['submissions.html','Submissions'],['stats.html','Stats Viewer']].forEach(([href,label]) => {
    const a = document.createElement('a'); a.href = href; a.textContent = label; nav.appendChild(a);
  });
  top.appendChild(nav);

  const pa = document.createElement('div'); pa.className = 'profile-area'; pa.id = 'profile-area'; top.appendChild(pa);

  if(!session){ pa.innerHTML = `<a class="btn ghost small-btn" href="index.html">Login</a>`; return; }
  const users = getUsers(); const me = users.find(u => u.username === session.username) || {};
  const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.gap = '8px'; wrap.style.alignItems = 'center';

  const circle = document.createElement('div'); circle.className = 'profile-circle';
  const img = document.createElement('img'); img.src = (me.profilePic && me.profilePic.trim()) ? me.profilePic : DEFAULT_PFP; img.onerror = () => { img.src = DEFAULT_PFP; };
  circle.appendChild(img);
  wrap.appendChild(circle);

  const nameDiv = document.createElement('div'); nameDiv.style.textAlign = 'right'; nameDiv.innerHTML = `<div style="font-weight:700">${escapeHTML(me.username)}</div>`;
  if(me.equippedTitle){
    const titleObj = TITLES.find(t => t.id === me.equippedTitle);
    if(titleObj) nameDiv.innerHTML += `<div style="font-size:12px;color:var(--muted);margin-top:4px">${escapeHTML(titleObj.label)}</div>`;
  }
  nameDiv.innerHTML += `<div style="font-size:12px;color:var(--muted)">${escapeHTML(me.nationality || '')}</div>`;
  wrap.appendChild(nameDiv);

  const editBtn = document.createElement('a'); editBtn.className = 'btn ghost small-btn'; editBtn.href = 'profile.html'; editBtn.textContent = 'Edit Profile'; wrap.appendChild(editBtn);
  const cp = document.createElement('a'); cp.className = 'btn ghost small-btn'; cp.href = 'change_password.html'; cp.textContent = 'Reset Password'; wrap.appendChild(cp);
  if(me.role === 'mod' || me.role === 'headadmin'){ const mp = document.createElement('a'); mp.className = 'btn ghost small-btn'; mp.href='modpanel.html'; mp.textContent='Mod Panel'; wrap.appendChild(mp); }
  const logout = document.createElement('button'); logout.className = 'btn ghost small-btn'; logout.textContent = 'Logout'; logout.onclick = () => { clearSession(); window.location.href = 'index.html'; };
  wrap.appendChild(logout);
  pa.appendChild(wrap);
}

/* Role label mapping for stats */
function displayRoleLabel(role){
  if(!role) return 'Player';
  const r = role.toLowerCase();
  if(r === 'user') return 'Player';
  if(r === 'mod' || r === 'admin') return 'Admin';
  if(r === 'headadmin' || r === 'headmoderator') return 'Head Moderator';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/* ----------------------- Router (with redirect guard) ----------------------- */
function initPage(page){
  // Prevent infinite redirect loops by guarding redirects to run only once per page load.
  if(!window.__initRedirectGuard) window.__initRedirectGuard = {};
  // if page is 'index' and there's a session, redirect *once* to mainlist:
  if(page === 'index' && getSession()){
    const current = location.pathname.split('/').pop();
    // if we are already on mainlist, don't redirect
    if(current !== 'mainlist.html'){
      // ensure we only trigger this redirect once
      if(!window.__initRedirectGuard['index->mainlist']){
        window.__initRedirectGuard['index->mainlist'] = true;
        // use a real navigation (keeps behavior simple)
        window.location.href = 'mainlist.html';
        return;
      } else {
        // guard active — skip redirect (prevents reload loop)
        return;
      }
    }
  }

  renderTopbar();
  if(getSession()) if(enforceBanForSession()) return;

  const protectedPages = ['submissions','submitlevel','submitcompletion','mysubmissions','modpanel','change_password','profile'];
  if(protectedPages.includes(page) && page !== 'profile' && !getSession()){
    alert('You must be logged in to access this page.');
    window.location.href = 'index.html';
    return;
  }

  switch(page){
    case 'index': initIndexPage(); break;
    case 'mainlist': initMainListPage(); break;
    case 'submissions': initSubmissionsPage(); break;
    case 'submitlevel': initSubmitLevelPage(); break;
    case 'submitcompletion': initSubmitCompletionPage(); break;
    case 'mysubmissions': initMySubmissionsPage(); break;
    case 'modpanel': initModPanelPage(); break;
    case 'stats': initStatsPage(); break;
    case 'change_password': initChangePasswordPage(); break;
    case 'profile': initProfilePage(); break;
    default: break;
  }
}

/* ======================== INDEX (login/signup) ======================== */
function initIndexPage(){
  renderTopbar();
  document.getElementById('show-signup')?.addEventListener('click', ()=>{ document.getElementById('login-panel')?.classList.add('hidden'); document.getElementById('signup-panel')?.classList.remove('hidden'); });
  document.getElementById('show-login')?.addEventListener('click', ()=>{ document.getElementById('signup-panel')?.classList.add('hidden'); document.getElementById('login-panel')?.classList.remove('hidden'); });

  document.getElementById('login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const username = (document.getElementById('li-username') && document.getElementById('li-username').value || '').trim();
    const password = (document.getElementById('li-password') && document.getElementById('li-password').value) || '';
    const msg = document.getElementById('login-msg');
    if(!username || !password){ if(msg){ msg.classList.remove('hidden'); msg.textContent = 'Please fill both fields'; } return; }
    const users = getUsers(); const found = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    if(!found){ if(msg){ msg.classList.remove('hidden'); msg.textContent = 'Invalid credentials'; } return; }
    if(isUserBanned(found.username)){ showBanOverlay(found); return; }
    setSession({ username: found.username });
    window.location.href = 'mainlist.html';
  });

  document.getElementById('signup-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const username = (document.getElementById('su-username') && document.getElementById('su-username').value || '').trim();
    const password = (document.getElementById('su-password') && document.getElementById('su-password').value) || '';
    const nationality = (document.getElementById('su-nationality') && document.getElementById('su-nationality').value) || '';
    const msg = document.getElementById('signup-msg');
    if(!username || !password || !nationality){ if(msg){ msg.classList.remove('hidden'); msg.textContent='Please fill all fields'; } return; }
    if(password.length < 6){ if(msg){ msg.classList.remove('hidden'); msg.textContent='Password must be at least 6 characters'; } return; }
    const USER_RE = /^[A-Za-z0-9()\{\}\[\]\._\-?!]+$/;
    if(!USER_RE.test(username)){ if(msg){ msg.classList.remove('hidden'); msg.textContent='Invalid username — no spaces; allowed chars (){}[] . _ - ? !'; } return; }
    const users = getUsers();
    if(users.find(u => u.username.toLowerCase() === username.toLowerCase())){ if(msg){ msg.classList.remove('hidden'); msg.textContent='Username already taken'; } return; }
    users.push({ id: uid(), username, password, nationality, role:'user', points:0, createdAt: now(), profilePic:'', showCountry:true, bio:'', completedRecords: [], equippedTitle:'fresh' });
    saveUsers(users);
    setSession({ username });
    window.location.href = 'mainlist.html';
  });
}

/* ======================== MAIN LIST ======================== */
function initMainListPage(){ renderTopbar(); renderMainList(); }

function renderMainList(){
  renderTopbar();
  const area = document.getElementById('list-area'); if(!area) return;
  area.innerHTML = '';
  const levels = (getLevels()||[]).filter(l => l.status === 'published').slice().sort((a,b) => (a.placement||999) - (b.placement||999));
  if(!levels.length){ area.innerHTML = '<div class="card">No published levels.</div>'; return; }
  levels.forEach(l => {
    const thumb = (l.thumbnail && l.thumbnail.trim()) ? l.thumbnail : (l.youtube ? youtubeThumb(l.youtube) : '');
    const creatorsHTML = renderCreatorsHTML(l.creators || []);
    const row = document.createElement('div'); row.className = 'level-row';
    const header = document.createElement('div'); header.className = 'level-header';
    const placement = document.createElement('div'); placement.className = 'placement'; placement.textContent = l.placement || '—';
    const thumbDiv = document.createElement('div'); thumbDiv.className = 'thumb'; if(thumb){ const img = document.createElement('img'); img.src = thumb; img.alt = 'thumb'; thumbDiv.appendChild(img); }
    const meta = document.createElement('div'); meta.className = 'level-meta';
    const nameEl = document.createElement('div'); nameEl.className = 'level-name'; nameEl.textContent = l.name || '';
    const subEl = document.createElement('div'); subEl.className = 'level-sub'; subEl.innerHTML = `ID: ${escapeHTML(l.levelId || '')}, Creator: ${creatorsHTML} • Placed Date: ${l.approvedAt ? formatDate(l.approvedAt) : '-'}`;

    meta.appendChild(nameEl); meta.appendChild(subEl);
    const actions = document.createElement('div'); actions.className = 'row-actions muted'; actions.textContent = 'Click to expand';
    header.appendChild(placement); header.appendChild(thumbDiv); header.appendChild(meta); header.appendChild(actions);

    const accordion = document.createElement('div'); accordion.className = 'accordion';
    accordion.innerHTML = `
      <div class="expanded-info" style="margin-bottom:10px;padding:0 15px;font-size:0.95em;color:#aaa">
        <div>ID: ${escapeHTML(l.levelId || '')}, Creator: ${creatorsHTML}</div>
        ${renderTagBadgesHTML(l.tags || []) ? `<div class="tag-badges" style="margin-top:8px">${renderTagBadgesHTML(l.tags||[])}</div>` : ''}
      </div>
      <div class="expanded">
        <div class="expanded-thumb">${ thumb ? `<img src="${thumb}" alt="expanded">` : '' }</div>
        <div class="expanded-video">${ l.youtube ? `<iframe src="${youtubeEmbed(l.youtube)}" allowfullscreen></iframe>` : '<div class="muted">No video</div>' }</div>
      </div>
      <div class="muted" style="margin-top:10px;padding:0 15px">Submitted by ${escapeHTML(l.submitter||'-')} — Approved by ${escapeHTML(l.approvedBy||'-')}</div>
    `;

    header.onclick = () => {
      const wasOpen = row.classList.contains('open');
      document.querySelectorAll('.level-row.open').forEach(r => r.classList.remove('open'));
      document.querySelectorAll('.level-row .thumb').forEach(t => t.style.display = 'block');

      if(!wasOpen){
        row.classList.add('open');
        const t = row.querySelector('.thumb'); if(t) t.style.display = 'none';
      } else {
        row.classList.remove('open');
        const t = row.querySelector('.thumb'); if(t) t.style.display = 'block';
      }
    };

    row.appendChild(header); row.appendChild(accordion); area.appendChild(row);
  });
}

/* ======================== SUBMISSIONS ======================== */
function initSubmissionsPage(){ renderTopbar(); }
function initSubmitLevelPage(){
  renderTopbar();
  const session = getSession(); if(!session){ alert('Login required'); window.location.href='index.html'; return; }
  const picker = document.getElementById('tag-picker');
  if(picker){ picker.innerHTML=''; ALL_TAGS.forEach(t => { const btn = document.createElement('button'); btn.type='button'; btn.className='tagbtn'; btn.dataset.tag = t; btn.textContent = t; btn.onclick = () => btn.classList.toggle('selected'); picker.appendChild(btn); }); }
  initCreatorsMentionAutocomplete();
  document.getElementById('submit-level-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = (document.getElementById('lev-name') && document.getElementById('lev-name').value || '').trim();
    const creatorsRaw = (document.getElementById('lev-creators') && document.getElementById('lev-creators').value || '').trim();
    const levelId = (document.getElementById('lev-id') && document.getElementById('lev-id').value || '').trim();
    const youtube = (document.getElementById('lev-youtube') && document.getElementById('lev-youtube').value || '').trim();
    const raw = (document.getElementById('lev-raw') && document.getElementById('lev-raw').value || '').trim();
    const picked = Array.from(document.querySelectorAll('#tag-picker .tagbtn.selected')).map(b => b.dataset.tag);
    const msg = document.getElementById('lev-msg');
    if(!name || !creatorsRaw || !levelId || !youtube || !raw){ if(msg){ msg.textContent = 'Please fill required fields'; msg.style.color = '#ff6b6b'; } return; }
    if(!picked.length){ if(msg){ msg.textContent = 'Please select at least one tag'; msg.style.color = '#ff6b6b'; } return; }
    const creatorsArray = creatorsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const subs = getSubs(); subs.push({ id: uid(), type:'level', name, creators: creatorsArray, levelId, youtube, raw, tags: picked, submitter: getSession().username, status: 'pending', createdAt: now() });
    saveSubs(subs);
    addAudit({ id: uid(), action:'submit_level', actor: getSession().username, target: null, details:{ name }, ts: now() });
    if(msg){ msg.textContent = 'Submitted — pending review'; msg.style.color = '#30c75b'; }
    setTimeout(()=> window.location.href = 'submissions.html', 700);
  });
}

/* ======================== SUBMIT COMPLETION ======================== */
function initSubmitCompletionPage(){
  renderTopbar();
  const session = getSession(); if(!session){ alert('Login required'); window.location.href='index.html'; return; }
  const sel = document.getElementById('comp-level');
  if(sel){ sel.innerHTML = ''; getLevels().filter(l => l.status === 'published').sort((a,b) => (a.placement||999) - (b.placement||999)).forEach(l => { const opt = document.createElement('option'); opt.value = l.id; opt.textContent = `#${l.placement} — ${l.name}`; sel.appendChild(opt); }); }
  document.getElementById('submit-completion-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const levelRef = (document.getElementById('comp-level') && document.getElementById('comp-level').value) || '';
    const youtube = (document.getElementById('comp-youtube') && document.getElementById('comp-youtube').value || '').trim();
    const raw = (document.getElementById('comp-raw') && document.getElementById('comp-raw').value || '').trim();
    const percentInput = document.getElementById('comp-percent'); let percent = null;
    if(percentInput){ const v = parseFloat(percentInput.value); if(!isNaN(v)) percent = Math.max(0, Math.min(100, Math.round(v))); }
    const msg = document.getElementById('comp-msg');
    if(!levelRef || !youtube || !raw){ if(msg){ msg.textContent = 'Fill required fields'; msg.style.color = '#ff6b6b'; } return; }
    const levelObj = getLevels().find(x => x.id === levelRef);
    const levelNameSnapshot = levelObj ? levelObj.name : '';
    const subs = getSubs(); subs.push({ id: uid(), type:'completion', levelRef, levelName: levelNameSnapshot, youtube, raw, percent, submitter: getSession().username, status:'pending', createdAt: now() });
    saveSubs(subs);
    addAudit({ id: uid(), action:'submit_completion', actor: getSession().username, target: null, details:{ levelRef, percent }, ts: now() });
    if(msg){ msg.textContent = 'Completion submitted — pending review'; msg.style.color = '#30c75b'; }
    setTimeout(()=> window.location.href = 'submissions.html', 900);
  });
}

/* ======================== MY SUBMISSIONS ======================== */
function initMySubmissionsPage(){
  renderTopbar();
  const session = getSession(); if(!session){ alert('Login required'); window.location.href='index.html'; return; }
  const area = document.getElementById('my-subs-area'); if(!area) return; area.innerHTML = '';
  const subs = getSubs().filter(s => s.submitter === session.username);
  if(!subs.length){ area.innerHTML = '<div class="muted">You have no submissions</div>'; return; }
  subs.forEach(s => {
    const el = document.createElement('div'); el.className = 'card'; el.style.margin = '8px 0';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHTML(s.name || s.levelName || '(completion)')}</strong> — ${escapeHTML(s.type)}</div><div><button class="btn ghost ms-delete" data-id="${s.id}">Delete</button></div></div>`;
    area.appendChild(el);
  });
  area.querySelectorAll('.ms-delete').forEach(b => b.onclick = function(){ if(!confirm('Delete submission?')) return; saveSubs(getSubs().filter(x=>x.id !== this.dataset.id)); initMySubmissionsPage(); });
}

/* ======================== MOD PANEL ======================== */
function initModPanelPage(){
  renderTopbar();
  const sess = getSession(); if(!sess){ alert('Login required'); window.location.href='index.html'; return; }
  const me = getUsers().find(u => u.username === sess.username);
  if(!me || (me.role !== 'mod' && me.role !== 'headadmin')){ alert('Mods only'); window.location.href='index.html'; return; }

  renderPendingSubmissions();
  renderRankingEditor();
  renderBannedUsersList();
  renderAuditLog();
  renderUserManagementArea();
  renderPlayerSearchArea();

  document.getElementById('ban-btn')?.addEventListener('click', () => {
    const username = (document.getElementById('ban-username') && document.getElementById('ban-username').value || '').trim();
    const days = parseInt((document.getElementById('ban-days') && document.getElementById('ban-days').value) || '1', 10);
    const reason = (document.getElementById('ban-reason') && document.getElementById('ban-reason').value) || 'No reason';
    if(!username){ alert('Enter a username'); return; }
    const users = getUsers(); const target = users.find(u => u.username === username);
    if(!target){ alert('User not found'); return; }
    if(target.role === 'headadmin'){ alert('You cannot ban the Head Admin'); return; }
    if(days === 0) target.bannedUntil = 9999999999999; else target.bannedUntil = Date.now() + days*24*3600*1000;
    target.banReason = reason; target.bannedBy = getSession().username; target.bannedAt = now();
    saveUsers(users);
    addAudit({ id: uid(), action:'ban', actor: getSession().username, target: target.username, details:{ until: target.bannedUntil, reason }, ts: now() });
    alert(`Banned ${username}`);
    renderBannedUsersList(); renderAuditLog();
  });
}

/* Pending submissions */
function renderPendingSubmissions(){
  const area = document.getElementById('pending-submissions'); if(!area) return; area.innerHTML = '';
  const subs = getSubs().filter(s => s.status === 'pending');
  if(!subs.length){ area.innerHTML = '<div class="muted">No pending submissions</div>'; return; }
  subs.forEach(s => {
    const wrapper = document.createElement('div'); wrapper.className = 'mod-item';
    wrapper.innerHTML = `<div style="max-width:60%"><strong>${escapeHTML(s.name || s.levelName || '(completion)')}</strong> — ${escapeHTML(s.type)} — ${escapeHTML(s.submitter)} ${s.levelRef ? '• levelRef:' + escapeHTML(s.levelRef) : ''}${renderTagBadgesHTML(s.tags||'') ? `<div class="tag-badges" style="margin-top:6px">${renderTagBadgesHTML(s.tags||[])}</div>` : ''}</div><div style="display:flex;gap:8px;align-items:center"><button class="btn approve" data-id="${s.id}">Approve</button><button class="btn ghost reject" data-id="${s.id}">Reject</button></div>`;
    area.appendChild(wrapper);
  });
  area.querySelectorAll('.approve').forEach(b => b.onclick = () => { approveSubmission(b.dataset.id); renderPendingSubmissions(); renderRankingEditor(); renderMainList(); renderAuditLog(); renderBannedUsersList(); });
  area.querySelectorAll('.reject').forEach(b => b.onclick = () => { if(!confirm('Reject?')) return; saveSubs(getSubs().filter(x => x.id !== b.dataset.id)); renderPendingSubmissions(); });
}

/* Approve submission (level or completion) */
function approveSubmission(id){
  const subs = getSubs(); const s = subs.find(x => x.id === id); if(!s) return;
  if(s.type === 'level'){
    const levels = getLevels(); const maxPlacement = levels.reduce((m,lv) => Math.max(m, lv.placement || 0), 0);
    const thumb = youtubeThumb(s.youtube) || '';
    const newLevel = {
      id: uid(),
      placement: maxPlacement + 1,
      name: s.name,
      levelId: s.levelId,
      creators: s.creators || [],
      thumbnail: thumb,
      youtube: s.youtube,
      tags: s.tags || [],
      status: 'published',
      submitter: s.submitter,
      approvedBy: getSession().username,
      approvedAt: now()
    };
    levels.push(newLevel); saveLevels(levels); saveSubs(subs.filter(x=>x.id !== id));
    addAudit({ id: uid(), action:'approve_level', actor:getSession() && getSession().username, target: newLevel.id, details:{ name:newLevel.name, placement:newLevel.placement }, ts: now() });
    alert('Level approved and added to main list');
  } else if(s.type === 'completion'){
    const levels = getLevels(); const level = levels.find(l => l.id === s.levelRef);
    if(!level){ alert('Referenced level not found'); return; }
    const placement = level.placement || 999;
    const pts = Math.max(1, Math.min(100, 101 - placement));
    const users = getUsers(); const user = users.find(u => u.username === s.submitter);
    if(!user){ alert('Submitter account missing'); saveSubs(subs.filter(x=>x.id !== id)); return; }
    user.points = (user.points || 0) + pts;
    user.completedRecords = user.completedRecords || [];
    const exists = user.completedRecords.find(r => r.levelId === s.levelRef && r.youtube === s.youtube);
    if(!exists){
      user.completedRecords.push({ levelId: s.levelRef, levelName: s.levelName || (level && level.name) || '', ts: now(), percent: (s.percent !== undefined ? s.percent : null), youtube: s.youtube, awardedPoints: pts });
    }
    saveUsers(users);
    saveSubs(subs.filter(x => x.id !== id));
    addAudit({ id: uid(), action:'approve_completion', actor:getSession() && getSession().username, target: s.id, details:{ submitter: user.username, level: s.levelRef, points: pts, percent: s.percent }, ts: now() });
    alert(`Approved completion — awarded ${pts} points to ${user.username}`);
  }
}

/* ----------------------- Ranking editor and tag edit/remove ----------------------- */
function renderRankingEditor(){
  const out = document.getElementById('ranking-editor'); if(!out) return; out.innerHTML = '';
  const levels = (getLevels()||[]).filter(l => l.status === 'published').slice().sort((a,b) => (a.placement||999) - (b.placement||999));
  if(!levels.length){ out.innerHTML = '<div class="muted">No published levels on the list.</div>'; return; }
  levels.forEach(l => {
    const row = document.createElement('div'); row.className = 'mod-item'; row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
    const left = document.createElement('div'); left.innerHTML = `<strong>#${l.placement}</strong> ${escapeHTML(l.name)}`;
    const right = document.createElement('div'); right.style.display = 'flex'; right.style.gap = '8px'; right.style.alignItems = 'center';
    const up = document.createElement('button'); up.className = 'btn ghost small-btn'; up.textContent = '↑'; up.onclick = () => { swapPlacement(l.id, -1); renderRankingEditor(); renderMainList(); };
    const down = document.createElement('button'); down.className = 'btn ghost small-btn'; down.textContent = '↓'; down.onclick = () => { swapPlacement(l.id, 1); renderRankingEditor(); renderMainList(); };
    const edit = document.createElement('button'); edit.className = 'btn ghost small-btn'; edit.innerHTML = '✎'; edit.title = 'Edit tags'; edit.onclick = () => openTagEditorForLevel(l.id);
    const removeBtn = document.createElement('button'); removeBtn.className = 'btn danger small-btn'; removeBtn.textContent = '✕'; removeBtn.onclick = () => { if(!confirm(`Permanently remove level "${l.name}"?`)) return; removeLevelById(l.id); addAudit({ id: uid(), action:'remove_level', actor:getSession() && getSession().username, target: l.id, details:{ name: l.name }, ts: now() }); renderRankingEditor(); renderMainList(); };
    right.appendChild(up); right.appendChild(down); right.appendChild(edit); right.appendChild(removeBtn);
    row.appendChild(left); row.appendChild(right); out.appendChild(row);
  });
}
function removeLevelById(id){ let levels = getLevels()||[]; levels = levels.filter(l => l.id !== id); levels.sort((a,b) => (a.placement||999) - (b.placement||999)); for(let i=0;i<levels.length;i++) levels[i].placement = i+1; saveLevels(levels); }

/* swap placement helper */
function swapPlacement(levelId, dir){ let levels = getLevels()||[]; levels.sort((a,b) => (a.placement||999) - (b.placement||999)); const idx = levels.findIndex(l => l.id === levelId); if(idx === -1) return; const tgt = idx + dir; if(tgt < 0 || tgt >= levels.length) return; const tmp = levels[idx].placement; levels[idx].placement = levels[tgt].placement; levels[tgt].placement = tmp; saveLevels(levels); }

/* Tag editor modal */
function openTagEditorForLevel(levelId){
  const lvl = getLevels().find(x => x.id === levelId); if(!lvl){ alert('Level not found'); return; }
  if(document.getElementById('tagEditorOverlay')) document.getElementById('tagEditorOverlay').remove();
  const overlay = document.createElement('div'); overlay.id = 'tagEditorOverlay'; Object.assign(overlay.style, {position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:999999});
  const panel = document.createElement('div'); panel.style.maxWidth='920px'; panel.style.width='min(92%,920px)'; panel.style.background='linear-gradient(180deg,#0f0f12,#141416)'; panel.style.border='1px solid rgba(255,255,255,0.04)'; panel.style.padding='20px'; panel.style.borderRadius='12px'; panel.style.color='white';
  panel.innerHTML = `<h3 style="margin-top:0">Edit tags for: ${escapeHTML(lvl.name)}</h3><div id="tag-editor-grid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button id="tag-editor-cancel" class="btn ghost">Cancel</button><button id="tag-editor-save" class="btn">Save</button></div>`;
  overlay.appendChild(panel); document.body.appendChild(overlay);
  const grid = document.getElementById('tag-editor-grid'); grid.innerHTML = '';
  const current = new Set(lvl.tags || []);
  ALL_TAGS.forEach(t => {
    const b = document.createElement('button'); b.type='button'; b.className='tagbtn'; b.dataset.tag = t; b.style.padding='8px 10px'; b.style.borderRadius='999px'; b.style.border='2px solid rgba(255,255,255,0.06)'; b.style.background = current.has(t) ? 'rgba(255,255,255,0.04)' : 'transparent'; b.textContent = t;
    if(current.has(t)) b.classList.add('selected');
    b.onclick = () => { b.classList.toggle('selected'); b.style.background = b.classList.contains('selected') ? 'rgba(255,255,255,0.04)' : 'transparent'; };
    grid.appendChild(b);
  });
  document.getElementById('tag-editor-cancel').onclick = () => overlay.remove();
  document.getElementById('tag-editor-save').onclick = () => {
    const selected = Array.from(grid.querySelectorAll('.tagbtn.selected')).map(b => b.dataset.tag);
    const levels = getLevels(); const target = levels.find(x => x.id === levelId);
    if(!target){ alert('Level missing'); overlay.remove(); return; }
    const old = (target.tags || []).slice();
    target.tags = selected;
    saveLevels(levels);
    addAudit({ id: uid(), action:'edit_tags', actor: getSession() && getSession().username, target: levelId, details:{ oldTags: old, newTags: selected }, ts: now() });
    overlay.remove();
    renderRankingEditor(); renderMainList(); renderAuditLog(); alert('Tags updated');
  };
}

/* ----------------------- Banned users list + unban ----------------------- */
function renderBannedUsersList(){
  const out = document.getElementById('banned-users-list'); if(!out) return; out.innerHTML = '';
  const users = getUsers() || [];
  const banned = users.filter(u => u.bannedUntil && (u.bannedUntil === 9999999999999 || u.bannedUntil > Date.now()));
  if(!banned.length){ out.innerHTML = '<div class="muted">No banned users.</div>'; return; }
  banned.forEach(u => {
    const row = document.createElement('div'); row.className = 'mod-item'; row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='Center';
    const info = document.createElement('div'); info.style.maxWidth='70%';
    info.innerHTML = `<div style="font-weight:700">${escapeHTML(u.username)}</div><div class="muted" style="margin-top:6px;font-size:13px">Banned until: <strong>${u.bannedUntil===9999999999999?'Permanent':formatDate(u.bannedUntil)}</strong> • Left: <strong>${u.bannedUntil===9999999999999?'permanent':durationFromNow(u.bannedUntil)}</strong><br>Reason: ${escapeHTML(u.banReason||'-')} • Banned by: ${escapeHTML(u.bannedBy||'-')} • When: ${u.bannedAt?formatDate(u.bannedAt):'-'}</div>`;
    const controls = document.createElement('div'); const unban = document.createElement('button'); unban.className='btn safe'; unban.textContent='Unban';
    unban.onclick = function(){ if(!confirm(`Unban ${u.username}?`)) return; const usersList = getUsers(); const t = usersList.find(x=>x.username===u.username); if(!t) return; delete t.bannedUntil; delete t.banReason; delete t.bannedBy; delete t.bannedAt; saveUsers(usersList); addAudit({ id: uid(), action:'unban', actor: getSession() && getSession().username, target: u.username, details:{}, ts: now() }); renderBannedUsersList(); renderAuditLog(); alert(`${u.username} unbanned`); };
    controls.appendChild(unban); row.appendChild(info); row.appendChild(controls); out.appendChild(row);
  });
}

/* ----------------------- Audit log ----------------------- */
function addAudit(obj){ const a = getAudit(); a.unshift(obj); if(a.length > 300) a.length = 300; saveAudit(a); }
function renderAuditLog(){ const out = document.getElementById('mod-audit-log'); if(!out) return; const list = getAudit() || []; out.innerHTML = ''; if(!list.length){ out.innerHTML = '<div class="muted">No audit events yet.</div>'; return; } list.slice(0,100).forEach(ev => { const row = document.createElement('div'); row.className = 'mod-item'; row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:700">${escapeHTML(ev.action)}</div><div class="muted" style="margin-top:6px;font-size:13px">${escapeHTML(ev.actor||'-')} ${ev.target?('• target: '+escapeHTML(String(ev.target))):''} • ${formatDate(ev.ts)}</div>`; const right = document.createElement('div'); right.style.fontSize='12px'; right.style.color='var(--muted)'; right.textContent = JSON.stringify(ev.details || {}); row.appendChild(left); row.appendChild(right); out.appendChild(row); }); }

/* ----------------------- Promotions (headadmin) ----------------------- */
function renderUserManagementArea(){
  const out = document.getElementById('user-management'); if(!out) return;
  out.innerHTML = '';
  const sess = getSession(); const me = getUsers().find(u => u.username === (sess && sess.username));
  if(!me) return;
  if(me.role !== 'headadmin'){ out.innerHTML = '<div class="muted">Promote users to moderator: Head Admin only.</div>'; return; }
  const users = getUsers().slice().sort((a,b)=> a.username.localeCompare(b.username));
  users.forEach(u => {
    if(u.username === me.username) return; // don't show self
    const row = document.createElement('div'); row.className = 'mod-item'; row.style.display='flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-weight:700">${escapeHTML(u.username)}</div><div class="muted">${escapeHTML(u.role || 'user')}</div>`;
    const right = document.createElement('div');
    if(u.role === 'mod'){ const span = document.createElement('div'); span.className='muted'; span.textContent = 'Moderator'; right.appendChild(span); }
    else {
      const promote = document.createElement('button'); promote.className = 'btn'; promote.textContent = 'Promote to Mod';
      promote.onclick = function(){ if(!confirm(`Promote ${u.username} to moderator?`)) return; const usersAll = getUsers(); const target = usersAll.find(x=>x.username===u.username); if(!target) return; target.role = 'mod'; saveUsers(usersAll); addAudit({ id: uid(), action:'promote_to_mod', actor: me.username, target: target.username, details:{}, ts: now() }); renderUserManagementArea(); alert(`${u.username} is now a moderator`); };
      right.appendChild(promote);
    }
    row.appendChild(left); row.appendChild(right); out.appendChild(row);
  });
}

/* ----------------------- Player search & completion deletion (NEW) ----------------------- */
function renderPlayerSearchArea(){
  const container = document.getElementById('player-search-area-wrapper');
  if(!container) return;
  container.innerHTML = `
    <div id="player-search-area">
      <input id="player-search-input" placeholder="Search player by username (partial allowed)">
      <button id="player-search-btn" class="btn">Search</button>
      <button id="player-search-clear" class="btn ghost">Clear</button>
    </div>
    <div id="player-search-results"></div>
    <div id="player-completions-area" style="margin-top:12px;"></div>
  `;
  document.getElementById('player-search-btn').onclick = () => {
    const q = (document.getElementById('player-search-input').value || '').trim().toLowerCase();
    const results = (getUsers()||[]).filter(u => u.username.toLowerCase().includes(q)).slice(0,50);
    const out = document.getElementById('player-search-results'); out.innerHTML = '';
    if(!results.length){ out.innerHTML = '<div class="muted">No players found</div>'; return; }
    results.forEach(u => {
      const card = document.createElement('div'); card.className = 'player-card';
      card.innerHTML = `<div><strong>${escapeHTML(u.username)}</strong> <div class="muted" style="font-size:13px">Points: ${u.points||0} • Role: ${escapeHTML(u.role||'user')}</div></div><div><button class="btn ghost view-player" data-user="${escapeHTML(u.username)}">View Completions</button></div>`;
      out.appendChild(card);
    });
    out.querySelectorAll('.view-player').forEach(b => b.onclick = function(){ renderPlayerCompletions(this.dataset.user); });
  };
  document.getElementById('player-search-clear').onclick = () => {
    document.getElementById('player-search-input').value = '';
    document.getElementById('player-search-results').innerHTML = '';
    document.getElementById('player-completions-area').innerHTML = '';
  };
}

function renderPlayerCompletions(username){
  const area = document.getElementById('player-completions-area');
  if(!area) return;
  const users = getUsers(); const u = users.find(x => x.username === username);
  if(!u){ area.innerHTML = '<div class="muted">Player not found</div>'; return; }
  const recs = (u.completedRecords || []).slice().sort((a,b) => (b.ts||0)-(a.ts||0));
  area.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><h3 style="margin:0">${escapeHTML(u.username)} — Completions</h3><div class="muted">Points: ${u.points||0}</div></div></div>`;
  if(!recs.length){ area.innerHTML += '<div class="muted" style="margin-top:8px">No completions</div>'; return; }
  recs.forEach((r, idx) => {
    const block = document.createElement('div'); block.className = 'card'; block.style.margin = '8px 0'; block.style.display = 'flex'; block.style.justifyContent='space-between'; block.style.alignItems='center';
    const left = document.createElement('div'); left.style.maxWidth='70%';
    left.innerHTML = `<div style="font-weight:700">${escapeHTML(r.levelName || '(unknown)')}</div><div class="muted" style="margin-top:6px">Completed: ${r.ts ? formatDate(r.ts) : '-'}${r.percent ? ' • ' + escapeHTML(String(r.percent)) + '%' : ''}</div>`;
    const right = document.createElement('div'); right.style.display='flex'; right.style.gap='8px';
    const view = document.createElement('a'); view.className='btn ghost'; view.textContent = 'View Level'; view.href = `mainlist.html`;
    const del = document.createElement('button'); del.className='btn danger'; del.textContent = 'Delete Completion';
    del.onclick = () => {
      if(!confirm(`Delete this completion by ${u.username} for "${r.levelName}"? This will remove the record and subtract awarded points.`)) return;
      const pts = r.awardedPoints !== undefined ? r.awardedPoints : (function(){
        const level = getLevels().find(L => L.id === r.levelId);
        if(level){ const placement = level.placement || 999; return Math.max(1, Math.min(100, 101 - placement)); }
        return 1;
      })();
      const usersList = getUsers();
      const target = usersList.find(x => x.username === u.username);
      if(!target) { alert('User missing'); return; }
      target.completedRecords = (target.completedRecords || []).filter(rec => !(rec.levelId === r.levelId && rec.youtube === r.youtube && rec.ts === r.ts));
      target.points = Math.max(0, (target.points||0) - pts);
      saveUsers(usersList);
      addAudit({ id: uid(), action:'delete_completion', actor: getSession() && getSession().username, target: target.username, details:{ levelId: r.levelId, levelName: r.levelName, pointsRemoved: pts }, ts: now() });
      alert(`Deleted completion and removed ${pts} points from ${target.username}.`);
      renderPlayerCompletions(username);
      renderStatsArea();
    };
    right.appendChild(view); right.appendChild(del);
    block.appendChild(left); block.appendChild(right);
    area.appendChild(block);
  });
}

/* ----------------------- Change password ----------------------- */
function initChangePasswordPage(){
  renderTopbar();
  const sess = getSession(); if(!sess){ alert('Login required'); window.location.href='index.html'; return; }
  const form = document.getElementById('change-password-form'); const msg = document.getElementById('cp-msg'); if(!form) return;
  form.onsubmit = function(e){ e.preventDefault(); const cur = (document.getElementById('cp-current')&&document.getElementById('cp-current').value)||''; const n1 = (document.getElementById('cp-new')&&document.getElementById('cp-new').value)||''; const n2 = (document.getElementById('cp-new2')&&document.getElementById('cp-new2').value)||''; const users = getUsers(); const me = users.find(u=>u.username===sess.username); if(!me){ if(msg) { msg.textContent='User not found'; msg.style.color='#ff6b6b'; } return; } if(cur !== me.password){ if(msg){ msg.textContent='Current password incorrect'; msg.style.color='#ff6b6b'; } return; } if(n1.length < 6){ if(msg){ msg.textContent='New password >=6 chars'; msg.style.color='#ff6b6b'; } return; } if(n1 !== n2){ if(msg){ msg.textContent='New passwords do not match'; msg.style.color='#ff6b6b'; } return; } me.password = n1; saveUsers(users); addAudit({ id: uid(), action:'change_password', actor: me.username, target: me.username, details:{}, ts: now() }); if(msg){ msg.textContent = 'Password changed successfully'; msg.style.color = '#30c75b'; } };
}

/* ----------------------- Stats viewer (placement numbers) ----------------------- */
function initStatsPage(){ renderTopbar(); renderStatsArea(); }

function renderStatsArea(){
  const area = document.getElementById('stats-area'); if(!area) return; area.innerHTML = '';
  const users = (getUsers()||[]).slice().sort((a,b) => (b.points||0) - (a.points||0));
  // header with placement column
  const header = document.createElement('div'); header.className='stats-table-header'; header.style.fontWeight='700';
  header.innerHTML = '<div style="flex:0 0 60px">#</div><div>Player</div><div>Nationality</div><div>Registered</div><div>Role</div><div>Points</div>';
  area.appendChild(header);
  users.forEach((u, index) => {
    const row = document.createElement('div'); row.className = 'stats-table-row';
    // placement number column then rest
    const placementCol = `<div style="flex:0 0 60px">${index+1}</div>`;
    const unameLink = `<a class="user-link" href="profile.html?user=${encodeURIComponent(u.username)}">${escapeHTML(u.username)}</a>`;
    const rest = `<div>${unameLink}</div><div>${escapeHTML(u.nationality||'')}</div><div>${u.createdAt?formatDate(u.createdAt):'-'}</div><div>${escapeHTML(displayRoleLabel(u.role))}</div><div>${u.points||0}</div>`;
    row.innerHTML = placementCol + rest;
    area.appendChild(row);
  });
}

/* ----------------------- Profile pages (edit + public) ----------------------- */
function parseQuery(q){ if(!q) return {}; return Object.fromEntries(new URLSearchParams(q)); }
window._profilePicPending = null;

function initProfilePage(){
  renderTopbar();
  const params = parseQuery(window.location.search.slice(1));
  const viewingUser = params.user ? params.user : null;
  if(viewingUser){
    renderPublicProfileView(viewingUser);
    return;
  }
  const session = getSession();
  if(!session){ alert('Login required'); window.location.href='index.html'; return; }
  const users = getUsers(); const me = users.find(u => u.username === session.username);
  if(!me){ clearSession(); alert('User missing'); window.location.href='index.html'; return; }

  const editorArea = document.getElementById('editor-area'); if(editorArea) editorArea.style.display = 'block';

  const previewImg = document.getElementById('profile-pic-preview');
  if(previewImg) previewImg.src = (me.profilePic && me.profilePic.trim()) ? me.profilePic : DEFAULT_PFP;
  const fileInput = document.getElementById('profile-pic-input');
  const picMsg = document.getElementById('profile-pic-msg');
  if(fileInput){
    fileInput.value = '';
    fileInput.onchange = function(){
      const f = this.files && this.files[0];
      if(!f){ if(picMsg) picMsg.textContent = ''; window._profilePicPending = null; return; }
      if(f.size > 3 * 1024 * 1024){ if(picMsg) picMsg.textContent = 'File too large (3MB max)'; this.value=''; window._profilePicPending = null; return; }
      const reader = new FileReader();
      reader.onload = function(ev){
        const img = new Image();
        img.onload = function(){
          if(img.width > 1080 || img.height > 1080){ if(picMsg) picMsg.textContent = 'Image dims must be <=1080px'; window._profilePicPending = null; return; }
          if(img.width !== img.height){ if(picMsg) picMsg.textContent = 'Image must be square (1:1)'; window._profilePicPending = null; return; }
          window._profilePicPending = ev.target.result;
          if(picMsg) picMsg.textContent = 'Image ready to save (will appear after saving)';
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(f);
    };
  }

  const bioEl = document.getElementById('profile-bio'); if(bioEl) bioEl.value = me.bio || '';
  const showCountryEl = document.getElementById('profile-show-country'); if(showCountryEl) showCountryEl.checked = !!me.showCountry;

  renderTitlesListFor(me.username, true);

  document.getElementById('profile-save-btn')?.addEventListener('click', function(){
    const bio = (document.getElementById('profile-bio') && document.getElementById('profile-bio').value || '').slice(0,250);
    const showCountry = !!(document.getElementById('profile-show-country') && document.getElementById('profile-show-country').checked);
    const users = getUsers(); const idx = users.findIndex(x => x.username === me.username); if(idx === -1) return;
    if(window._profilePicPending){
      users[idx].profilePic = window._profilePicPending;
      window._profilePicPending = null;
      const msg = document.getElementById('profile-pic-msg'); if(msg) msg.textContent = 'Saved';
    }
    users[idx].bio = bio; users[idx].showCountry = showCountry;

    // VALIDATION: ensure equippedTitle is allowed for the user (strict gate)
    const equipped = users[idx].equippedTitle || 'fresh';
    if(!canEquipTitle(users[idx], equipped)){
      const attempted = equipped;
      users[idx].equippedTitle = 'fresh';
      addAudit({ id: uid(), action:'invalid_equipped_title_reset', actor: me.username, target: me.username, details:{ attempted: attempted }, ts: now() });
      alert('Your equipped title was not allowed and has been reset to Fresh.');
    }

    saveUsers(users);
    addAudit({ id: uid(), action:'edit_profile', actor: me.username, target: me.username, details:{ showCountry }, ts: now() });
    alert('Profile saved');
    renderTopbar(); renderProfilePreviewFor(me.username); renderTitlesListFor(me.username, true);
  });

  renderProfilePreviewFor(me.username);
  renderCompletionsForUser(me.username, false);
}

/* Titles list for a profile (only those the user has) with equip validation */
function renderTitlesListFor(username, editable){
  let container = document.getElementById('profile-titles-list');
  if(!container){
    const right = document.getElementById('profile-right');
    if(right){ container = document.createElement('div'); container.id = 'profile-titles-list'; right.appendChild(container); } else {
      const main = document.querySelector('.container');
      container = document.createElement('div'); container.id = 'profile-titles-list'; if(main) main.appendChild(container);
    }
  }
  container.innerHTML = '';
  const users = getUsers(); const user = users.find(u => u.username === username) || {};
  container.style.maxWidth = '720px'; container.style.margin = '0 auto';
  const myTitles = TITLES.filter(t => canEquipTitle(user, t.id));
  if(!myTitles.length){ container.innerHTML = '<div class="muted">No titles available yet</div>'; return; }
  myTitles.forEach(t => {
    const row = document.createElement('div'); row.className = 'title-row'; row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.marginBottom = '8px';
    const left = document.createElement('div'); left.innerHTML = `<div class="title-main">${escapeHTML(t.label)}</div><div class="title-sub muted">${escapeHTML(t.reqText)}</div>`;
    const right = document.createElement('div');
    const isEquipped = user && user.equippedTitle === t.id;
    if(editable){
      const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = isEquipped ? 'Unequip' : 'Equip';

      // ONCLICK: re-check eligibility at click time (authoritative)
      btn.onclick = function(){
        const users2 = getUsers(); const idx = users2.findIndex(x => x.username === username); if(idx === -1) return;
        const freshUser = users2[idx];

        if(!canEquipTitle(freshUser, t.id)){
          alert('You do not meet the requirements to equip this title.');
          addAudit({ id: uid(), action:'attempt_invalid_equip', actor: freshUser.username, target: freshUser.username, details:{ attemptedTitle: t.id }, ts: now() });
          return;
        }

        if(freshUser.equippedTitle === t.id){
          freshUser.equippedTitle = 'fresh';
          saveUsers(users2);
          addAudit({ id: uid(), action:'unequip_title', actor: username, target: username, details:{ previous: t.id }, ts: now() });
          alert('Title unequipped (reverted to Fresh)');
        } else {
          freshUser.equippedTitle = t.id;
          saveUsers(users2);
          addAudit({ id: uid(), action:'equip_title', actor: username, target: username, details:{ title: t.id }, ts: now() });
          alert('Title equipped: ' + t.label);
        }
        renderTitlesListFor(username, editable);
        renderTopbar();
        renderProfilePreviewFor(username);
      };

      right.appendChild(btn);
    } else {
      if(isEquipped){ const badge = document.createElement('div'); badge.className = 'muted'; badge.style.fontSize = '13px'; badge.textContent = 'Equipped'; right.appendChild(badge); }
    }
    row.appendChild(left); row.appendChild(right); container.appendChild(row);
  });
}

/* Public profile view */
function renderPublicProfileView(username){
  renderTopbar();
  const users = getUsers(); const user = users.find(u => u.username === username);
  if(!user){
    const main = document.querySelector('.container');
    if(main){ main.innerHTML = '<div class="card"><div class="muted">User not found</div></div>'; }
    return;
  }
  const main = document.querySelector('.container');
  main.innerHTML = `
    <div class="hero">
      <h1 class="page-title">${escapeHTML(user.username)}</h1>
      <div class="page-sub muted">Public profile</div>
    </div>
    <section class="card profile-grid">
      <div id="profile-left" style="padding:18px;"></div>
      <div id="profile-right" style="padding:18px;"></div>
    </section>
  `;
  const left = document.getElementById('profile-left');
  const pic = document.createElement('img'); pic.style.width='160px'; pic.style.height='160px'; pic.style.borderRadius='50%'; pic.style.objectFit='cover'; pic.src = (user.profilePic && user.profilePic.trim()) ? user.profilePic : DEFAULT_PFP; pic.onerror = () => { pic.src = DEFAULT_PFP; };
  const name = document.createElement('div'); name.style.fontWeight='700'; name.style.marginTop='8px'; const flag = user.showCountry ? countryToFlag(user.nationality) : '';
  name.innerHTML = `${escapeHTML(user.username)} ${flag ? ('<span style="margin-left:6px">'+escapeHTML(flag)+'</span>') : ''}`;
  if(user.equippedTitle){ const t = TITLES.find(x=>x.id===user.equippedTitle); if(t) name.innerHTML += `<div style="font-size:13px;color:var(--muted);margin-top:6px">${escapeHTML(t.label)}</div>`; }
  const bio = document.createElement('div'); bio.className='muted'; bio.style.marginTop='8px'; bio.textContent = user.bio || '';
  left.appendChild(pic); left.appendChild(name); left.appendChild(bio);

  const right = document.getElementById('profile-right');
  const titles = TITLES.filter(t => canEquipTitle(user, t.id));
  const titlesWrap = document.createElement('div'); titlesWrap.style.marginBottom = '12px'; titlesWrap.innerHTML = '<h3 style="margin:0 0 8px">Titles</h3>';
  if(!titles.length) titlesWrap.innerHTML += '<div class="muted">No titles</div>';
  else titles.forEach(t => { const el = document.createElement('div'); el.className='title-row'; el.style.marginBottom='8px'; el.innerHTML = `<div><div class="title-main">${escapeHTML(t.label)}</div><div class="title-sub muted">${escapeHTML(t.reqText)}</div></div><div style="color:var(--muted)">${user.equippedTitle===t.id ? 'Equipped' : ''}</div>`; titlesWrap.appendChild(el); });
  right.appendChild(titlesWrap);

  const compWrap = document.createElement('div'); compWrap.innerHTML = '<h3 style="margin:0 0 8px">Completions</h3>'; compWrap.style.maxWidth='720px';
  const recs = (user.completedRecords || []).slice().sort((a,b)=> (b.ts||0)-(a.ts||0));
  if(!recs.length) compWrap.innerHTML += '<div class="muted">No completions</div>';
  else {
    recs.forEach(r => {
      const block = document.createElement('div'); block.className='card'; block.style.margin='8px 0';
      block.innerHTML = `<div style="display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:start"><div style="width:160px;height:90px;border-radius:8px;overflow:hidden;background:#0b0b0b">${r.youtube?`<iframe src="${youtubeEmbed(r.youtube)}" style="width:100%;height:90px;border:0"></iframe>`:'<div class="muted" style="padding:12px">No video</div>'}</div><div><div style="font-weight:700">${escapeHTML(r.levelName||'')}</div><div class="muted" style="margin-top:6px">Completed: ${r.ts?formatDate(r.ts):'-'} ${r.percent?(' • Percent: '+escapeHTML(String(r.percent))+'%'):''}</div></div></div>`;
      compWrap.appendChild(block);
    });
  }
  right.appendChild(compWrap);
}

/* Profile preview for editing */
function renderProfilePreviewFor(username){
  const left = document.getElementById('profile-left'); if(!left) return;
  left.innerHTML = '';
  const users = getUsers(); const user = users.find(u => u.username === username); if(!user) return;
  const previewWrap = document.createElement('div'); previewWrap.id = 'profile-preview-center';
  const pic = document.createElement('img'); pic.id='profile-pic-preview'; pic.src = (user.profilePic && user.profilePic.trim()) ? user.profilePic : DEFAULT_PFP; pic.onerror = () => { pic.src = DEFAULT_PFP; }; previewWrap.appendChild(pic);
  const name = document.createElement('div'); name.style.fontWeight='700'; name.style.marginTop='6px';
  const flag = user.showCountry ? countryToFlag(user.nationality) : '';
  name.innerHTML = `${escapeHTML(user.username)} ${flag ? ('<span style="margin-left:6px">'+escapeHTML(flag)+'</span>') : ''}`;
  if(user.equippedTitle){ const t = TITLES.find(x=>x.id===user.equippedTitle); if(t) name.innerHTML += `<div style="font-size:13px;color:var(--muted);margin-top:6px">${escapeHTML(t.label)}</div>`; }
  const bio = document.createElement('div'); bio.className='muted'; bio.style.marginTop='8px'; bio.textContent = user.bio || '';
  previewWrap.appendChild(name); previewWrap.appendChild(bio);
  left.appendChild(previewWrap);
}

/* Completions list (edit mode) */
function renderCompletionsForUser(username, publicFlag){
  const users = getUsers(); const user = users.find(u => u.username === username); if(!user) return;
  const recs = (user.completedRecords || []).slice().sort((a,b)=> (b.ts||0)-(a.ts||0));
  const out = document.getElementById('profile-completions');
  if(!out) return;
  out.innerHTML = '<h3 style="margin:0 0 8px">Completions</h3>';
  out.style.maxWidth = '720px';
  out.style.margin = '0 auto';
  if(!recs.length){ out.innerHTML += '<div class="muted">No completions</div>'; return; }
  recs.forEach(r => {
    const block = document.createElement('div'); block.className='card'; block.style.margin='8px 0';
    block.innerHTML = `<div style="display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:start"><div style="width:160px;height:90px;border-radius:8px;overflow:hidden;background:#0b0b0b">${r.youtube?`<iframe src="${youtubeEmbed(r.youtube)}" style="width:100%;height:90px;border:0"></iframe>`:'<div class="muted" style="padding:12px">No video</div>'}</div><div><div style="font-weight:700">${escapeHTML(r.levelName||'')}</div><div class="muted" style="margin-top:6px">Completed: ${r.ts?formatDate(r.ts):'-'} ${r.percent?(' • Percent: '+escapeHTML(String(r.percent))+'%'):''}</div></div></div>`;
    out.appendChild(block);
  });
}

/* ----------------------- Utility: points for placement ----------------------- */
function pointsForPlacement(placement){
  if(!placement) return 1;
  const p = Math.max(1, Math.min(100, 101 - (placement || 999)));
  return p;
}

/* ----------------------- Expose global initPage ----------------------- */
window.initPage = initPage;

/* End of file */