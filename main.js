// Global state
window.currentSettlementType = null;
window.expensesList = [];
window.chartInstances = {};
window.analyticsData = null;
window.membersList = [];

// ------------------ INITIALIZE ROOM ------------------
async function mainRoomInit(roomId) {
  window.roomId = roomId;

  // Initial load
  await refreshRoom();
  await loadExpenseHistory();

  // Check if coming back from receipt scan
  checkForScannedReceipt();

  // Button bindings
  document.getElementById('addMember').onclick = addMemberHandler;
  document.getElementById('addExpense').onclick = addExpenseHandler;
  document.getElementById('refreshSummary').onclick = refreshSummary;
  document.getElementById('showAnalytics').onclick = showAnalytics;
}

// ------------------ CHECK FOR SCANNED RECEIPT ------------------
function checkForScannedReceipt() {
  const scannedData = sessionStorage.getItem('scannedReceipt');
  
  if (scannedData) {
    try {
      const data = JSON.parse(scannedData);
      
      document.getElementById('category').value = data.category || '';
      document.getElementById('amount').value = data.amount || '';
      document.getElementById('note').value = data.note || '';
      
      sessionStorage.removeItem('scannedReceipt');
      
      const message = document.createElement('div');
      message.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, rgba(0, 255, 136, 0.9), rgba(0, 217, 255, 0.9));
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 255, 136, 0.4);
        z-index: 1000;
        font-weight: 600;
        animation: slideInRight 0.5s ease-out;
      `;
      message.innerHTML = `
        ✅ Receipt scanned! Category and amount auto-filled.<br>
        <small style="opacity:0.9">Select payer and adjust if needed</small>
      `;
      document.body.appendChild(message);
      
      setTimeout(() => {
        message.style.animation = 'slideOutRight 0.5s ease-out';
        setTimeout(() => message.remove(), 500);
      }, 5000);
      
      document.getElementById('category').scrollIntoView({ behavior: 'smooth', block: 'center' });
      
    } catch (err) {
      console.error('Error parsing scanned receipt:', err);
    }
  }
}

// ------------------ REFRESH MEMBERS ------------------
async function refreshRoom() {
  try {
    const res = await fetch(`/api/room/${window.roomId}`);
    if (!res.ok) {
      alert('Room not found');
      return;
    }
    const room = await res.json();
    console.log('Room data received:', room);
    populateMembers(room.members);
  } catch (err) {
    console.error('Error fetching room:', err);
    alert('Failed to load room members');
  }
}

function populateMembers(members) {
  const list = document.getElementById('membersList');
  const payer = document.getElementById('payer');
  list.innerHTML = '';
  payer.innerHTML = '<option value="">Select Payer</option>';

  window.membersList = members;
  console.log('Members populated:', window.membersList);

  members.forEach(m => {
    const li = document.createElement('li');
    li.textContent = m;
    list.appendChild(li);

    const opt = document.createElement('option');
    opt.value = m;
    opt.text = m;
    payer.appendChild(opt);
  });
}

// ------------------ ADD MEMBER ------------------
async function addMemberHandler() {
  const name = document.getElementById('memberName').value.trim();
  if (!name) {
    alert('Enter a name');
    return;
  }

  try {
    const res = await fetch(`/api/room/${window.roomId}/add_member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to add member');
      return;
    }

    const data = await res.json();
    document.getElementById('memberName').value = '';
    populateMembers(data.members);
  } catch (err) {
    console.error('Error adding member:', err);
    alert('Could not add member');
  }
}

