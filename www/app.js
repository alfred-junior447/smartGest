// ========== CONFIG ==========
const OLD = 'smartgest.v1';
const KD = 'smartgest.v2.data';
const KA = 'smartgest.v2.auth';
const WHATSAPP_NUMBER = '+237692088065';

// ========== STATE ==========
let S = null;
let tab = 'home';
let cart = {};
let K = null;
let idle = null;
let hiddenAt = 0;
let q = Promise.resolve();
let currentPage = 0;
let searchQuery = '';
let rd = ymd(new Date());

// ========== TABS ==========
const TABS = [
  ["home", "Tableau"],
  ["stock", "Stock"],
  ["sell", "Vendre"],
  ["history", "Historique"],
  ["stats", "Stats"],
  ["calendar", "Calendrier"],
  ["sec", "Sécurité"],
  ["contact", "Contact"]
];

// ========== INIT ==========
function init() {
  // Theme
  const savedTheme = localStorage.getItem('theme') || 'auto';
  if (savedTheme !== 'auto') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  
  // Render
  render();
  
  // Privacy screen (Capacitor)
  try {
    const PS = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PrivacyScreen;
    if (PS) PS.enable();
  } catch (e) {}
}

// ========== UTILS ==========
const enc = new TextEncoder();
const dec = new TextDecoder();

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}

function f(n) {
  return Math.round(n).toLocaleString("fr-FR") + " FCFA";
}

function ymd(d) {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function today() {
  return ymd(new Date());
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function b64(u) {
  u = new Uint8Array(u);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

function ub(s) {
  const r = atob(s);
  const u = new Uint8Array(r.length);
  for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i);
  return u;
}

function lsGet(k) {
  try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
}

function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
}

// ========== CRYPTO ==========
async function derive(pin, salt) {
  const m = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const all = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: salt,
    iterations: 310000,
    hash: 'SHA-256'
  }, m, 512));
  const key = await crypto.subtle.importKey('raw', all.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { key: key, ver: b64(all.slice(32)) };
}

async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

async function unseal(key, b) {
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: ub(b.iv)
  }, key, ub(b.ct))));
}

// ========== WEAK PIN CHECK ==========
function weak(p) {
  const simplePatterns = [
    /^(\d)\1{5}$/, // 111111
    /^(\d)(\d)\1\2\1\2$/, // 121212
    /^(\d)(\d)(\d)\1\2\3$/, // 123123
    /^(\d)(\d)(\d)\3\2\1$/, // 321123
    /^123456$/, /^654321$/, /^112233$/, /^121212$/, 
    /^000000$/, /^111222$/, /^123123$/, /^222222$/, /^333333$/, 
    /^444444$/, /^555555$/, /^666666$/, /^777777$/, /^888888$/, 
    /^999999$/, /^000111$/, /^111000$/, /^123789$/, /^987654$/
  ];
  return simplePatterns.some(pattern => pattern.test(p)) ||
         ['000000', '111111', '123456', '654321', '123123', '112233'].includes(p);
}

// ========== SAVE ==========
function save() {
  if (!K || !S) return;
  const key = K;
  const snap = JSON.parse(JSON.stringify(S));
  q = q.then(async function() {
    const b = await seal(key, snap);
    try {
      const o = localStorage.getItem(OLD);
      if (o) localStorage.setItem(KD + '.prev', o);
    } catch (e) {}
    if (!lsSet(KD, b)) {
      msg("⚠️ Stockage plein ! Supprimez des données ou exportez une sauvegarde.");
      throw new Error("Storage full");
    }
  }).catch(function() {});
}

// ========== TOAST ==========
let tt;
function msg(t) {
  const e = $("toast");
  e.textContent = t;
  e.style.display = "block";
  clearTimeout(tt);
  tt = setTimeout(function() { e.style.display = "none"; }, 3500);
}

// ========== NAV ==========
function go(t) {
  tab = t;
  currentPage = 0; // Reset pagination
  render();
}

// ========== BUSY STATE ==========
function busy(b) {
  const x = $('lbtn');
  if (x) x.disabled = b;
  const allButtons = document.querySelectorAll('button');
  allButtons.forEach(btn => {
    if (btn.id !== 'theme-toggle' && !btn.id) btn.disabled = b;
  });
}

// ========== LOCK ==========
function lock() {
  S = null;
  K = null;
  cart = {};
  clearTimeout(idle);
  try { $('dlg').close(); } catch (e) {}
  render();
}

