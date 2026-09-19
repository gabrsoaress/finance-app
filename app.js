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
  if (!(await window.CustomDialog.confirm('Tem a certeza que quer excluir este lançamento?'))) return;
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

async function renderDashboard(year = 2026, month = 9) {
  try {
    let [dash, txs] = await Promise.all([ApiService.getDashboard(year, month), ApiService.getTransactions()]);
    if (dash && (dash.error === 'Não autorizado.' || dash.status === 401)) {
      if (localStorage.getItem('auth_user')) {
        localStorage.removeItem('auth_user');
        document.body.classList.add('auth-lock');
        showToast('Sessão expirada. Por favor inicie sessão novamente.');
      }
      return;
    }
    if (!Array.isArray(txs)) txs = [];
    
    // Filtra as transações pelo mês e ano selecionados
    txs = txs.filter(t => {
      if (!t.occurredOn) return false;
      const d = new Date(t.occurredOn);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    if (!dash || dash.error) dash = { income: 0, expenses: 0, savings: 0, expensesByCategory: [] };
    
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const titleElem = document.getElementById('dashboard-month-title');
    if (titleElem) titleElem.textContent = `${monthNames[month - 1]} em movimento`;
    
    const cards = document.querySelectorAll('.metric-card');
    if (cards[0]) {
      cards[0].querySelector('strong').textContent = money(dash.savings);
      cards[0].querySelector('p').innerHTML = `<i></i><span>${txs.length} lançamentos no banco</span>`;
    }
    if (cards[1]) {
      cards[1].querySelector('strong').textContent = money(dash.income);
      cards[1].querySelector('p').innerHTML = `<span>${txs.filter(t => t.kind === 'income').length} receitas</span>`;
      const bars = cards[1].querySelector('.mini-bars');
      if (bars) bars.innerHTML = byDayBars(txs, 'income').map(h => `<i style="height:${h}px"></i>`).join('');
    }
    if (cards[2]) {
      cards[2].querySelector('strong').textContent = money(dash.expenses);
      cards[2].querySelector('p').innerHTML = `<span>${txs.filter(t => t.kind === 'expense').length} despesas</span>`;
      const ctx = cards[2].querySelector('#expenseLineChart');
      if (ctx) renderExpenseChart(ctx, txs);
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

function exactDailyTotals(txs) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const todaysTxs = txs.filter(t => new Date(t.occurredOn) >= today);
  const timeMap = new Map();
  
  todaysTxs.forEach(t => {
    const d = new Date(t.occurredOn);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (!timeMap.has(timeStr)) timeMap.set(timeStr, { income: 0, expense: 0 });
    timeMap.get(timeStr)[t.kind] += Number(t.amount) || 0;
  });

  const sortedTimes = Array.from(timeMap.keys()).sort();
  if (sortedTimes.length === 0) {
    return { labels: ['00:00', '23:59'], incomes: [0, 0], expenses: [0, 0] };
  }

  if (sortedTimes[0] !== '00:00') sortedTimes.unshift('00:00');
  if (sortedTimes[sortedTimes.length - 1] !== '23:59') sortedTimes.push('23:59');

  const incomes = [];
  const expenses = [];
  sortedTimes.forEach(timeStr => {
    const data = timeMap.get(timeStr) || { income: 0, expense: 0 };
    incomes.push(data.income);
    expenses.push(data.expense);
  });

  return { labels: sortedTimes, incomes, expenses };
}

function weeklyTotals(txs, kind) {
  const days = Array.from({ length: 7 }, () => 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  txs.filter(t => t.kind === kind).forEach(t => {
    const d = new Date(t.occurredOn);
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffTime = today - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays >= 0 && diffDays < 7) {
      days[6 - diffDays] += Number(t.amount) || 0;
    }
  });
  return days;
}

function monthlyTotals(txs, kind) {
  const days = Array.from({ length: 30 }, () => 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  txs.filter(t => t.kind === kind).forEach(t => {
    const d = new Date(t.occurredOn);
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffTime = today - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays >= 0 && diffDays < 30) {
      days[29 - diffDays] += Number(t.amount) || 0;
    }
  });
  return days;
}

function byDayBars(txs, kind) {
  const vals = weeklyTotals(txs, kind);
  const max = Math.max(...vals, 1);
  return vals.map(v => Math.max(4, Math.round((v / max) * 28)));
}

let expenseChartInstance = null;
function renderExpenseChart(canvas, txs) {
  const vals = monthlyTotals(txs, 'expense');
  const now = new Date();
  const labels = Array.from({length: 30}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - i));
    return `${d.getDate()}/${d.getMonth()+1}`;
  });
  
  if (expenseChartInstance) {
    expenseChartInstance.data.datasets[0].data = vals;
    expenseChartInstance.update();
    return;
  }
  
  expenseChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: vals,
        borderColor: '#EF9274',
        borderWidth: 2,
        tension: 0.4, // Smooth curve
        pointRadius: 0,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 55);
          gradient.addColorStop(0, 'rgba(239, 146, 116, 0.2)');
          gradient.addColorStop(1, 'rgba(239, 146, 116, 0)');
          return gradient;
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false, min: 0 } }
    }
  });
}