// ------------------ ADD EXPENSE (Simplified) ------------------
async function addExpenseHandler() {
  const payer = document.getElementById('payer').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value || 'Misc';
  const note = document.getElementById('note').value || '';

  console.log('Adding expense:', { payer, amount, category, note });

  if (!payer || !amount || amount <= 0) {
    alert('Enter valid payer and amount');
    return;
  }

  try {
    const payload = {
      payer,
      amount,
      category,
      shared_with: [payer],
      note,
      split_type: 'equal',
      custom_splits: null
    };

    console.log('Sending payload:', payload);

    const res = await fetch(`/api/room/${window.roomId}/add_expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('Response:', data);
    
    if (data.ok) {
      document.getElementById('amount').value = '';
      document.getElementById('category').value = '';
      document.getElementById('note').value = '';

      alert('✅ Expense added successfully');
      await loadExpenseHistory();
    } else {
      alert(data.error || 'Error adding expense');
    }
  } catch (err) {
    console.error('Error adding expense:', err);
    alert('Could not add expense: ' + err.message);
  }
}

// ------------------ LOAD EXPENSE HISTORY ------------------
async function loadExpenseHistory() {
  try {
    const res = await fetch(`/api/room/${window.roomId}/expenses`);
    if (!res.ok) {
      console.error('Failed to fetch expenses');
      return;
    }
    
    const data = await res.json();
    window.expensesList = data.expenses || [];
    
    console.log('Loaded expenses:', window.expensesList);
    
    const historyDiv = document.getElementById('expenseHistory');
    if (!historyDiv) {
      console.error('expenseHistory element not found');
      return;
    }
    
    historyDiv.innerHTML = '';

    if (window.expensesList.length === 0) {
      historyDiv.innerHTML = '<p class="hint">No expenses yet. Add one above!</p>';
      return;
    }

    window.expensesList.forEach((expense, index) => {
      const expenseCard = document.createElement('div');
      expenseCard.className = 'expense-card';
      expenseCard.innerHTML = `
        <div class="expense-header">
          <span class="expense-category">${expense.category || 'Misc'}</span>
          <span class="expense-amount">₹${parseFloat(expense.amount).toFixed(2)}</span>
        </div>
        <div class="expense-details">
          <p><strong>Paid by:</strong> ${expense.payer}</p>
          ${expense.description ? `<p><strong>Note:</strong> ${expense.description}</p>` : ''}
          <p class="expense-date">${new Date(expense.created_at).toLocaleString()}</p>
        </div>
      `;
      historyDiv.appendChild(expenseCard);
    });
  } catch (err) {
    console.error('Error loading expenses:', err);
  }
}

// ------------------ REFRESH SUMMARY ------------------
async function refreshSummary() {
  await loadExpenseHistory();
  alert('✅ Summary refreshed!');
}

// ------------------ SHOW ANALYTICS ------------------
async function showAnalytics() {
  try {
    const res = await fetch(`/api/room/${window.roomId}/summary`);
    
    if (!res.ok) {
      alert('Failed to load analytics');
      return;
    }
    
    const data = await res.json();
    window.analyticsData = data;
    
    console.log('Analytics loaded:', data);
    
    // Update members
    if (data.members && data.members.length > 0) {
      window.membersList = data.members;
    }
    
    // Calculate grand total
    let grandTotal = 0;
    if (data.category_totals) {
      grandTotal = Object.values(data.category_totals).reduce((sum, val) => sum + parseFloat(val || 0), 0);
    }
    
    // Show modal
    document.getElementById('analyticsModal').style.display = 'flex';
    
    // Update displays
    document.getElementById('grandTotal').textContent = `₹${grandTotal.toFixed(2)}`;
    document.getElementById('totalExpenses').textContent = window.expensesList.length;
    document.getElementById('totalMembers').textContent = window.membersList.length;
    document.getElementById('totalToSplit').textContent = grandTotal.toFixed(2);
    
    // Reset UI
    window.currentSettlementType = null;
    document.getElementById('customSettlementSection').style.display = 'none';
    document.getElementById('calculateSettlement').style.display = 'none';
    document.getElementById('settlementResults').style.display = 'none';
    document.getElementById('equalSettleBtn').classList.remove('active');
    document.getElementById('customSettleBtn').classList.remove('active');
    
    // Destroy old charts
    Object.values(window.chartInstances).forEach(chart => chart.destroy());
    window.chartInstances = {};
    
    // Create charts
    setTimeout(() => {
      createCategoryChart(data.category_totals || {});
      createMemberChart(data.paid || {});
      createTimelineChart();
    }, 100);
    
  } catch (err) {
    console.error('Error:', err);
    alert('Failed to load analytics');
  }
}

// ------------------ SETTLEMENT TYPE ------------------
function setSettlementType(type) {
  window.currentSettlementType = type;
  
  if (type === 'equal') {
    document.getElementById('equalSettleBtn').classList.add('active');
    document.getElementById('customSettleBtn').classList.remove('active');
    document.getElementById('customSettlementSection').style.display = 'none';
  } else {
    document.getElementById('customSettleBtn').classList.add('active');
    document.getElementById('equalSettleBtn').classList.remove('active');
    document.getElementById('customSettlementSection').style.display = 'block';
    generateCustomSettlementInputs();
  }
  
  document.getElementById('calculateSettlement').style.display = 'block';
}

function generateCustomSettlementInputs() {
  const container = document.getElementById('customSettlementInputs');
  container.innerHTML = '';
  
  window.membersList.forEach(member => {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `
      <label style="min-width:150px; font-weight:600;">${member}:</label>
      <input type="number" class="custom-settlement-input" data-member="${member}" 
             placeholder="%" min="0" max="100" step="0.1" value="0" style="max-width:120px;">
      <span style="margin-left:8px;">%</span>
    `;
    container.appendChild(div);
    
    div.querySelector('input').addEventListener('input', updateSettlementTotal);
  });
  
  updateSettlementTotal();
}

function updateSettlementTotal() {
  const inputs = document.querySelectorAll('.custom-settlement-input');
  let total = 0;
  
  inputs.forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  
  const display = document.getElementById('settlementTotal');
  display.textContent = `Total: ${total.toFixed(1)}%`;
  display.style.color = Math.abs(total - 100) < 0.1 ? 'var(--success)' : 'var(--warning)';
}

// ------------------ CALCULATE SETTLEMENT ------------------
function calculateFinalSettlement() {
  if (!window.currentSettlementType) {
    alert('Please select Equal or Custom split first');
    return;
  }
  
  if (!window.analyticsData) {
    alert('No data available');
    return;
  }
  
  const data = window.analyticsData;
  const grandTotal = Object.values(data.category_totals || {}).reduce((s, v) => s + parseFloat(v || 0), 0);
  
  if (grandTotal === 0) {
    alert('No expenses to settle!');
    return;
  }
  
  const shouldPay = {};
  
  if (window.currentSettlementType === 'equal') {
    const perPerson = grandTotal / window.membersList.length;
    window.membersList.forEach(m => shouldPay[m] = perPerson);
  } else {
    const inputs = document.querySelectorAll('.custom-settlement-input');
    let totalPercent = 0;
    
    inputs.forEach(input => {
      const member = input.dataset.member;
      const percent = parseFloat(input.value) || 0;
      shouldPay[member] = (grandTotal * percent) / 100;
      totalPercent += percent;
    });
    
    if (Math.abs(totalPercent - 100) > 0.1) {
      alert(`Total must be 100%. Current: ${totalPercent.toFixed(1)}%`);
      return;
    }
  }
  
  const netBalances = {};
  window.membersList.forEach(m => {
    const paid = parseFloat(data.paid[m] || 0);
    const should = shouldPay[m] || 0;
    netBalances[m] = paid - should;
  });
  
  const settlements = minimizeTransactions(netBalances);
  displayFinalSettlement(settlements, shouldPay);
}

function minimizeTransactions(netBalances) {
  const cents = {};
  for (const [p, a] of Object.entries(netBalances)) {
    cents[p] = Math.round(a * 100);
  }
  
  const creditors = [];
  const debtors = [];
  
  for (const [p, a] of Object.entries(cents)) {
    if (a > 0) creditors.push({ person: p, amount: a });
    else if (a < 0) debtors.push({ person: p, amount: Math.abs(a) });
  }
  
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);
  
  const settlements = [];
  let i = 0, j = 0;
  
  while (i < creditors.length && j < debtors.length) {
    const c = creditors[i];
    const d = debtors[j];
    const transfer = Math.min(c.amount, d.amount);
    
    settlements.push({ from: d.person, to: c.person, amount: transfer / 100 });
    
    c.amount -= transfer;
    d.amount -= transfer;
    
    if (c.amount === 0) i++;
    if (d.amount === 0) j++;
  }
  
  return settlements;
}

function displayFinalSettlement(settlements, shouldPay) {
  document.getElementById('settlementResults').style.display = 'block';
  const div = document.getElementById('settlements');
  div.innerHTML = '';
  
  const summary = document.createElement('div');
  summary.innerHTML = '<h4>💵 Individual Shares</h4>';
  
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px;';
  
  for (const [m, a] of Object.entries(shouldPay)) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:12px 16px; background:rgba(0,217,255,0.1); border:1px solid rgba(0,217,255,0.3); border-radius:10px; text-align:center;';
    card.innerHTML = `<div style="font-size:14px; color:var(--muted)">${m}</div><div style="font-size:20px; font-weight:700; color:var(--accent)">₹${a.toFixed(2)}</div>`;
    grid.appendChild(card);
  }
  
  summary.appendChild(grid);
  div.appendChild(summary);
  
  if (settlements.length === 0) {
    div.innerHTML += '<p class="hint" style="text-align:center; font-size:18px; margin-top:24px;">🎉 All settled!</p>';
    return;
  }
  
  const title = document.createElement('h4');
  title.textContent = '💸 Transactions Needed';
  title.style.marginTop = '24px';
  div.appendChild(title);
  
  settlements.forEach(s => {
    const card = document.createElement('div');
    card.className = 'settlement-card';
    card.innerHTML = `
      <div class="settlement-arrow">→</div>
      <div class="settlement-info"><strong>${s.from}</strong> pays <strong>${s.to}</strong></div>
      <div class="settlement-amount">₹${s.amount.toFixed(2)}</div>
    `;
    div.appendChild(card);
  });
}

// ------------------ CHARTS ------------------
function createCategoryChart(data) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;
  
  const labels = Object.keys(data);
  const values = Object.values(data);
  
  if (labels.length === 0) {
    ctx.parentElement.innerHTML = '<p class="hint">No category data</p>';
    return;
  }
  
  window.chartInstances.category = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['rgba(0,217,255,0.8)', 'rgba(255,46,151,0.8)', 'rgba(123,46,255,0.8)', 'rgba(0,255,136,0.8)', 'rgba(255,170,0,0.8)'],
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { labels: { color: '#f0f4ff' } } }
    }
  });
}

function createMemberChart(data) {
  const ctx = document.getElementById('memberChart');
  if (!ctx) return;
  
  const labels = Object.keys(data);
  const values = Object.values(data);
  
  if (labels.length === 0) {
    ctx.parentElement.innerHTML = '<p class="hint">No member data</p>';
    return;
  }
  
  window.chartInstances.member = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Paid (₹)',
        data: values,
        backgroundColor: 'rgba(0,217,255,0.6)',
        borderColor: 'rgba(0,217,255,1)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, ticks: { color: '#f0f4ff' }, grid: { color: 'rgba(255,255,255,0.1)' } },
        x: { ticks: { color: '#f0f4ff' }, grid: { color: 'rgba(255,255,255,0.1)' } }
      },
      plugins: { legend: { labels: { color: '#f0f4ff' } } }
    }
  });
}

function createTimelineChart() {
  const ctx = document.getElementById('timelineChart');
  if (!ctx) return;
  
  const dateMap = {};
  window.expensesList.forEach(e => {
    const date = new Date(e.created_at).toLocaleDateString();
    dateMap[date] = (dateMap[date] || 0) + parseFloat(e.amount);
  });
  
  const labels = Object.keys(dateMap);
  const values = Object.values(dateMap);
  
  if (labels.length === 0) {
    ctx.parentElement.innerHTML = '<p class="hint">No timeline data</p>';
    return;
  }
  
  window.chartInstances.timeline = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily Spending (₹)',
        data: values,
        borderColor: 'rgba(255,46,151,1)',
        backgroundColor: 'rgba(255,46,151,0.2)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, ticks: { color: '#f0f4ff' }, grid: { color: 'rgba(255,255,255,0.1)' } },
        x: { ticks: { color: '#f0f4ff' }, grid: { color: 'rgba(255,255,255,0.1)' } }
      },
      plugins: { legend: { labels: { color: '#f0f4ff' } } }
    }
  });
}

function closeAnalytics() {
  document.getElementById('analyticsModal').style.display = 'none';
}

// Styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight { from { opacity:0; transform:translateX(100px); } to { opacity:1; transform:translateX(0); } }
  @keyframes slideOutRight { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(100px); } }
`;
document.head.appendChild(style);