function startIdle() {
  clearTimeout(idle);
  idle = setTimeout(lock, 120000);
}

['pointerdown', 'keydown', 'scroll'].forEach(function(ev) {
  addEventListener(ev, function() { if (K) startIdle(); }, { passive: true });
});

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    hiddenAt = Date.now();
  } else if (K && hiddenAt && Date.now() - hiddenAt > 30000) {
    lock();
  }
});

// ========== THEME ==========
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : (currentTheme === 'light' ? 'auto' : 'dark');
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  msg(`Thème : ${newTheme === 'auto' ? 'Automatique' : newTheme === 'dark' ? 'Sombre' : 'Clair'}`);
}

// ========== RENDER ==========
function render() {
  if (!S) {
    $("nav").innerHTML = "";
    $("app").innerHTML = vLock();
    return;
  }
  
  // Add theme toggle button
  if (!document.getElementById('theme-toggle')) {
    const themeBtn = document.createElement('button');
    themeBtn.id = 'theme-toggle';
    themeBtn.innerHTML = '🌓';
    themeBtn.onclick = toggleTheme;
    themeBtn.className = 'theme-toggle';
    document.body.appendChild(themeBtn);
  }
  
  $("nav").innerHTML = TABS.map(function(t) {
    return '<button onclick="go(\''+t[0]+'\')" aria-current="'+(tab===t[0])+'">'+t[1]+'</button>';
  }).join("");
  
  $("app").innerHTML = ({
    home: vHome,
    stock: vStock,
    sell: vSell,
    history: vHistory,
    stats: vStats,
    calendar: vCalendar,
    sec: vSec,
    contact: vContact
  })[tab]();
}

// ========== VIEWS ==========
function vLock() {
  if (!(window.crypto && crypto.subtle)) {
    return '<div class="empty">Le chiffrement n’est pas disponible dans ce navigateur. Ouvrez l’application dans un navigateur récent en HTTPS.</div>';
  }
  
  const A = lsGet(KA);
  const hasData = localStorage.getItem(OLD) || lsGet(KD);
  const hasEncryptedData = lsGet(KD);
  const setup = !(A && A.ver);
  
  // Si pas de code PIN défini
  if (setup) {
    // Si des données chiffrées existent sans code, c'est un problème
    if (hasEncryptedData) {
      let h = '<div style="max-width:360px;margin:10vh auto 0">';
      h += '<h1>SmartGest</h1>';
      h += '<div class="panel bad">⚠️ Des données chiffrées existent mais aucun code PIN n’est configuré.<br>Vous devez restaurer une sauvegarde ou réinitialiser l’application.</div>';
      h += '<div class="row" style="gap:10px; margin-top:15px">';
      h += '<button onclick="go('sec')" style="flex:1">Restaurer une sauvegarde</button>';
      h += '<button onclick="confirmResetApp()" style="flex:1" class="bad">Réinitialiser (tout effacer)</button>';
      h += '</div></div>';
      return h;
    }
    
    let h = '<div style="max-width:360px;margin:10vh auto 0">';
    h += '<h1>SmartGest</h1>';
    
    if (hasData) {
      h += '<p class="sub">Bienvenue ! Vous pouvez accéder à vos données sans code PIN ou en créer un code pour plus de sécurité.</p>';
    } else {
      h += '<p class="sub">Commencez à utiliser SmartGest. Vous pouvez créer un code PIN pour protéger vos données.</p>';
    }
    
    h += '<div class="row" style="gap:10px">';
    h += '<button id="lbtn" style="flex:1" onclick="skipPinSetup()">' + (hasData ? 'Accéder sans code' : 'Commencer sans code') + '</button>';
    h += '<button id="lbtn" style="flex:1" onclick="showPinSetup()">Créer un code PIN</button>';
    h += '</div></div>';
    return h;
  }
  
  // Si code PIN existe, demander de le saisir
  let h = '<div style="max-width:360px;margin:10vh auto 0">';
  h += '<h1>SmartGest</h1>';
  h += '<p class="sub">Entrez votre code pour ouvrir l’application.</p>';
  h += '<label>Code à 6 chiffres</label><input id="p1" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="6">';
  h += '<div id="lerr" class="bad" style="min-height:22px;margin:10px 0"></div>';
  h += '<button id="lbtn" style="width:100%" onclick="doUnlock()">Déverrouiller</button></div>';
  
  return h;
}

