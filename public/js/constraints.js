/**
 * Constraints calendar UI logic
 */

let selectedPersonnelId = null;
let currentMonth = null; // "YYYY-MM"
let pendingChanges = {}; // key: "YYYY-MM-DD_shiftId|all" => 'add'|'remove'
let existingConstraints = []; // from server

const personnelSelect = document.getElementById('personnelSelect');
const monthPicker = document.getElementById('monthPicker');
const loadBtn = document.getElementById('loadConstraintsBtn');
const constraintSection = document.getElementById('constraintSection');

// Enable load button when person is selected
personnelSelect?.addEventListener('change', () => {
  loadBtn.disabled = !personnelSelect.value;
});

loadBtn?.addEventListener('click', async () => {
  selectedPersonnelId = personnelSelect.value;
  currentMonth = monthPicker.value;
  if (!selectedPersonnelId || !currentMonth) return;

  const person = PERSONNEL.find(p => p.id == selectedPersonnelId);
  document.getElementById('selectedPersonnelBadge').textContent = person?.name || '';

  constraintSection.classList.remove('d-none');
  pendingChanges = {};

  await loadConstraints();
  renderCalendar();
});

async function loadConstraints() {
  try {
    const r = await fetch(`/constraints/${selectedPersonnelId}`);
    const data = await r.json();
    if (data.success) {
      existingConstraints = data.constraints;
    }
  } catch (e) {
    existingConstraints = [];
  }
  renderConstraintsList();
}

function getConstraintKey(dateStr, shiftId) {
  return `${dateStr}_${shiftId || 'all'}`;
}

function isConstrained(dateStr, shiftId) {
  // Check pending changes first
  const key = getConstraintKey(dateStr, shiftId);
  const allKey = getConstraintKey(dateStr, 'all');

  if (pendingChanges[key] === 'remove') return false;
  if (pendingChanges[allKey] === 'remove') return false;
  if (pendingChanges[key] === 'add') return true;
  if (pendingChanges[allKey] === 'add') return true;

  // Check existing
  return existingConstraints.some(c => {
    const cDate = c.constraint_date.split('T')[0];
    if (cDate !== dateStr) return false;
    if (shiftId === null || shiftId === undefined) {
      return c.shift_id === null;
    }
    return c.shift_id === null || c.shift_id == shiftId;
  });
}

function getSelectedShiftId() {
  const checked = document.querySelector('input[name="shiftType"]:checked');
  if (!checked) return null;
  return checked.value ? parseInt(checked.value) : null;
}

function renderCalendar() {
  const [year, month] = currentMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  // Day headers (RTL: Sun, Mon, Tue, Wed, Thu, Fri, Sat)
  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  dayNames.forEach(d => {
    const h = document.createElement('div');
    h.className = 'calendar-day-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  // Empty cells before first day
  const firstDow = firstDay.getDay(); // 0=Sun
  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    grid.appendChild(empty);
  }

  // Days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateObj = new Date(year, month - 1, d);
    const dateStr = dateObj.toISOString().split('T')[0];
    const dow = dateObj.getDay();
    const isWeekend = dow === 5 || dow === 6;
    const isToday = dateObj.getTime() === today.getTime();

    // Determine constraint state
    const constrainedAll = isConstrained(dateStr, null);
    const constrainedShifts = SHIFTS.filter(s => isConstrained(dateStr, s.id));
    const hasAnyConstraint = constrainedAll || constrainedShifts.length > 0;

    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (isWeekend) cell.classList.add('weekend');
    if (isToday) cell.classList.add('today');
    if (constrainedAll) cell.classList.add('constrained-all');
    else if (constrainedShifts.length > 0) cell.classList.add('constrained-shift');

    // Day number
    const numDiv = document.createElement('div');
    numDiv.className = 'day-num';
    numDiv.textContent = d;
    cell.appendChild(numDiv);

    // Tags
    if (hasAnyConstraint) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'constraint-tags';
      if (constrainedAll) {
        const tag = document.createElement('span');
        tag.className = 'constraint-tag';
        tag.textContent = 'כל היום';
        tagsDiv.appendChild(tag);
      } else {
        constrainedShifts.forEach(s => {
          const tag = document.createElement('span');
          tag.className = 'constraint-tag shift-specific';
          tag.textContent = s.name;
          tagsDiv.appendChild(tag);
        });
      }
      cell.appendChild(tagsDiv);
    }

    cell.addEventListener('click', () => toggleConstraint(dateStr, cell));
    grid.appendChild(cell);
  }
}