let cashflowChartInstance = null;
let currentCashflowFilter = 'weekly';

function renderCashflow(txs) {
  const canvas = document.getElementById('cashflowChart');
  if (!canvas) return;
  
  const filterEl = document.getElementById('cashflow-filter');
  if (filterEl) {
    currentCashflowFilter = filterEl.value;
    filterEl.onchange = () => renderCashflow(txs);
  }

  let incomes, expenses, labels;
  if (currentCashflowFilter === 'monthly') {
    incomes = monthlyTotals(txs, 'income');
    expenses = monthlyTotals(txs, 'expense');
    const now = new Date();
    labels = Array.from({length: 30}, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - i));
      return `${d.getDate()}/${d.getMonth()+1}`;
    });
  } else if (currentCashflowFilter === 'weekly') {
    incomes = weeklyTotals(txs, 'income');
    expenses = weeklyTotals(txs, 'expense');
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    labels = Array.from({length: 7}, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
      return `${d.getDate()} ${monthNames[d.getMonth()]}`;
    });
  } else {
    const exactData = exactDailyTotals(txs);
    incomes = exactData.incomes;
    expenses = exactData.expenses;
    labels = exactData.labels;
  }

  if (cashflowChartInstance) {
    cashflowChartInstance.data.labels = labels;
    cashflowChartInstance.data.datasets[0].data = incomes;
    cashflowChartInstance.data.datasets[1].data = expenses;
    cashflowChartInstance.update();
    return;
  }
  
  cashflowChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Receitas',
          data: incomes,
          borderColor: '#197A57',
          borderWidth: 3,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          fill: true,
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 230);
            gradient.addColorStop(0, 'rgba(25, 122, 87, 0.25)');
            gradient.addColorStop(1, 'rgba(25, 122, 87, 0)');
            return gradient;
          }
        },
        {
          label: 'Despesas',
          data: expenses,
          borderColor: '#EF9274',
          borderWidth: 3,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fff',
          titleColor: '#0a1d16',
          bodyColor: '#4f5e58',
          borderColor: '#e8ecea',
          borderWidth: 1,
          padding: 12,
          usePointStyle: true,
          callbacks: {
            label: (context) => ` ${context.dataset.label}: € ${context.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: {
            color: '#8a9993',
            font: { family: "'DM Mono', monospace", size: 11 },
            maxTicksLimit: 5
          }
        },
        y: {
          grid: { color: '#e8ecea', drawBorder: false },
          ticks: {
            color: '#8a9993',
            font: { family: "'DM Mono', monospace", size: 11 },
            callback: (val) => `€ ${(val/1000)}k`
          },
          min: 0
        }
      }
    }
  });
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
    <ul>${items.map((item, i) => `<li><i style="background:${colors[i % colors.length]}"></i><span>${item.name}</span><b>${money(item.amount)}</b></li>`).join('') || '<li><i style="background:transparent"></i><span>Sem despesas</span><b>€ 0,00</b></li>'}</ul>`;
}

let currentTxFilterKind = 'all';

async function renderTransactions(year = 2026, month = 9) {
  try {
    currentTransactions = await ApiService.getTransactions();
    if (!Array.isArray(currentTransactions)) currentTransactions = [];
    const recentElem = document.querySelector('#recent-transactions');
    const allElem = document.querySelector('#all-transactions');

    if (recentElem) recentElem.innerHTML = currentTransactions.slice(0, 3).map(row).join('') || '<p style="color:#91a09b;font-size:11px;padding:12px 0">Sem lançamentos recentes.</p>';
    
    // Aplicar filtros
    let filteredTxs = currentTransactions.filter(t => {
      if (!t.occurredOn) return false;
      const d = new Date(t.occurredOn);
      const isSameMonth = d.getFullYear() === year && (d.getMonth() + 1) === month;
      const isSameKind = currentTxFilterKind === 'all' || t.kind === currentTxFilterKind;
      return isSameMonth && isSameKind;
    });

    if (allElem) allElem.innerHTML = filteredTxs.map(row).join('') || '<p style="color:#91a09b;font-size:11px;padding:12px 0;text-align:center;">Sem lançamentos para este filtro.</p>';
  } catch (err) {
    console.error('Erro ao carregar transações:', err);
  }
}

async function renderReports() {
  let [dash, txs] = await Promise.all([ApiService.getDashboard(), ApiService.getTransactions()]);
  if (!Array.isArray(txs)) txs = [];
  if (!dash || dash.error) dash = { income: 0, expenses: 0, savings: 0, expensesByCategory: [] };
  
  const reports = document.querySelector('#reports');
  if (!reports) return;
  
  const expenses = txs.filter(t => t.kind === 'expense');
  const biggestCategory = (dash.expensesByCategory || [])[0];
  
  // Calculations
  const savingsRate = dash.income > 0 ? (dash.savings / dash.income) * 100 : 0;
  const biggestExpense = expenses.length > 0 ? expenses.reduce((max, t) => Number(t.amount) > Number(max.amount) ? t : max, expenses[0]) : null;
  const currentDay = new Date().getDate();
  const dailyAverage = dash.expenses / currentDay;
  
  // HTML generation
  reports.querySelector('.report-grid').innerHTML = `
    <article class="panel report-card"><span class="report-icon">▤</span><h3>Resumo mensal</h3><p>${money(dash.income)} em receitas, ${money(dash.expenses)} em despesas e ${money(dash.savings)} de saldo.</p></article>
    <article class="panel report-card"><span class="report-icon peach">◔</span><h3>Taxa de Poupança</h3><p>Guardou <b>${savingsRate.toFixed(1)}%</b> do seu rendimento este mês.</p></article>
    <article class="panel report-card"><span class="report-icon blue">◎</span><h3>Média Diária</h3><p>Está a gastar em média <b>${money(dailyAverage)}</b> por dia.</p></article>`;
    
  let insightsHTML = '';
  
  if (biggestCategory && dash.expenses > 0) {
    const pct = ((biggestCategory.amount / dash.expenses) * 100).toFixed(1);
    insightsHTML += `
      <article class="panel insight" style="margin-bottom: 12px;">
        <span>✦</span>
        <div><p class="section-label">CATEGORIA DE MAIOR PESO</p>
        <h3>${biggestCategory.name} representa ${pct}% das suas despesas.</h3>
        <p>Totalizou ${money(biggestCategory.amount)}, sendo a área onde gasta mais recursos.</p></div>
      </article>`;
  }
  
  if (biggestExpense) {
    insightsHTML += `
      <article class="panel insight" style="margin-bottom: 12px;">
        <span>✦</span>
        <div><p class="section-label">MAIOR TRANSAÇÃO ÚNICA</p>
        <h3>Gasto de ${money(biggestExpense.amount)} em ${biggestExpense.categoryName || 'Outros'}.</h3>
        <p>A transação "${biggestExpense.description}" foi o seu maior movimento financeiro este mês.</p></div>
      </article>`;
  }
  
  if (savingsRate > 20) {
    insightsHTML += `
      <article class="panel insight" style="margin-bottom: 12px;">
        <span>✦</span>
        <div><p class="section-label">SAÚDE FINANCEIRA</p>
        <h3>Excelente capacidade de poupança!</h3>
        <p>Está a poupar mais de 20% do seu rendimento, o que é um indicador fantástico de saúde financeira.</p></div>
      </article>`;
  } else if (dash.income > 0 && savingsRate < 5) {
    insightsHTML += `
      <article class="panel insight" style="margin-bottom: 12px;">
        <span>✦</span>
        <div><p class="section-label">ALERTA FINANCEIRO</p>
        <h3>A sua taxa de poupança está baixa.</h3>
        <p>Recomendamos a revisão dos seus gastos não essenciais para tentar poupar pelo menos 10% a 20% do que ganha.</p></div>
      </article>`;
  }
  
  if (!insightsHTML) {
    insightsHTML = `
      <article class="panel insight">
        <span>✦</span><div><p class="section-label">INSIGHT DO MÊS</p><h3>Sem dados suficientes.</h3><p>Continue a usar a aplicação para gerarmos análises financeiras.</p></div>
      </article>`;
  }
  
  // Substituir a tag .insight antiga por uma div wrapper para suportar múltiplos insights
  let insightsContainer = reports.querySelector('#insights-container');
  if (!insightsContainer) {
    const oldInsight = reports.querySelector('.insight');
    if (oldInsight) {
      insightsContainer = document.createElement('div');
      insightsContainer.id = 'insights-container';
      oldInsight.parentNode.replaceChild(insightsContainer, oldInsight);
    }
  }
  if (insightsContainer) {
    insightsContainer.innerHTML = insightsHTML;
  }
}

async function renderAccounts() {
  const accounts = document.querySelector('#accounts');
  if (!accounts) return;
  accounts.innerHTML = `<article class="panel dev-placeholder"><p class="section-label">CONTAS BANCÁRIAS</p><h2>Em desenvolvimento...</h2></article>`;
}

async function renderSettings() {
  const profileForm = document.getElementById('profile-form');
  if (!profileForm) return;

  try {
    const profile = await ApiService.getProfile();
    if (profile && !profile.error) {
      document.getElementById('profile-name').value = profile.name || '';
      document.getElementById('profile-email').value = profile.email || '';
      if (profile.user && profile.user.user_metadata && profile.user.user_metadata.savings_goal) {
        document.getElementById('profile-savings-goal').value = profile.user.user_metadata.savings_goal;
      }
    }
  } catch (err) {
    console.error('Erro ao carregar perfil', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('profile-msg');
      const name = document.getElementById('profile-name').value;
      const password = document.getElementById('profile-password').value;
      const savingsGoal = document.getElementById('profile-savings-goal').value;

      try {
        msg.textContent = 'A guardar...';
        msg.style.color = '#197a57';
        
        const data = {};
        if (name) data.name = name;
        if (password) data.password = password;
        if (savingsGoal) data.savings_goal = savingsGoal;

        const res = await ApiService.updateProfile(data);
        if (res.error) {
          msg.textContent = res.error;
          msg.style.color = 'red';
        } else {
          msg.textContent = 'Perfil atualizado com sucesso!';
          document.getElementById('profile-password').value = '';
          const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
          if (res.user) {
            authUser.name = res.user.name;
            localStorage.setItem('auth_user', JSON.stringify(authUser));
            document.querySelector('.profile strong').textContent = authUser.name;
            const initials = authUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.querySelector('.profile .avatar').textContent = initials;
            const pageTitle = document.getElementById('page-title');
            if (pageTitle && pageTitle.textContent.includes('Bom dia')) {
              pageTitle.innerHTML = `Bom dia, ${authUser.name.split(' ')[0]} <span>✦</span>`;
            }
          }
          setTimeout(() => msg.textContent = '', 3000);
        }
      } catch (err) {
        msg.textContent = 'Erro ao atualizar perfil.';
        msg.style.color = 'red';
      }
    });
  }
});