// ========== RESET APP ==========
function confirmResetApp() {
  if (confirm('⚠️ ATTENTION : Cela supprimera TOUTES vos données (produits, ventes, etc.) et réinitialisera l’application. \n\nCette action est IRRÉVERSIBLE. Voulez-vous vraiment continuer ?')) {
    localStorage.clear();
    location.reload();
  }
}

// ========== PIN SETUP OPTION ==========
function showPinSetup() {
  let h = '<div style="max-width:360px;margin:10vh auto 0">';
  h += '<h1>SmartGest</h1>';
  h += '<p class="sub">Créez un code à 6 chiffres. Il chiffre vos données sur cet appareil et ne peut pas être récupéré : notez-le en lieu sûr.</p>';
  h += '<label>Code à 6 chiffres</label><input id="p1" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="6">';
  h += '<label>Confirmer le code</label><input id="p2" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="6">';
  h += '<div id="lerr" class="bad" style="min-height:22px;margin:10px 0"></div>';
  h += '<button id="lbtn" style="width:100%" onclick="doSetup()">Créer le code</button></div>';
  $("app").innerHTML = h;
}

function skipPinSetup() {
  // Créer un état sans code PIN
  const old = lsGet(OLD);
  if (!old || !Array.isArray(old.products) || !Array.isArray(old.sales)) {
    S = { products: [], sales: [] };
  } else {
    S = old;
  }
  K = null; // Pas de clé de chiffrement
  tab = 'home';
  startIdle();
  render();
}



function vHome() {
  const ts = S.sales.filter(function(s) { return ymd(new Date(s.t)) === today(); });
  let rev = 0, gain = 0;
  
  ts.forEach(function(s) {
    rev += s.total;
    s.items.forEach(function(i) { gain += (i.p - i.b) * i.q; });
  });
  
  let val = 0;
  S.products.forEach(function(p) { val += p.buy * p.qty; });
  
  const low = S.products.filter(function(p) { return p.qty <= p.min; });
  
  const monthlySales = S.sales.filter(s => {
    const saleDate = new Date(s.t);
    return saleDate.getMonth() === new Date().getMonth() &&
           saleDate.getFullYear() === new Date().getFullYear();
  });
  const monthlyRev = monthlySales.reduce((sum, s) => sum + s.total, 0);
  
  let h = '<h1>Aujourd’hui</h1><p class="sub">' + new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + '</p>';
  
  h += '<div class="panel"><div class="mute">Ventes du jour</div><div class="big">' + f(rev) + '</div><div class="mute">' + ts.length + ' vente(s) · bénéfice <span class="ok">' + f(gain) + '</span></div></div>';
  
  h += '<div class="grid">';
  h += '<div class="panel"><div class="mute">Ventes ce mois</div><b>' + f(monthlyRev) + '</b><div class="mute">' + monthlySales.length + ' vente(s)</div></div>';
  h += '<div class="panel"><div class="mute">Valeur du stock</div><b>' + f(val) + '</b></div>';
  h += '</div>';
  
  h += '<div class="grid">';
  h += '<div class="panel"><div class="mute">Produits</div><b>' + S.products.length + '</b></div>';
  h += '<div class="panel"><div class="mute">Ventes totales</div><b>' + S.sales.length + '</b></div>';
  h += '</div>';
  
  h += '<div class="panel row"><div><b>Rapport du jour</b><div class="mute">Fichier CSV, ouvrable dans Excel</div></div><button onclick="dl(ymd(new Date()))">Télécharger</button></div>';
  
  h += '<h2>À réapprovisionner</h2>';
  
  if (!S.products.length) {
    h += '<div class="empty">Ajoutez votre premier produit pour démarrer.<br><br><button onclick="go(\'stock\')">Ajouter un produit</button></div>';
  } else if (!low.length) {
    h += '<div class="panel ok">Aucun produit en rupture proche.</div>';
  } else {
    h += low.map(function(p) {
      return '<div class="panel row"><span>' + esc(p.name) + '</span><b class="' + (p.qty === 0 ? 'bad' : 'warn') + '">' + (p.qty === 0 ? 'Rupture' : p.qty + ' restant(s)') + '</b></div>';
    }).join("");
  }
  
  return h;
}

