let currentTransactions = [];

function formatAmount(amount, type) {
  const val = Number(amount).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${type === 'income' ? '+' : '-'} € ${val}`;
}

function formatDateNote(dateStr, source) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = isToday ? 'Hoje' : d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  return `${dateFormatted}, ${time} · ${source || 'Manual'}`;
}

function getIcon(kind) {
  return kind === 'income' ? '↗' : '▧';
}

function money(value) {
  return `€ ${Number(value || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
}

function row(t) {
  const formattedAmount = formatAmount(t.amount, t.kind);
  const note = formatDateNote(t.occurredOn, t.source);
  const icon = getIcon(t.kind);
  return `<div class="transaction-row ${t.kind}" data-id="${t.id}">
    <div class="category-icon">${icon}</div>
    <div><strong>${t.description}</strong><small>${note}</small></div>
    <span>${t.category || 'Outros'}</span>
    <span class="status">Confirmado</span>
    <b class="amount ${t.kind}">${formattedAmount}</b>
    <div class="tx-actions">
      <button class="tx-menu-btn" data-txid="${t.id}" title="Opções">⋮</button>
      <div class="tx-menu" id="menu-${t.id}">
        <button class="tx-view" data-txid="${t.id}">👁 Ver detalhes</button>
        <button class="tx-edit" data-txid="${t.id}">✏️ Editar</button>
        <button class="tx-delete danger" data-txid="${t.id}">🗑 Excluir</button>
      </div>
    </div>
  </div>`;
}

// Fecha menus abertos ao clicar fora (event delegation no document)
document.addEventListener('click', (e) => {
  const menuBtn = e.target.closest('.tx-menu-btn');
  const txMenu = e.target.closest('.tx-menu');

  if (menuBtn) {
    const menu = menuBtn.closest('.tx-actions')?.querySelector('.tx-menu');
    const isOpen = menu?.classList.contains('open');
    document.querySelectorAll('.tx-menu.open').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu?.classList.add('open');
    return;
  }

  if (e.target.closest('.tx-view')) {
    const id = e.target.closest('.tx-view').dataset.txid;
    viewTransaction(id);
    document.querySelectorAll('.tx-menu.open').forEach(m => m.classList.remove('open'));
    return;
  }

  if (e.target.closest('.tx-edit')) {
    const id = e.target.closest('.tx-edit').dataset.txid;
    openEditModal(id);
    return;
  }

  if (e.target.closest('.tx-delete')) {
    const id = e.target.closest('.tx-delete').dataset.txid;
    confirmDelete(id);
    return;
  }

  // Clique fora — fecha todos os menus
  if (!txMenu) {
    document.querySelectorAll('.tx-menu.open').forEach(m => m.classList.remove('open'));
  }
});

function viewTransaction(id) {
  const t = currentTransactions.find(tx => tx.id === id);
  if (!t) return;
  const amount = formatAmount(t.amount, t.kind);
  const date = new Date(t.occurredOn).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
  showToast(`${t.description} · ${amount} · ${t.category} · ${date}`);
}

function openEditModal(id) {
  const t = currentTransactions.find(tx => tx.id === id);
  if (!t) return;
  document.getElementById('edit-tx-id').value = t.id;
  document.getElementById('edit-description').value = t.description;
  document.getElementById('edit-amount').value = t.amount;
  document.getElementById('edit-type').value = t.kind;
  document.getElementById('edit-category').value = t.category || 'Outros';
  document.getElementById('edit-modal').classList.add('show');
  document.querySelectorAll('.tx-menu.open').forEach(m => m.classList.remove('open'));
}

async function confirmDelete(id) {
  document.querySelectorAll('.tx-menu.open').forEach(m => m.classList.remove('open'));
  if (!confirm('Tem a certeza que quer excluir este lançamento?')) return;
  try {
    await ApiService.deleteTransaction(id);
    await loadAllData();
    showToast('Lançamento excluído com sucesso.');
  } catch (err) {
    showToast('Erro ao excluir lançamento.');
  }
}

document.getElementById('close-edit-modal')?.addEventListener('click', () => {
  document.getElementById('edit-modal').classList.remove('show');
});
document.getElementById('edit-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal')) document.getElementById('edit-modal').classList.remove('show');
});

document.getElementById('edit-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('edit-tx-id').value;
  const updates = {
    description: document.getElementById('edit-description').value,
    amount: parseFloat(document.getElementById('edit-amount').value),
    kind: document.getElementById('edit-type').value,
    category: document.getElementById('edit-category').value
  };
  try {
    await ApiService.updateTransaction(id, updates);
    await loadAllData();
    document.getElementById('edit-modal').classList.remove('show');
    showToast('Lançamento atualizado com sucesso.');
  } catch (err) {
    showToast('Erro ao atualizar lançamento.');
  }
});