function toggleConstraint(dateStr, cell) {
  const shiftId = getSelectedShiftId();
  const key = getConstraintKey(dateStr, shiftId);

  const currentlyOn = isConstrained(dateStr, shiftId);

  if (currentlyOn) {
    pendingChanges[key] = 'remove';
  } else {
    pendingChanges[key] = 'add';
  }

  // Re-render calendar to reflect change
  renderCalendar();
}

// Save all pending changes
document.getElementById('saveConstraintsBtn')?.addEventListener('click', async () => {
  const keys = Object.keys(pendingChanges);
  if (!keys.length) {
    showToast('אין שינויים לשמור', 'info');
    return;
  }

  let success = 0, fail = 0;

  for (const key of keys) {
    const [dateStr, shiftPart] = key.split('_');
    const shiftId = shiftPart === 'all' ? null : parseInt(shiftPart);
    const action = pendingChanges[key];

    try {
      const r = await fetch('/constraints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personnel_id: selectedPersonnelId,
          date: dateStr,
          shift_id: shiftId,
          action
        })
      });
      const data = await r.json();
      if (data.success) success++;
      else fail++;
    } catch (e) {
      fail++;
    }
  }

  pendingChanges = {};
  await loadConstraints();
  renderCalendar();

  if (fail === 0) {
    showToast(`${success} אילוצים נשמרו בהצלחה ✓`, 'success');
  } else {
    showToast(`${success} נשמרו, ${fail} נכשלו`, 'warning');
  }
});

// Clear all constraints for selected person
document.getElementById('clearAllBtn')?.addEventListener('click', async () => {
  if (!confirm('למחוק את כל האילוצים של עובד זה?')) return;

  for (const c of existingConstraints) {
    pendingChanges[getConstraintKey(
      c.constraint_date.split('T')[0],
      c.shift_id
    )] = 'remove';
  }

  const keys = Object.keys(pendingChanges);
  for (const key of keys) {
    const [dateStr, shiftPart] = key.split('_');
    const shiftId = shiftPart === 'all' ? null : parseInt(shiftPart);
    await fetch('/constraints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personnel_id: selectedPersonnelId,
        date: dateStr,
        shift_id: shiftId,
        action: 'remove'
      })
    });
  }

  pendingChanges = {};
  await loadConstraints();
  renderCalendar();
  showToast('כל האילוצים נמחקו', 'info');
});

function renderConstraintsList() {
  const container = document.getElementById('constraintsList');
  if (!existingConstraints.length) {
    container.innerHTML = '<div class="text-center py-3 text-muted">אין אילוצים מוגדרים</div>';
    return;
  }

  const sorted = [...existingConstraints].sort((a, b) =>
    a.constraint_date.localeCompare(b.constraint_date)
  );

  const rows = sorted.map(c => {
    const dateStr = c.constraint_date.split('T')[0];
    const dateDisp = new Date(dateStr + 'T00:00:00').toLocaleDateString('he-IL');
    const shiftDisp = c.shift_id ? (c.shift_name || `משמרת ${c.shift_id}`) : 'כל היום';
    return `
      <div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
        <i class="bi bi-calendar-x text-danger"></i>
        <span class="fw-semibold">${dateDisp}</span>
        <span class="badge bg-${c.shift_id ? 'warning text-dark' : 'danger'}">${shiftDisp}</span>
        <div class="flex-grow-1"></div>
        <button class="btn btn-sm btn-outline-danger" onclick="removeConstraint(${c.id})">
          <i class="bi bi-x"></i>
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = rows;
}

async function removeConstraint(id) {
  try {
    await fetch('/constraints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personnel_id: selectedPersonnelId,
        action: 'remove',
        // We'll use the server-side method with id
        constraint_id: id
      })
    });
  } catch(e) {}
  await loadConstraints();
  renderCalendar();
}

// Re-render calendar when shift type changes
document.querySelectorAll('input[name="shiftType"]').forEach(radio => {
  radio.addEventListener('change', () => renderCalendar());
});

// Toast notification
function showToast(message, type = 'success') {
  const existing = document.getElementById('toastContainer');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;';

  const colorMap = { success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning text-dark', info: 'bg-info' };
  container.innerHTML = `
    <div class="toast show align-items-center text-white ${colorMap[type]} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body fw-semibold">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('#toastContainer').remove()"></button>
      </div>
    </div>
  `;
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 3500);
}