function vStock() {
  const filteredProducts = searchQuery
    ? S.products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : S.products;
  
  let h = '<div class="row"><h1>Stock</h1><button onclick="editP()">Ajouter</button></div>';
  h += '<p class="sub">Touchez un produit pour le modifier.</p>';
  
  h += '<div class="search-box"><input id="search" type="text" placeholder="Rechercher un produit..." value="' + esc(searchQuery) + '" oninput="searchQuery=this.value;render()"></div>';
  
  if (!filteredProducts.length) {
    return h + '<div class="empty">Aucun produit trouvé. ' + (S.products.length === 0 ? 'Ajoutez le premier avec son prix d’achat, son prix de vente et sa quantité.' : 'Essayez un autre terme.') + '</div>';
  }
  
  return h + filteredProducts.map(function(p) {
    return '<div class="panel row" onclick="editP(\'' + p.id + '\')"><div><b>' + esc(p.name) + '</b><div class="mute">Vente ' + f(p.sell) + ' · achat ' + f(p.buy) + '</div></div><b class="' + (p.qty <= p.min ? (p.qty === 0 ? 'bad' : 'warn') : '') + '">' + p.qty + '</b></div>';
  }).join("");
}

function editP(id) {
  const p = S.products.find(x => x.id === id) || { name: "", buy: "", sell: "", qty: "", min: 3 };
  
  let h = '<h2 style="margin-top:0">' + (id ? "Modifier le produit" : "Nouveau produit") + '</h2>';
  h += '<label>Nom</label><input id="n" value="' + esc(p.name) + '">';
  h += '<div class="grid">';
  h += '<div><label>Prix d’achat</label><input id="b" type="text" inputmode="numeric" pattern="[0-9]*" value="' + p.buy + '"></div>';
  h += '<div><label>Prix de vente</label><input id="s" type="text" inputmode="numeric" pattern="[0-9]*" value="' + p.sell + '"></div>';
  h += '<div><label>Quantité</label><input id="q" type="text" inputmode="numeric" pattern="[0-9]*" value="' + p.qty + '"></div>';
  h += '<div><label>Alerte à partir de</label><input id="m" type="text" inputmode="numeric" pattern="[0-9]*" value="' + p.min + '"></div>';
  h += '</div>';
  h += '<div class="row" style="margin-top:16px">';
  if (id) {
    h += '<button class="ghost bad" onclick="confirmDeleteP(\'' + id + '\')">Supprimer</button>';
  } else {
    h += '<span></span>';
  }
  h += '<span><button class="ghost" onclick="$(\'dlg\').close()">Annuler</button> <button onclick="saveP(\'' + (id || "") + '\')">Enregistrer</button></span></div>';
  
  $("dlg").innerHTML = h;
  $("dlg").showModal();
}

function confirmDeleteP(id) {
  if (!confirm('Voulez-vous vraiment supprimer ce produit ? Cette action est irréversible.')) return;
  delP(id);
}

function saveP(id) {
  const name = $("n").value.trim();
  if (!name) { $("n").focus(); return; }
  
  const o = {
    name: name,
    buy: +$("b").value || 0,
    sell: +$("s").value || 0,
    qty: Math.max(0, +$("q").value || 0),
    min: +$("m").value || 0
  };
  
  if (id) {
    Object.assign(S.products.find(x => x.id === id), o);
  } else {
    o.id = uid();
    S.products.push(o);
  }
  
  save();
  $("dlg").close();
  render();
}

function delP(id) {
  S.products = S.products.filter(x => x.id !== id);
  save();
  $("dlg").close();
  render();
}

function vSell() {
  let h = '<h1>Vendre</h1><p class="sub">Touchez + pour ajouter au panier.</p>';
  let tot = 0, n = 0;
  
  if (!S.products.length) {
    return h + '<div class="empty">Ajoutez des produits dans l’onglet Stock avant de vendre.</div>';
  }
  
  const productsWithCart = S.products.map(p => {
    const q = cart[p.id] || 0;
    tot += q * p.sell;
    n += q;
    return { p, q };
  });
  
  h += productsWithCart.map(function({ p, q }) {
    return '<div class="panel row"><div><b>' + esc(p.name) + '</b><div class="mute">' + f(p.sell) + ' · ' + p.qty + ' en stock</div></div><div class="qty"><button class="ghost" onclick="adj(\'' + p.id + '\',-1)">−</button><b>' + q + '</b><button onclick="adj(\'' + p.id + '\',1)">+</button></div></div>';
  }).join("");
  
  if (n) {
    h += '<div class="bar"><button onclick="confirmSell()">Valider la vente · ' + f(tot) + '</button></div>';
  }
  
  return h;
}