async function renderDashboard() {
  try {
    const [dash, txs] = await Promise.all([ApiService.getDashboard(), ApiService.getTransactions()]);
    const cards = document.querySelectorAll('.metric-card');
    if (cards[0]) {
      cards[0].querySelector('strong').textContent = money(dash.savings);
      cards[0].querySelector('p').innerHTML = `<i></i><span>${txs.length} lançamentos no banco</span>`;
    }
    if (cards[1]) {
      cards[1].querySelector('strong').textContent = money(dash.income);
      cards[1].querySelector('p').innerHTML = `<span>${txs.filter(t => t.kind === 'income').length} receitas reais</span>`;
      const bars = cards[1].querySelector('.mini-bars');
      if (bars) bars.innerHTML = byDayBars(txs, 'income').map(h => `<i style="height:${h}px"></i>`).join('');
    }
    if (cards[2]) {
      cards[2].querySelector('strong').textContent = money(dash.expenses);
      cards[2].querySelector('p').innerHTML = `<span>${txs.filter(t => t.kind === 'expense').length} despesas reais</span>`;
      const line = cards[2].querySelector('.line-chart svg');
      if (line) line.innerHTML = `<polyline points="${sparkPoints(txs, 'expense', 280, 55)}" fill="none" stroke="#EF9274" stroke-width="3"/>`;
    }
    if (cards[3]) {
      cards[3].querySelector('strong').textContent = money(dash.savings);
      cards[3].querySelector('p').innerHTML = `<b></b><span>receitas - despesas</span>`;
      const bar = cards[3].querySelector('.progress i');
      if (bar) bar.style.width = `${dash.income ? Math.max(0, Math.min(100, (dash.savings / dash.income) * 100)) : 0}%`;
    }

    renderCashflow(txs);
    renderCategoryChart(dash.expensesByCategory || []);
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

function dailyTotals(txs, kind) {
  const days = Array.from({ length: 30 }, () => 0);
  txs.filter(t => t.kind === kind).forEach(t => {
    const d = new Date(t.occurredOn).getDate();
    if (d >= 1 && d <= 30) days[d - 1] += Number(t.amount) || 0;
  });
  return days;
}

function sparkPoints(txs, kind, w, h) {
  const vals = dailyTotals(txs, kind);
  const max = Math.max(...vals, 1);
  return vals.map((v, i) => `${(i / 29) * w},${h - (v / max) * (h - 8) - 4}`).join(' ');
}

function byDayBars(txs, kind) {
  const vals = dailyTotals(txs, kind).slice(0, 7);
  const max = Math.max(...vals, 1);
  return vals.map(v => Math.max(4, Math.round((v / max) * 28)));
}

function renderCashflow(txs) {
  const svg = document.querySelector('.big-chart svg');
  if (!svg) return;
  svg.innerHTML = `<g class="gridlines"><path d="M0 16H660M0 65H660M0 114H660M0 163H660M0 212H660"/></g>
    <polyline points="${sparkPoints(txs, 'income', 660, 212)}" fill="none" stroke="#197A57" stroke-width="3"/>
    <polyline points="${sparkPoints(txs, 'expense', 660, 212)}" fill="none" stroke="#EF9274" stroke-width="3"/>`;
}

function renderCategoryChart(items) {
  const wrap = document.querySelector('.donut-wrap');
  if (!wrap) return;
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const colors = ['#e9ad66', '#74b796', '#97c7df', '#e9d9cf', '#b8c7bd'];
  let start = 0;
  const stops = items.map((item, i) => {
    const end = start + (total ? (Number(item.amount) / total) * 100 : 0);
    const s = `${colors[i % colors.length]} ${start}% ${end}%`;
    start = end;
    return s;
  }).join(',');
  wrap.innerHTML = `<div class="donut" style="background:conic-gradient(${stops || '#edf1ef 0 100%'})"><div>${money(total)}<small>total</small></div></div>
    <ul>${items.map((item, i) => `<li><i style="background:${colors[i % colors.length]}"></i><span>${item.name}</span><b>${money(item.amount)}</b></li>`).join('') || '<li><span>Sem despesas</span><b>€ 0,00</b></li>'}</ul>`;
}

async function renderTransactions() {
  try {
    currentTransactions = await ApiService.getTransactions();
    if (!Array.isArray(currentTransactions)) currentTransactions = [];
    const recentElem = document.querySelector('#recent-transactions');
    const allElem = document.querySelector('#all-transactions');

    if (recentElem) recentElem.innerHTML = currentTransactions.slice(0, 3).map(row).join('') || '<p style="color:#91a09b;font-size:11px;padding:12px 0">Sem lançamentos recentes.</p>';
    if (allElem) allElem.innerHTML = currentTransactions.map(row).join('') || '<p style="color:#91a09b;font-size:11px;padding:12px 0">Ainda não tem lançamentos. Adicione o primeiro!</p>';
  } catch (err) {
    console.error('Erro ao carregar transações:', err);
  }
}

async function renderPlanning() {
  try {
    const [budgets, dash] = await Promise.all([ApiService.getPlanning(), ApiService.getDashboard()]);
    const totalLimit = budgets.reduce((s, b) => s + Number(b.limit || 0), 0);
    const totalSpent = budgets.reduce((s, b) => s + Number(b.spent || 0), 0);
    const pctTotal = totalLimit ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;
    const hero = document.querySelector('.planning-hero');
    if (hero) {
      hero.innerHTML = `<div><span class="pill">${dash.savings >= 0 ? 'SALDO POSITIVO' : 'SALDO NEGATIVO'}</span><h2>${money(dash.savings)} de saldo este mês.</h2><p>Orçamento usado: ${money(totalSpent)} de ${money(totalLimit)}.</p></div><div class="goal-ring"><strong>${pctTotal}%</strong><span>do orçamento</span></div>`;
    }
    const listElem = document.querySelector('.budget-list');
    if (listElem && Array.isArray(budgets)) {
      listElem.innerHTML = budgets.map(b => {
        const pct = Math.min(Math.round((b.spent / b.limit) * 100), 100);
        return `<div>
          <span>${b.category}</span>
          <b>€ ${b.spent.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} <small>de € ${b.limit.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</small></b>
          <i><em style="width:${pct}%"></em></i>
        </div>`;
      }).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar orçamentos:', err);
  }
}

async function renderReports() {
  const [dash, txs] = await Promise.all([ApiService.getDashboard(), ApiService.getTransactions()]);
  const reports = document.querySelector('#reports');
  if (!reports) return;
  const biggest = (dash.expensesByCategory || [])[0];
  reports.querySelector('.report-grid').innerHTML = `
    <article class="panel report-card"><span class="report-icon">▤</span><h3>Resumo mensal</h3><p>${money(dash.income)} em receitas, ${money(dash.expenses)} em despesas e ${money(dash.savings)} de saldo.</p></article>
    <article class="panel report-card"><span class="report-icon peach">◔</span><h3>Lançamentos</h3><p>${txs.length} movimentos reais no banco de dados.</p></article>
    <article class="panel report-card"><span class="report-icon blue">◎</span><h3>Categorias</h3><p>${(dash.expensesByCategory || []).length} categorias com despesas registadas.</p></article>`;
  const insight = reports.querySelector('.insight');
  if (insight) insight.innerHTML = biggest
    ? `<span>✦</span><div><p class="section-label">INSIGHT DO MÊS</p><h3>${biggest.name} é a maior despesa.</h3><p>${money(biggest.amount)} de ${money(dash.expenses)} em despesas reais.</p></div>`
    : `<span>✦</span><div><p class="section-label">INSIGHT DO MÊS</p><h3>Sem despesas registadas.</h3><p>Os relatórios serão preenchidos quando houver lançamentos.</p></div>`;
}

async function renderAccounts() {
  const accounts = document.querySelector('#accounts');
  if (!accounts) return;
  accounts.innerHTML = `<article class="panel dev-placeholder"><p class="section-label">CONTAS BANCÁRIAS</p><h2>Em desenvolvimento...</h2></article>`;
}

async function loadAllData() {
  await renderDashboard();
  await renderTransactions();
  await renderPlanning();
  await renderReports();
  await renderAccounts();
}

// Navegação de Visões (Views)
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  const target = button.dataset.view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetElem = document.getElementById(target);
  if (targetElem) targetElem.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === target));
  
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent = target === 'dashboard' ? 'Bom dia, Clara ✦' : ({
      transactions: 'Lançamentos',
      planning: 'Planeamento',
      reports: 'Relatórios',
      whatsapp: 'WhatsApp',
      accounts: 'Contas bancárias'
    }[target]);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

// Modais
const modal = document.getElementById('modal');
['new-entry', 'new-entry-alt'].forEach(id => document.getElementById(id)?.addEventListener('click', () => modal.classList.add('show')));
const closeBtn = document.getElementById('close-modal');
if (closeBtn) closeBtn.onclick = () => modal.classList.remove('show');
modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });

// Submissão do Formulário de Lançamento (POST /api/transactions)
document.getElementById('entry-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  const newTx = {
    description: form.get('description'),
    amount: parseFloat(form.get('amount')),
    kind: form.get('type') || 'expense',
    category: form.get('category'),
    source: 'Manual',
    occurredOn: new Date().toISOString()
  };

  try {
    await ApiService.createTransaction(newTx);
    await loadAllData();
    modal.classList.remove('show');
    showToast('Lançamento guardado com sucesso no servidor.');
    e.target.reset();
  } catch (err) {
    showToast('Erro ao guardar lançamento na API.');
  }
});

// Upload de Comprovativo (Simulação OCR / API /api/webhooks/whatsapp/attachments)
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

uploadZone?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (file) {
    showToast(`Analisando “${file.name}” com OCR...`);
    try {
      const res = await ApiService.uploadAttachment({
        fileName: file.name,
        sizeBytes: file.size,
        contentType: file.type || 'application/pdf'
      });
      await loadAllData();
      showToast(`“${file.name}” analisado! Lançamento automático criado.`);

      // Adiciona mensagem visual na Central do WhatsApp
      const chatContainer = document.querySelector('.chat');
      if (chatContainer && res.whatsappReply) {
        const fileMsg = document.createElement('div');
        fileMsg.className = 'message user';
        fileMsg.innerHTML = `<span class="file-icon">▧</span><div><b>${file.name}</b><small>PDF / Imagem</small></div><time>${new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})}</time>`;
        chatContainer.appendChild(fileMsg);

        const botReply = document.createElement('div');
        botReply.className = 'message bot success';
        botReply.innerHTML = `${res.whatsappReply} <small>${new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})}</small>`;
        chatContainer.appendChild(botReply);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    } catch (err) {
      showToast('Erro ao processar ficheiro.');
    }
    e.target.value = '';
  }
});

