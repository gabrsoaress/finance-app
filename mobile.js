function formatMobileAmount(amount, type) {
  const val = Number(amount).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${type === 'income' ? '+' : '-'} € ${val}`;
}

function formatMobileDate(dateStr, source) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const dateFormatted = isToday ? 'Hoje' : d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  return `${dateFormatted}, ${time} · ${source || 'Manual'}`;
}

const transactionMarkup = t => `<article class="mobile-transaction">
  <span class="trans-icon">${t.kind === 'income' ? '↗' : '▧'}</span>
  <div><strong>${t.description}</strong><small>${formatMobileDate(t.occurredOn, t.source)}</small></div>
  <b class="${t.kind}">${formatMobileAmount(t.amount, t.kind)}</b>
</article>`;

async function loadMobileData() {
  try {
    const transactions = await ApiService.getTransactions();
    const dash = await ApiService.getDashboard();

    const homeTxElem = document.getElementById('mobile-transactions');
    const allTxElem = document.getElementById('all-mobile-transactions');
    if (homeTxElem) homeTxElem.innerHTML = transactions.slice(0, 3).map(transactionMarkup).join('');
    if (allTxElem) allTxElem.innerHTML = transactions.map(transactionMarkup).join('');

    const balanceElem = document.getElementById('balance-value');
    if (balanceElem && !balanceElem.dataset.hidden) {
      balanceElem.textContent = `€ ${dash.savings.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
    }
  } catch (err) {
    console.error('Erro ao carregar dados mobile:', err);
  }
}

document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
  const page = button.dataset.page;
  document.querySelectorAll('.mobile-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`${page}-view`);
  if (targetView) targetView.classList.add('active');
  document.querySelectorAll('.bottom-nav button').forEach(nav => nav.classList.toggle('active', nav.dataset.page === page));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

document.getElementById('hide-balance')?.addEventListener('click', function () {
  const balance = document.getElementById('balance-value');
  if (!balance) return;
  const hidden = balance.dataset.hidden === 'true';
  balance.dataset.hidden = !hidden;
  if (!hidden) {
    balance.textContent = '€ ••••••••';
  } else {
    loadMobileData();
  }
  this.textContent = hidden ? '◉' : '◌';
});

const fileInput = document.getElementById('mobile-file');
document.getElementById('mobile-upload')?.addEventListener('click', () => fileInput?.click());
document.getElementById('choose-file')?.addEventListener('click', () => fileInput?.click());

fileInput?.addEventListener('change', async () => {
  if (fileInput.files[0]) {
    const file = fileInput.files[0];
    const toast = document.getElementById('mobile-toast');
    if (toast) {
      toast.textContent = `“${file.name}” recebido. Processando com OCR...`;
      toast.classList.add('show');
    }
    try {
      await ApiService.uploadAttachment({
        fileName: file.name,
        sizeBytes: file.size,
        contentType: file.type || 'application/pdf'
      });
      await loadMobileData();
      if (toast) toast.textContent = `“${file.name}” processado! Lançamento registado.`;
    } catch (err) {
      if (toast) toast.textContent = 'Erro ao processar ficheiro no servidor.';
    }
    setTimeout(() => toast?.classList.remove('show'), 3600);
    fileInput.value = '';
  }
});

document.addEventListener('DOMContentLoaded', loadMobileData);
loadMobileData();