function confirmSell() {
  if (!confirm('Valider cette vente ?')) return;
  sell();
}

function adj(id, d) {
  const p = S.products.find(x => x.id === id);
  let q = (cart[id] || 0) + d;
  if (q < 0) q = 0;
  if (q > p.qty) q = p.qty;
  if (q) cart[id] = q;
  else delete cart[id];
  render();
}

function sell() {
  const items = [];
  let tot = 0;
  
  S.products.forEach(function(p) {
    const q = cart[p.id];
    if (q) {
      items.push({ id: p.id, name: p.name, q: q, p: p.sell, b: p.buy });
      p.qty -= q;
      tot += q * p.sell;
    }
  });
  
  S.sales.unshift({ id: uid(), t: Date.now(), items: items, total: tot });
  cart = {};
  save();
  go("home");
  msg("Vente enregistrée !");
}

function vHistory() {
  const itemsPerPage = 20;
  const allSales = S.sales.filter(s => {
    if (!rd) return true;
    return ymd(new Date(s.t)) === rd;
  }).reverse();
  const paginatedSales = allSales.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);
  const totalPages = Math.ceil(allSales.length / itemsPerPage);
  
  let h = '<h1>Historique</h1><p class="sub">Les ventes les plus récentes d’abord.</p>';
  h += '<div class="panel"><label style="margin-top:0">Rapport journalier</label><div class="row"><input type="date" value="' + rd + '" onchange="rd=this.value;currentPage=0;render()"><button onclick="dl(rd)">Télécharger</button></div></div>';
  
  if (!allSales.length) {
    return h + '<div class="empty">Aucune vente enregistrée.</div>';
  }
  
  h += paginatedSales.map(function(s) {
    return '<div class="panel"><div class="row"><b>' + f(s.total) + '</b><span class="mute">' + new Date(s.t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + '</span></div><div class="mute">' + s.items.map(function(i) { return i.q + " × " + esc(i.name); }).join(", ") + '</div></div>';
  }).join("");
  
  if (totalPages > 1) {
    h += '<div class="pagination"><button onclick="prevPage()" ' + (currentPage === 0 ? 'disabled' : '') + '>Précédent</button><span>Page ' + (currentPage + 1) + ' / ' + totalPages + '</span><button onclick="nextPage()" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>Suivant</button></div>';
  }
  
  return h;
}

function prevPage() {
  if (currentPage > 0) {
    currentPage--;
    render();
  }
}

function nextPage() {
  const itemsPerPage = 20;
  const allSales = S.sales.filter(s => {
    if (!rd) return true;
    return ymd(new Date(s.t)) === rd;
  });
  const totalPages = Math.ceil(allSales.length / itemsPerPage);
  if (currentPage < totalPages - 1) {
    currentPage++;
    render();
  }
}

function vStats() {
  const productStats = S.products.map(p => {
    const sales = S.sales.flatMap(s => s.items).filter(i => i.id === p.id);
    const totalSold = sales.reduce((sum, s) => sum + s.q, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.p * s.q, 0);
    const totalProfit = sales.reduce((sum, s) => sum + (s.p - s.b) * s.q, 0);
    return { ...p, totalSold, totalRevenue, totalProfit };
  }).sort((a, b) => b.totalProfit - a.totalProfit);
  
  let h = '<h1>Statistiques</h1><p class="sub">Produits les plus rentables.</p>';
  
  if (productStats.length === 0) {
    return h + '<div class="empty">Aucun produit avec des ventes.</div>';
  }
  
  h += '<div class="stats-grid">';
  h += productStats.map(p => `
    <div class="panel row">
      <div>
        <b>${esc(p.name)}</b>
        <div class="mute">Vendu: ${p.totalSold} × ${f(p.sell)}</div>
      </div>
      <div>
        <div class="ok">${f(p.totalProfit)}</div>
        <div class="mute">Bénéfice</div>
      </div>
    </div>
  `).join('');
  h += '</div>';
  
  // Total général
  const totalRevenue = productStats.reduce((sum, p) => sum + p.totalRevenue, 0);
  const totalProfit = productStats.reduce((sum, p) => sum + p.totalProfit, 0);
  const totalSold = productStats.reduce((sum, p) => sum + p.totalSold, 0);
  
  h += '<div class="panel" style="margin-top: 16px;">';
  h += '<div class="row"><b>Total général</b><b>' + f(totalRevenue) + '</b></div>';
  h += '<div class="row mute"><span>Ventes totales</span><span>' + totalSold + ' unités</span></div>';
  h += '<div class="row"><span class="ok">Bénéfice total</span><span class="ok">' + f(totalProfit) + '</span></div>';
  h += '</div>';
  
  return h;
}

function vCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDay = firstDay.getDay();
  
  let h = '<h1>Calendrier</h1><p class="sub">' + firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) + '</p>';
  h += '<div class="calendar-grid">';
  
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  h += weekDays.map(d => '<div class="calendar-header">' + d + '</div>').join('');
  
  for (let i = 0; i < startingDay; i++) {
    h += '<div class="calendar-empty"></div>';
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = ymd(date);
    const sales = S.sales.filter(s => ymd(new Date(s.t)) === dateStr);
    const total = sales.reduce((sum, s) => sum + s.total, 0);
    
    h += '<div class="calendar-day" onclick="rd=\'' + dateStr + '\';currentPage=0;go(\'history\')">';
    h += '<div class="day-number">' + day + '</div>';
    if (total > 0) {
      h += '<div class="day-total">' + f(total) + '</div>';
    }
    h += '</div>';
  }
  
  h += '</div>';
  return h;
}

function vSec() {
  let h = '<h1>Sécurité</h1><p class="sub">Vos données sont chiffrées (AES-256-GCM) sur cet appareil. Toute modification extérieure est détectée.</p>';
  
  h += '<div class="panel row"><div><b>Verrouiller</b><div class="mute">Verrouillage auto après 2 min d’inactivité</div></div><button onclick="lock()">Verrouiller</button></div>';
  
  h += '<div class="panel row"><div><b>Sauvegarde chiffrée</b><div class="mute">Fichier protégé par votre code actuel</div></div><button onclick="backup()">Exporter</button></div>';
  
  h += '<div class="panel row"><div><b>Sauvegarde JSON</b><div class="mute">Export des données brutes</div></div><button onclick="exportData()">Exporter</button></div>';
  
  h += '<div class="panel row"><div><b>Restaurer</b><div class="mute">Remplace les données actuelles</div></div><button class="ghost" onclick="restoreDlg()">Importer</button></div>';
  
  h += '<div class="panel row"><div><b>Code d’accès</b><div class="mute">Changer le code à 6 chiffres</div></div><button class="ghost" onclick="pinDlg()">Modifier</button></div>';
  
  h += '<div class="panel row"><div><b>Supprimer le code PIN</b><div class="mute">Accès sans code (dangereux)</div></div><button class="ghost bad" onclick="confirmRemovePin()">Supprimer</button></div>';
  
  return h;
}

function vContact() {
  return '<div class="contact-panel">' +
    '<h1>Contact</h1>' +
    '<p class="sub">Besoin d’aide ou des suggestions pour améliorer SmartGest ?</p>' +
    '<p style="margin: 20px 0;">Contactez le développeur directement via WhatsApp.</p>' +
    '<a href="https://wa.me/' + WHATSAPP_NUMBER.replace('+', '') + '" class="whatsapp-btn">Contacter sur WhatsApp</a>' +
    '<div class="panel" style="margin-top: 20px;"> ' +
    '<div class="mute">Numéro :</div>' +
    '<b>' + WHATSAPP_NUMBER + '</b>' +
    '</div>' +
    '<p class="mute" style="margin-top: 20px; font-size: 12px;">Réponse garantie sous 24h (jours ouvrés).</p>' +
    '</div>';
}

// ========== BACKUP/RESTORE ==========
async function backup() {
  const A = lsGet(KA);
  const b = await seal(K, S);
  const file = JSON.stringify({ app: 'smartgest', v: 2, salt: A.salt, iv: b.iv, ct: b.ct });
  
  try {
    const d = await getDl();
    if (!d) { msg('Sauvegarde indisponible ici.'); return; }
    await d.save({ filename: 'smartgest-sauvegarde-' + ymd(new Date()) + '.json', data: file });
    msg('Sauvegarde enregistrée.');
  } catch (e) {
    if (!e || e.code !== 'declined') msg("La sauvegarde a échoué.");
  }
}