async function loadAllData() {
  const auth = localStorage.getItem('auth_user');
  if (!auth) return;
  
  // Obter o valor atual do filtro se existir
  const periodSelect = document.getElementById('dashboard-period');
  let year = 2026;
  let month = 9;
  if (periodSelect && periodSelect.value) {
    const [y, m] = periodSelect.value.split('-');
    year = parseInt(y, 10);
    month = parseInt(m, 10);
  }

  await renderDashboard(year, month);
  await renderTransactions(year, month);
  await renderReports();
  await renderAccounts();
  await renderSettings();
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
    let dashboardTitle = 'Bom dia ✨';
    try {
      const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
      if (authUser.name) dashboardTitle = `Bom dia, ${authUser.name.split(' ')[0]} <span>✦</span>`;
    } catch(e) {}

    if (target === 'dashboard') {
      pageTitle.innerHTML = dashboardTitle;
    } else {
      pageTitle.textContent = {
        transactions: 'Lançamentos',
        planning: 'Planeamento',
        reports: 'Relatórios',
        whatsapp: 'WhatsApp',
        accounts: 'Contas bancárias',
        settings: 'Definições'
      }[target] || '';
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

document.addEventListener('DOMContentLoaded', () => {
  const periodSelect = document.getElementById('dashboard-period');
  if (periodSelect) {
    periodSelect.addEventListener('change', async (e) => {
      const [y, m] = e.target.value.split('-');
      await renderDashboard(parseInt(y, 10), parseInt(m, 10));
    });
  }

  // Filtros de transações
  const txPeriodSelect = document.getElementById('transactions-period');
  if (txPeriodSelect) {
    txPeriodSelect.addEventListener('change', async (e) => {
      const [y, m] = e.target.value.split('-');
      await renderTransactions(parseInt(y, 10), parseInt(m, 10));
    });
  }

  const txFilterButtons = document.querySelectorAll('#transactions .filter-row button.filter');
  txFilterButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      txFilterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTxFilterKind = btn.dataset.kind || 'all';
      
      let year = 2026, month = 9;
      if (txPeriodSelect && txPeriodSelect.value) {
        const [y, m] = txPeriodSelect.value.split('-');
        year = parseInt(y, 10);
        month = parseInt(m, 10);
      }
      
      await renderTransactions(year, month);
    });
  });
});

