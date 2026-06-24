let entries = JSON.parse(localStorage.getItem('contapp_entries')) || [];
let nextId  = entries.length > 0 ? Math.max(...entries.map(e => e.id)) + 1 : 1;

// ── UTILERÍAS GLOBALES ──────────────────────────────────
function save() { localStorage.setItem('contapp_entries', JSON.stringify(entries)); }
function fmt(n) { return n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m])); }
function numCell(v, cls) { return v === 0 ? `<span class="num-zero">—</span>` : `<span class="${cls}">${fmt(v)}</span>`; }

// ── CÁLCULOS ────────────────────────────────────────────
function getTotals() {
  let ventasCredit=0, devVD=0, descVD=0;
  let comprasDebit=0, gastosD=0, devCC=0, descCC=0, invNet=0;
  for (const e of entries) {
    const a = e.account.trim().toLowerCase();
    if (a==="ventas") ventasCredit += e.credit;
    else if (a==="devoluciones s/ventas") devVD += e.debit;
    else if (a==="descuentos s/ventas") descVD += e.debit;
    else if (a==="compras") comprasDebit += e.debit;
    else if (a==="gastos de compra") gastosD += e.debit;
    else if (a==="devoluciones s/compras") devCC += e.credit;
    else if (a==="descuentos s/compras") descCC += e.credit;
    else if (a==="inventario") invNet += (e.debit - e.credit);
  }
  return { ventasCredit, devVD, descVD, comprasDebit, gastosD, devCC, descCC, inventarioInicial: Math.max(0, invNet) };
}

function calcAll() {
  const t = getTotals();
  const ventasNetas = t.ventasCredit - (t.devVD + t.descVD);
  const comprasBrutas = t.comprasDebit + t.gastosD;
  const comprasNetas = Math.max(0, comprasBrutas - (t.devCC + t.descCC));
  const totalMercancia = t.inventarioInicial + comprasNetas;
  let invFinal = parseFloat(document.getElementById('inventarioFinal')?.value) || 0;
  const costoVendido = totalMercancia - invFinal;
  const utilidadBruta = ventasNetas - costoVendido;
  return { ...t, ventasNetas, comprasBrutas, comprasNetas, totalMercancia, invFinal, costoVendido, utilidadBruta };
}

// ── RENDERIZADOS (Protegidos por página) ─────────────────
function updateKPIs() {
  const kpiAsientos = document.getElementById('kpiAsientos');
  if (!kpiAsientos) return; // Si no hay KPIs en la página actual, ignora esta función

  let debe=0, haber=0;
  for (const e of entries) { debe += e.debit; haber += e.credit; }

  setText('kpiAsientos', entries.length);
  setText('kpiDebe',  fmt(debe));
  setText('kpiHaber', fmt(haber));

  const fill = document.getElementById('balanceFill');
  const status = document.getElementById('balanceStatus');
  const warn = document.getElementById('balanceWarning');

  if (entries.length === 0) {
    if(fill) { fill.style.width='0%'; fill.classList.remove('bad'); }
    if(status) { status.textContent='Sin datos'; status.classList.remove('bad'); }
    if(warn) warn.style.display='none';
    return;
  }
  
  const diff = Math.abs(debe - haber);
  const balanced = diff <= 0.01;
  
  if(fill) {
    fill.style.width = balanced ? '100%' : `${Math.min(99,(Math.min(debe,haber)/Math.max(debe,haber))*100).toFixed(1)}%`;
    fill.classList.toggle('bad', !balanced);
  }
  if(status) {
    status.classList.toggle('bad', !balanced);
    status.textContent = balanced ? `✓ Balanceado` : `Δ ${fmt(diff)}`;
  }
  if(warn) {
    if (!balanced) {
      warn.style.display='block';
      warn.innerHTML=`⚠ <strong>Desbalance:</strong> Debe ${fmt(debe)} ≠ Haber ${fmt(haber)} · Diferencia: <strong>${fmt(diff)}</strong>`;
    } else {
      warn.style.display='none';
    }
  }
}