// Chat de Mensagens Interativas WhatsApp
async function sendWaMsg() {
  const input = document.getElementById('wa-text-input');
  if (!input || !input.value.trim()) return;
  const msgText = input.value.trim();
  input.value = '';

  const chatContainer = document.querySelector('.chat');
  if (chatContainer) {
    const userMsg = document.createElement('div');
    userMsg.className = 'message user';
    userMsg.textContent = msgText;
    chatContainer.appendChild(userMsg);

    try {
      const res = await ApiService.sendWhatsappMessage(msgText);
      const botMsg = document.createElement('div');
      botMsg.className = 'message bot';
      botMsg.innerHTML = `${res.reply} <small>${new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'})} ✓✓</small>`;
      chatContainer.appendChild(botMsg);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (err) {
      console.error(err);
    }
  }
}

document.getElementById('wa-send-btn')?.addEventListener('click', sendWaMsg);
document.getElementById('wa-text-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendWaMsg(); });


function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Open Banking Modal & Conexões Bancárias
const bankModal = document.getElementById('bank-modal');
const closeBankBtn = document.getElementById('close-bank-modal');
const continueBankBtn = document.getElementById('continue-bank');

if (closeBankBtn) closeBankBtn.onclick = () => bankModal?.classList.remove('show');
bankModal?.addEventListener('click', e => { if (e.target === bankModal) bankModal.classList.remove('show'); });

document.getElementById('connect-bank')?.addEventListener('click', () => bankModal?.classList.add('show'));

continueBankBtn?.addEventListener('click', async () => {
  const bankSelect = document.getElementById('bank-select');
  const institutionName = bankSelect ? bankSelect.value : 'Banco Autorizado';
  try {
    showToast(`Autenticando no ${institutionName}...`);
    await ApiService.createBankConnection({ provider: 'SIBS_OpenBanking', institutionName });
    await loadAllData();
    bankModal?.classList.remove('show');
    showToast(`Conta do ${institutionName} conectada com sucesso via Open Banking!`);
  } catch (err) {
    showToast('Erro ao conectar banco.');
  }
});

document.getElementById('revoke-access')?.addEventListener('click', () => showToast('Acesso bancário revogado no servidor.'));


if (new URLSearchParams(window.location.search).get('bank') === 'setup') {
  const accountsElem = document.getElementById('accounts');
  const templateElem = document.getElementById('accounts-setup-template');
  if (accountsElem && templateElem) {
    accountsElem.innerHTML = templateElem.innerHTML;
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    accountsElem.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === 'accounts'));
    document.getElementById('page-title').textContent = 'Contas bancárias';
  }
}

// Inicializa o carregamento de dados da API
document.addEventListener('DOMContentLoaded', loadAllData);
loadAllData();

function renderCurrentDate(){const el=document.querySelector('.eyebrow');if(!el)return;const d=new Date();el.textContent=d.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'long'}).toUpperCase();}
renderCurrentDate();document.addEventListener('DOMContentLoaded',renderCurrentDate);