// Modais
const modal = document.getElementById('modal');
['new-entry', 'new-entry-alt'].forEach(id => document.getElementById(id)?.addEventListener('click', () => modal.classList.add('show')));
const closeBtn = document.getElementById('close-modal');
if (closeBtn) closeBtn.onclick = () => modal.classList.remove('show');
modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });

// AI Upload Logic in Modal
const aiSection = document.getElementById('ai-upload-section');
const entryForm = document.getElementById('entry-form');
const aiFileInput = document.getElementById('ai-file-input');
const aiLoading = document.getElementById('ai-loading');

if (aiSection && entryForm && aiFileInput) {
  // Drag and Drop events
  aiSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    aiSection.style.borderColor = '#197a57';
    aiSection.style.background = '#edf3f0';
  });
  aiSection.addEventListener('dragleave', (e) => {
    e.preventDefault();
    aiSection.style.borderColor = '#d4e3dc';
    aiSection.style.background = '#f9fbfa';
  });
  aiSection.addEventListener('drop', (e) => {
    e.preventDefault();
    aiSection.style.borderColor = '#d4e3dc';
    aiSection.style.background = '#f9fbfa';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAiFile(e.dataTransfer.files[0]);
    }
  });

  // Click file input
  aiSection.addEventListener('click', (e) => {
    if (e.target !== aiFileInput) {
      aiFileInput.click();
    }
  });

  aiFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAiFile(e.target.files[0]);
    }
  });

  function handleAiFile(file) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      showToast('Apenas imagens e PDFs são suportados.');
      return;
    }
    
    aiLoading.style.display = 'block';
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Str = event.target.result;
      
      try {
        const res = await fetch('/api/transactions/parse-ai', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            fileBase64: base64Str,
            mimeType: file.type
          })
        });
        
        if (!res.ok) throw new Error('Erro ao processar');
        const data = await res.json();
        
        // Preencher o formulário
        if (data.amount) entryForm.elements['amount'].value = data.amount;
        if (data.description) entryForm.elements['description'].value = data.description;
        
        const validKinds = ['expense', 'income', 'transfer'];
        entryForm.elements['type'].value = (data.kind && validKinds.includes(data.kind.toLowerCase())) ? data.kind.toLowerCase() : 'expense';
        
        if (data.category) {
          const catSelect = entryForm.elements['category'];
          let optionFound = false;
          Array.from(catSelect.options).forEach(opt => {
            if (opt.text.toLowerCase() === data.category.toLowerCase()) {
              catSelect.value = opt.value;
              optionFound = true;
            }
          });
          if (!optionFound) {
            catSelect.value = 'Outros';
          }
        }
        
        showToast('Documento analisado com sucesso! Confirme os dados antes de guardar.');
      } catch (err) {
        showToast('Ocorreu um erro na IA ao ler o documento.');
      } finally {
        aiLoading.style.display = 'none';
        aiFileInput.value = ''; // Reset
      }
    };
    reader.readAsDataURL(file);
  }
}

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
  let type = "info";
  let title = "Informação";
  const msgLower = message.toLowerCase();
  
  if (msgLower.includes('erro') || msgLower.includes('expirada') || msgLower.includes('falha')) {
    type = "error"; title = "Erro";
  } else if (msgLower.includes('sucesso') || msgLower.includes('atualizado') || msgLower.includes('excluído') || msgLower.includes('guardado') || msgLower.includes('analisado')) {
    type = "success"; title = "Sucesso";
  }
  
  if (window.CustomDialog && window.CustomDialog.toast) {
    window.CustomDialog.toast(message, title, type);
  } else {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }
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
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  loadAllData();
}