function renderDiario() {
  const tbody = document.getElementById('entriesTbody');
  if (!tbody) return; // Salir si no estamos en libros.html
  
  const foot = document.getElementById('tableFoot');
  const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Sin asientos. Agrega líneas o carga el ejemplo.</td></tr>`;
    foot.innerHTML = ''; setText('searchCount',''); return;
  }

  let html='', tDebe=0, tHaber=0, visible=0;
  entries.forEach((e, idx) => {
    tDebe += e.debit; tHaber += e.credit;
    const match = !search || e.account.toLowerCase().includes(search);
    if (match) visible++;
    html += `<tr class="${match ? '' : 'hidden-row'}" style="${match?'':'display:none;'}">
      <td style="color:var(--text-muted);font-size:0.73rem;">${idx+1}</td>
      <td><span class="account-badge">${escapeHtml(e.account)}</span></td>
      <td>${numCell(e.debit,  'num-debit')}</td>
      <td>${numCell(e.credit, 'num-credit')}</td>
      <td><button class="delete-entry-btn" data-id="${e.id}">✕</button></td>
    </tr>`;
  });
  tbody.innerHTML = html;
  foot.innerHTML = `<tr>
    <td colspan="2">Totales (${entries.length} asientos)</td>
    <td><span class="num-debit">${fmt(tDebe)}</span></td>
    <td><span class="num-credit">${fmt(tHaber)}</span></td>
    <td></td>
  </tr>`;
  setText('searchCount', search ? `${visible} de ${entries.length}` : '');
}

function renderMayor() {
  const tbody = document.getElementById('summaryBody');
  if (!tbody) return; // Salir si no estamos en libros.html
  
  const TARGET = ["Ventas","Devoluciones s/ventas","Descuentos s/ventas","Compras","Gastos de compra","Devoluciones s/compras","Descuentos s/compras","Inventario"];
  const map = {};
  TARGET.forEach(a => map[a.toLowerCase()] = { name: a, d: 0, c: 0 });
  for (const e of entries) {
    const k = e.account.trim().toLowerCase();
    if (map[k]) { map[k].d += e.debit; map[k].c += e.credit; }
  }
  let html = '';
  for (const k in map) {
    const { name, d, c } = map[k];
    const net = d - c;
    html += `<tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;">${name}</td>
      <td style="text-align:right;">${d>0?`<span class="num-debit">${fmt(d)}</span>`:'<span class="num-zero">—</span>'}</td>
      <td style="text-align:right;">${c>0?`<span class="num-credit">${fmt(c)}</span>`:'<span class="num-zero">—</span>'}</td>
      <td style="text-align:right;"><span class="${net>0?'num-pos':net<0?'num-neg':'num-zero'}">${fmt(net)}</span></td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

function renderAnalisis() {
  if (!document.getElementById('ventasBrutas')) return; // Salir si no estamos en movimientos.html
  
  const c = calcAll();
  setText('ventasBrutas', fmt(c.ventasCredit));
  setText('devVentas', fmt(c.devVD));
  setText('descVentas', fmt(c.descVD));
  setText('ventasNetas', fmt(c.ventasNetas));
  setText('comprasBrutas', fmt(c.comprasBrutas));
  setText('gastosCompra', fmt(c.gastosD));
  setText('devCompras', fmt(c.devCC));
  setText('descCompras', fmt(c.descCC));
  setText('comprasNetas', fmt(c.comprasNetas));
  setText('comprasNetasB', fmt(c.comprasNetas));
  setText('inventarioInicial', fmt(c.inventarioInicial));
  setText('totalMercancia', fmt(c.totalMercancia));
  setText('costoVendido', fmt(c.costoVendido));
  setText('utilidadBruta', fmt(c.utilidadBruta));
  
  const box = document.getElementById('utilidadBox');
  if (box) box.classList.toggle('perdida', c.utilidadBruta < 0);
}

function renderBalanza() {
  const body = document.getElementById('balanzaBody');
  if (!body) return; // Salir si no estamos en cuentas.html
  
  const foot = document.getElementById('balanzaFoot');
  const badge = document.getElementById('balanzaBadge');

  const map = {};
  for (const e of entries) {
    const k = e.account.trim();
    if (!map[k]) map[k] = { d:0, c:0 };
    map[k].d += e.debit;
    map[k].c += e.credit;
  }

  if (Object.keys(map).length === 0) {
    body.innerHTML=`<tr><td colspan="5" class="empty-state">Sin datos aún.</td></tr>`;
    if(foot) foot.innerHTML=''; 
    if(badge) badge.innerHTML=''; 
    return;
  }

  let html='', sumD=0, sumC=0, sumSD=0, sumSC=0;
  for (const name in map) {
    const { d, c } = map[name];
    const net = d - c;
    const sd = net > 0 ? net : 0;
    const sc = net < 0 ? Math.abs(net) : 0;
    sumD+=d; sumC+=c; sumSD+=sd; sumSC+=sc;
    html += `<tr>
      <td><span class="account-badge">${escapeHtml(name)}</span></td>
      <td>${numCell(d,'num-debit')}</td>
      <td>${numCell(c,'num-credit')}</td>
      <td>${sd>0?`<span class="num-pos" style="color:var(--debit-color)">${fmt(sd)}</span>`:'<span class="num-zero">—</span>'}</td>
      <td>${sc>0?`<span class="num-neg" style="color:var(--red)">${fmt(sc)}</span>`:'<span class="num-zero">—</span>'}</td>
    </tr>`;
  }
  body.innerHTML = html;

  const balanced = Math.abs(sumD-sumC) <= 0.01 && Math.abs(sumSD-sumSC) <= 0.01;
  if(foot) foot.innerHTML = `<tr class="balanza-equal-row" style="background:var(--accent-dim); color:var(--accent); font-weight:bold;">
    <td>TOTALES</td><td>${fmt(sumD)}</td><td>${fmt(sumC)}</td><td>${fmt(sumSD)}</td><td>${fmt(sumSC)}</td>
  </tr>`;

  if (badge) {
    badge.innerHTML = balanced
      ? `<span class="balanza-ok-badge" style="background:var(--debit-color);color:#000;padding:2px 6px;border-radius:4px;font-size:0.7rem;">✓ Cuadrada</span>`
      : `<span class="balanza-fail-badge" style="background:var(--red);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem;">✗ Descuadrada</span>`;
  }
}

function renderEstado() {
  if (!document.getElementById('estadoDoc')) return; // Salir si no estamos en resultados.html
  
  const c = calcAll();
  const emp = document.getElementById('empresaNombre')?.value || 'Mi Empresa S.A.';
  const per = document.getElementById('empresaPeriodo')?.value || '';
  setText('erEmpresa', emp);
  setText('erPeriodo', per);

  setText('er-ventasBrutas', fmt(c.ventasCredit));
  setText('er-devVentas', fmt(c.devVD));
  setText('er-descVentas', fmt(c.descVD));
  setText('er-ventasNetas', fmt(c.ventasNetas));
  setText('er-invInicial', fmt(c.inventarioInicial));
  setText('er-comprasBrutas', fmt(c.ventasCredit===0&&c.comprasDebit===0 ? 0 : c.comprasDebit));
  setText('er-gastosCompra', fmt(c.gastosD));
  setText('er-devCompras', fmt(c.devCC));
  setText('er-descCompras', fmt(c.descCC));
  setText('er-comprasNetas', fmt(c.comprasNetas));
  setText('er-totalMercancia', fmt(c.totalMercancia));
  setText('er-invFinal', fmt(c.invFinal));
  setText('er-costoVendido', fmt(c.costoVendido));
  setText('er-utilidadBruta', fmt(c.utilidadBruta));

  const line = document.getElementById('er-utilidadLine');
  if (line) {
    line.classList.toggle('perdida-estilo', c.utilidadBruta < 0);
    const span = line.querySelector('span:first-child');
    if(span) span.textContent = c.utilidadBruta >= 0 ? 'UTILIDAD BRUTA' : 'PÉRDIDA BRUTA';
  }
}

// ── CRUD Y GESTIÓN DE ESTADO ─────────────────────────────
function addEntry(account, amount, type) {
  if (!account?.trim()) { alert('Indica el nombre de la cuenta.'); return false; }
  if (isNaN(amount) || amount <= 0) { alert('El monto debe ser mayor a cero.'); return false; }
  entries.push({
    id: nextId++, account: account.trim(),
    debit:  type==='debe'  ? amount : 0,
    credit: type==='haber' ? amount : 0
  });
  save(); return true;
}

function deleteEntry(id) {
  entries = entries.filter(e => e.id !== id);
  save(); refreshAll();
}

function loadSample() {
  const sample = [
    {account:"Caja",debit:200000,credit:0}, {account:"Inventario",debit:800000,credit:0},
    {account:"Capital",debit:0,credit:1000000}, {account:"Caja",debit:490000,credit:0},
    {account:"Clientes",debit:210000,credit:0}, {account:"Ventas",debit:0,credit:700000},
    {account:"Devoluciones s/ventas",debit:50000,credit:0}, {account:"Clientes",debit:0,credit:50000},
    {account:"Descuentos s/ventas",debit:25000,credit:0}, {account:"Clientes",debit:0,credit:25000},
    {account:"Compras",debit:350000,credit:0}, {account:"Proveedores",debit:0,credit:350000},
    {account:"Gastos de compra",debit:20000,credit:0}, {account:"Caja",debit:0,credit:20000},
    {account:"Proveedores",debit:60000,credit:0}, {account:"Devoluciones s/compras",debit:0,credit:60000},
    {account:"Proveedores",debit:4000,credit:0}, {account:"Descuentos s/compras",debit:0,credit:4000},
    {account:"Gasto alquiler",debit:15000,credit:0}, {account:"Caja",debit:0,credit:15000},
    {account:"Caja",debit:100000,credit:0}, {account:"Préstamo bancario",debit:0,credit:100000}
  ];
  entries = sample.map((x,i) => ({id:i+1,...x}));
  nextId = entries.length+1;
  save(); refreshAll();
}

function refreshAll() {
  updateKPIs();
  renderDiario();
  renderMayor();
  renderAnalisis();
  renderBalanza();
  renderEstado();
}

// ── EVENTOS GLOBALES E INICIALIZACIÓN ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  
  // Carga inicial
  if (entries.length === 0 && document.getElementById('entriesTbody')) {
    loadSample();
  } else {
    refreshAll();
  }

  // Eventos EXCLUSIVOS para "libros.html"
  const addBtn = document.getElementById('addEntryBtn');
  if (addBtn) {
    const accInput = document.getElementById('accountName');
    const amtInput = document.getElementById('amount');
    const typeSelect = document.getElementById('entryType');
    
    addBtn.addEventListener('click', () => {
      if (addEntry(accInput.value, parseFloat(amtInput.value), typeSelect.value)) {
        accInput.value=''; amtInput.value='';
        accInput.focus(); refreshAll();
      }
    });

    [accInput, amtInput].forEach(f => {
      if(f) f.addEventListener('keypress', e => { if(e.key==='Enter'){e.preventDefault();addBtn.click();} });
    });
  }

  const tbody = document.getElementById('entriesTbody');
  if (tbody) {
    tbody.addEventListener('click', e => {
      if (e.target?.classList.contains('delete-entry-btn')) {
        deleteEntry(parseInt(e.target.dataset.id));
      }
    });
  }

  const searchInp = document.getElementById('searchInput');
  if (searchInp) searchInp.addEventListener('input', renderDiario);

  document.getElementById('loadExampleBtn')?.addEventListener('click', () => {
    if(confirm('¿Cargar el ejemplo de referencia? Se reemplazarán los datos actuales.')) loadSample();
  });
  
  document.getElementById('clearAllBtn')?.addEventListener('click', () => {
    if(confirm('¿Eliminar todos los asientos?')) { entries=[]; nextId=1; save(); refreshAll(); }
  });

  // Eventos EXCLUSIVOS para "movimientos.html"
  const invFinal = document.getElementById('inventarioFinal');
  if (invFinal) invFinal.addEventListener('input', renderAnalisis);

  // Eventos EXCLUSIVOS para "resultados.html"
  const empNombre = document.getElementById('empresaNombre');
  const empPeriodo = document.getElementById('empresaPeriodo');
  if (empNombre) empNombre.addEventListener('input', renderEstado);
  if (empPeriodo) empPeriodo.addEventListener('input', renderEstado);

  // Botones de impresión (funcionan en cualquier página que los tenga)
  document.getElementById('printDiarioBtn')?.addEventListener('click', () => window.print());
  document.getElementById('printBalanzaBtn')?.addEventListener('click', () => window.print());
  document.getElementById('printEstadoBtn')?.addEventListener('click', () => window.print());
});