function restoreDlg() {
  $('dlg').innerHTML = '<h2 style="margin-top:0">Restaurer une sauvegarde</h2>' +
    '<label>Fichier de sauvegarde (.json)</label>' +
    '<input id="rf" type="file" accept=".json,application/json">' +
    '<label>Code utilisé lors de la sauvegarde</label>' +
    '<input id="rp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6">' +
    '<div id="rerr" class="bad" style="min-height:22px;margin:8px 0"></div>' +
    '<div class="row">' +
    '<button class="ghost" onclick="$(\'dlg\').close()">Annuler</button>' +
    '<button onclick="doRestore()">Remplacer mes données</button>' +
    '</div>';
  $('dlg').showModal();
}

async function doRestore() {
  const f = $('rf').files[0];
  const p = $('rp').value;
  const e = $('rerr');
  
  if (!f || !/^\d{6}$/.test(p)) {
    e.textContent = 'Choisissez un fichier et entrez le code à 6 chiffres.';
    return;
  }
  
  try {
    const o = JSON.parse(await f.text());
    if (o.app !== 'smartgest' || !o.salt || !o.iv || !o.ct) throw 0;
    const d = await derive(p, ub(o.salt));
    const data = await unseal(d.key, o);
    if (!Array.isArray(data.products) || !Array.isArray(data.sales)) throw 0;
    
    S = data;
    save();
    $('dlg').close();
    render();
    msg('Sauvegarde restaurée.');
  } catch (x) {
    e.textContent = 'Fichier invalide, modifié, ou code incorrect.';
  }
}

// ========== EXPORT DATA ==========
async function exportData() {
  const data = {
    version: 2,
    date: new Date().toISOString(),
    products: S.products,
    sales: S.sales
  };
  const json = JSON.stringify(data, null, 2);
  
  try {
    const d = await getDl();
    if (!d) { msg("Export indisponible."); return; }
    await d.save({
      filename: 'smartgest-export-' + ymd(new Date()) + '.json',
      data: json
    });
    msg("Données exportées.");
  } catch (e) {
    msg("Erreur : " + e.message);
  }
}

// ========== PIN CHANGE ==========
function pinDlg() {
  $('dlg').innerHTML = '<h2 style="margin-top:0">Changer le code</h2>' +
    '<label>Code actuel</label>' +
    '<input id="c0" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6">' +
    '<label>Nouveau code</label>' +
    '<input id="c1" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6">' +
    '<label>Confirmer le nouveau code</label>' +
    '<input id="c2" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6">' +
    '<div id="perr" class="bad" style="min-height:22px;margin:8px 0"></div>' +
    '<div class="row">' +
    '<button class="ghost" onclick="$(\'dlg\').close()">Annuler</button>' +
    '<button onclick="doPin()">Enregistrer</button>' +
    '</div>';
  $('dlg').showModal();
}

async function doPin() {
  const c = $('c0').value;
  const a = $('c1').value;
  const b = $('c2').value;
  const e = $('perr');
  const A = lsGet(KA);
  
  if (!/^\d{6}$/.test(c) || !/^\d{6}$/.test(a) || a !== b) {
    e.textContent = 'Les codes doivent avoir 6 chiffres, et le nouveau code être identique dans les deux champs.';
    return;
  }
  
  if (weak(a)) {
    e.textContent = 'Code trop simple. Évitez 111111, 123456, etc.';
    return;
  }
  
  const d0 = await derive(c, ub(A.salt));
  if (d0.ver !== A.ver) {
    e.textContent = 'Code actuel incorrect.';
    return;
  }
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const d = await derive(a, salt);
  await q;
  const blob = await seal(d.key, S);
  
  if (!lsSet(KD, blob)) {
    e.textContent = 'Stockage plein : code non modifié.';
    return;
  }
  
  lsSet(KA, { salt: b64(salt), ver: d.ver, fails: 0, until: 0 });
  K = d.key;
  
  try { localStorage.removeItem(KD + '.prev'); } catch (x) {}
  
  $('dlg').close();
  msg('Code modifié. Les anciennes sauvegardes gardent l’ancien code.');
}


// ========== REMOVE PIN ==========
function confirmRemovePin() {
  if (confirm('ATTENTION : Cela supprimera le code PIN et vos données seront accessibles SANS protection. \n\nVoulez-vous vraiment continuer ?')) {
    removePinDlg();
  }
}

function removePinDlg() {
  $('dlg').innerHTML = '<h2 style="margin-top:0">Supprimer le code PIN</h2>' +
    '<p class="bad" style="margin-bottom:15px">⚠️ Cette action supprimera la protection par code PIN. Vos données seront accessibles sans restriction.</p>' +
    '<label>Code PIN actuel (pour confirmation)</label>' +
    '<input id="rpin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6">' +
    '<div id="rperr" class="bad" style="min-height:22px;margin:8px 0"></div>' +
    '<div class="row">' +
    '<button class="ghost" onclick="$('dlg').close()">Annuler</button>' +
    '<button class="bad" onclick="doRemovePin()">Supprimer le code</button>' +
    '</div>';
  $('dlg').showModal();
}