function renderCurrentDate(){const el=document.querySelector('.eyebrow');if(!el)return;const d=new Date();el.textContent=d.toLocaleDateString('pt-PT',{weekday:'long',day:'2-digit',month:'long'}).toUpperCase();}
renderCurrentDate();document.addEventListener('DOMContentLoaded',renderCurrentDate);

// Limpar utilizadores locais legados
localStorage.removeItem('finance_app_users');

// Gestão de Sessão & Login/Registo
let isRegisterMode = false;
const authToggle = document.getElementById('auth-toggle');
const authLabel = document.getElementById('auth-label');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const nameLabel = document.getElementById('auth-name-label');
const nameInput = document.getElementById('login-name');

if (authToggle) {
  authToggle.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
      authLabel.textContent = 'REGISTO';
      authTitle.textContent = 'Criar uma conta';
      authSubmit.textContent = 'Registar e Entrar';
      authToggle.textContent = 'Já tem conta? Entrar';
      nameLabel.style.display = 'block';
      nameInput.required = true;
    } else {
      authLabel.textContent = 'ACESSO';
      authTitle.textContent = 'Entrar no Finance App';
      authSubmit.textContent = 'Entrar';
      authToggle.textContent = 'Ainda não tem conta? Criar conta';
      nameLabel.style.display = 'none';
      nameInput.required = false;
    }
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    
    try {
      if (isRegisterMode) {
        const name = nameInput.value;
        if (!name) {
          await window.CustomDialog.alert('Por favor, introduza o seu nome.');
          return;
        }
        
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, pass })
        });
        
        const data = await res.json();
        if (res.ok) {
          loginSuccess(data.user, data.token);
        } else {
          await window.CustomDialog.alert(data.error || 'Erro ao criar conta.');
        }
        
      } else {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, pass })
        });
        
        const data = await res.json();
        if (res.ok) {
          loginSuccess(data.user, data.token);
        } else {
          await window.CustomDialog.alert(data.error || 'Email ou senha incorretos.');
        }
      }
    } catch (err) {
      await window.CustomDialog.alert('Erro de comunicação com o servidor.');
    }
  });
}

function loginSuccess(user, token) {
  document.body.classList.remove('auth-lock');
  localStorage.setItem('auth_user', JSON.stringify({ name: user.name, token, id: user.id }));
  
  const profileElem = document.querySelector('.profile strong');
  if (profileElem) profileElem.textContent = user.name;
  
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.innerHTML = `Bom dia, ${user.name.split(' ')[0]} <span>✦</span>`;
  
  showToast(`Sessão iniciada como ${user.name}.`);
  loadAllData();
}

const savedAuthUserStr = localStorage.getItem('auth_user');
if (savedAuthUserStr) {
  try {
    const savedAuthUser = JSON.parse(savedAuthUserStr);
    document.body.classList.remove('auth-lock');
    const profileElem = document.querySelector('.profile strong');
    if (profileElem) profileElem.textContent = savedAuthUser.name;
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.innerHTML = `Bom dia, ${savedAuthUser.name.split(' ')[0]} <span>✦</span>`;
  } catch (e) {
    // legacy format or error
    localStorage.removeItem('auth_user');
  }
}

// Logout
// Logout (usando event delegation pois o Lucide substitui o elemento no DOM)
document.addEventListener('click', async (e) => {
  const logoutBtn = e.target.closest('#logout-btn');
  if (logoutBtn) {
    if (await window.CustomDialog.confirm('Tem a certeza que deseja terminar a sessão?')) {
      localStorage.removeItem('auth_user');
      window.location.reload();
    }
  }
});

// Inicializar Lucide Icons
document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});