async function doRemovePin() {
  const pin = $('rpin').value;
  const err = $('rperr');
  const A = lsGet(KA);
  
  if (!/^\d{6}$/.test(pin)) {
    err.textContent = 'Le code doit contenir 6 chiffres.';
    return;
  }
  
  busy(true);
  try {
    const d = await derive(pin, ub(A.salt));
    if (d.ver !== A.ver) {
      err.textContent = 'Code PIN incorrect.';
      busy(false);
      return;
    }
    
    // Déchiffrer les données et les sauvegarder en clair
    const raw = lsGet(KD);
    let data = null;
    
    if (raw) {
      try {
        data = await unseal(d.key, raw);
      } catch (e) {
        try {
          data = await unseal(d.key, lsGet(KD + '.prev'));
        } catch (e2) {
          err.textContent = 'Impossible de déchiffrer les données.';
          busy(false);
          return;
        }
      }
    }
    
    if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
      data = { products: [], sales: [] };
    }
    
    // Sauvegarder les données en clair dans OLD
    try {
      localStorage.setItem(OLD, JSON.stringify(data));
    } catch (e) {
      err.textContent = 'Erreur lors de la sauvegarde des données.';
      busy(false);
      return;
    }
    
    // Supprimer les données chiffrées et l'authentification
    localStorage.removeItem(KD);
    localStorage.removeItem(KD + '.prev');
    localStorage.removeItem(KA);
    localStorage.removeItem(KD + '.corrupt');
    
    // Réinitialiser l'état
    K = null;
    S = data;
    
    $('dlg').close();
    busy(false);
    startIdle();
    render();
    msg('Code PIN supprimé. Vos données sont maintenant accessibles sans protection.');
  } catch (e) {
    err.textContent = 'Erreur : ' + e.message;
    busy(false);
  }
}

// ========== REPORT ==========
function cc(v) {
  v = String(v);
  return /[;"?\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

async function dl(day) {
  if (!day) { msg("Choisissez une date."); return; }
  
  const list = S.sales.filter(s => ymd(new Date(s.t)) === day).reverse();
  if (!list.length) { msg("Aucune vente à cette date."); return; }
  
  let rev = 0, gain = 0;
  const rows = [
    ["Rapport journalier SmartGest", day],
    [],
    ["Heure", "Produit", "Quantité", "Prix unitaire", "Total", "Bénéfice"]
  ];
  
  list.forEach(function(s) {
    const h = new Date(s.t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    s.items.forEach(function(i) {
      const g = (i.p - i.b) * i.q;
      rev += i.p * i.q;
      gain += g;
      rows.push([h, i.name, i.q, i.p, i.p * i.q, g]);
    });
  });
  
  rows.push(
    [],
    ["Nombre de ventes", list.length],
    ["Chiffre d’affaires", rev],
    ["Bénéfice", gain],
    [],
    ["Produits à réapprovisionner"]
  );
  
  S.products.filter(p => p.qty <= p.min).forEach(function(p) {
    rows.push([p.name, p.qty]);
  });
  
  const csv = "\ufeff" + rows.map(r => r.map(cc).join(";")).join("\r\n");
  
  try {
    const d = await getDl();
    if (!d) { msg("Téléchargement indisponible ici."); return; }
    await d.save({ filename: "smartgest-rapport-" + day + ".csv", data: csv });
    msg("Rapport enregistré.");
  } catch (e) {
    if (!e || e.code !== "declined") msg("Le rapport n’a pas pu être enregistré.");
  }
}

// ========== DOWNLOAD HELPER ==========
async function getDl() {
  const P = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins;
  if (P && P.Filesystem && P.Share) {
    return {
      save: async function(o) {
        const r = await P.Filesystem.writeFile({ path: o.filename, data: o.data, directory: 'CACHE', encoding: 'utf8' });
        await P.Share.share({ title: o.filename, url: r.uri });
      }
    };
  }
  return window.claude && await window.claude.use('downloads');
}

// ========== LERRO ==========
function lerr(m) {
  const e = $('lerr');
  if (e) e.textContent = m;
}

// ========== INIT ==========
init();
