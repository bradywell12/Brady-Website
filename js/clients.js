/* =====================================================
   Brady Wells Financial Advisor — Client CRM
   Backed by Supabase (PostgreSQL)
   ===================================================== */

// ─── State ────────────────────────────────────────────
let clients = [];
let filteredClients = [];
let selectedIds = new Set();
let sortCol = 'created_at';
let sortDir = 'desc';
let pendingImport = [];

// ─── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  showTableLoading(true);
  await loadClients();
  showTableLoading(false);
  applyFiltersAndRender();
  bindEvents();
});

// ─── Supabase CRUD ────────────────────────────────────
async function loadClients() {
  const { data, error } = await db
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showToast('Could not load clients: ' + error.message, 'error');
    clients = [];
  } else {
    clients = data || [];
  }
}

async function insertClient(fields) {
  const { data, error } = await db
    .from('clients')
    .insert([fields])
    .select()
    .single();

  if (error) { showToast('Error saving client: ' + error.message, 'error'); return null; }
  return data;
}

async function updateClientDB(id, fields) {
  const { error } = await db
    .from('clients')
    .update(fields)
    .eq('id', id);

  if (error) { showToast('Error updating client: ' + error.message, 'error'); return false; }
  return true;
}

async function deleteClientDB(id) {
  const { error } = await db
    .from('clients')
    .delete()
    .eq('id', id);

  if (error) { showToast('Error deleting client: ' + error.message, 'error'); return false; }
  return true;
}

async function bulkInsertClients(rows) {
  const { data, error } = await db
    .from('clients')
    .insert(rows)
    .select();

  if (error) { showToast('Import error: ' + error.message, 'error'); return []; }
  return data || [];
}

async function updateStatusBatch(ids, status) {
  const { error } = await db
    .from('clients')
    .update({ status })
    .in('id', ids);

  if (error) console.warn('Status update error:', error.message);
}

// ─── Rendering ────────────────────────────────────────
function applyFiltersAndRender() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const statusF = document.getElementById('statusFilter').value;
  const sourceF = document.getElementById('sourceFilter').value;

  filteredClients = clients.filter(c => {
    const matchSearch =
      !search ||
      (c.first_name || '').toLowerCase().includes(search) ||
      (c.last_name  || '').toLowerCase().includes(search) ||
      (c.email      || '').toLowerCase().includes(search) ||
      (c.phone      || '').toLowerCase().includes(search);
    const matchStatus = !statusF || c.status === statusF;
    const matchSource = !sourceF || c.source === sourceF;
    return matchSearch && matchStatus && matchSource;
  });

  // Sort
  filteredClients.sort((a, b) => {
    const va = (a[sortCol] || '').toString().toLowerCase();
    const vb = (b[sortCol] || '').toString().toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  renderTable();
  renderStats();
  updateSelectionUI();
}

function renderTable() {
  const tbody = document.getElementById('clientsTableBody');
  const empty = document.getElementById('tableEmpty');

  if (filteredClients.length === 0) {
    tbody.innerHTML = '';
    document.getElementById('clientsTable').style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  document.getElementById('clientsTable').style.display = 'table';
  empty.style.display = 'none';

  tbody.innerHTML = filteredClients.map(c => `
    <tr data-id="${c.id}" class="${selectedIds.has(c.id) ? 'selected-row' : ''}">
      <td><input type="checkbox" class="row-check" data-id="${c.id}" ${selectedIds.has(c.id) ? 'checked' : ''} /></td>
      <td>${escHtml(c.first_name || '')}</td>
      <td>${escHtml(c.last_name  || '')}</td>
      <td>${c.phone
        ? `<a href="tel:${escHtml(c.phone)}">${escHtml(c.phone)}</a>`
        : '<span style="color:#9ca3af">—</span>'}</td>
      <td>${c.email
        ? `<a href="mailto:${escHtml(c.email)}" style="color:var(--accent)">${escHtml(c.email)}</a>`
        : '<span style="color:#9ca3af">—</span>'}</td>
      <td>${statusBadge(c.status)}</td>
      <td>${sourceBadge(c.source)}</td>
      <td style="white-space:nowrap;color:var(--text-muted);font-size:0.82rem">
        ${c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
      </td>
      <td>
        <div class="row-actions">
          <button class="action-btn edit"  title="Edit"   data-id="${c.id}">&#9998;</button>
          ${c.email
            ? `<button class="action-btn email" title="Email" data-id="${c.id}">&#9993;</button>`
            : ''}
          ${c.notes
            ? `<button class="action-btn notes-btn" title="Notes" data-id="${c.id}">&#128203;</button>`
            : ''}
          <button class="action-btn delete" title="Delete" data-id="${c.id}">&#128465;</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Row event bindings
  tbody.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = parseInt(e.target.dataset.id);
      e.target.checked ? selectedIds.add(id) : selectedIds.delete(id);
      updateSelectionUI();
      e.target.closest('tr').classList.toggle('selected-row', e.target.checked);
    });
  });
  tbody.querySelectorAll('.action-btn.edit').forEach(btn =>
    btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.id))));
  tbody.querySelectorAll('.action-btn.email').forEach(btn =>
    btn.addEventListener('click', () => {
      const c = clients.find(x => x.id === parseInt(btn.dataset.id));
      if (c?.email) openSingleEmail(c);
    }));
  tbody.querySelectorAll('.action-btn.notes-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const c = clients.find(x => x.id === parseInt(btn.dataset.id));
      if (c) openNotesModal(c);
    }));
  tbody.querySelectorAll('.action-btn.delete').forEach(btn =>
    btn.addEventListener('click', () => deleteClient(parseInt(btn.dataset.id))));
}

function renderStats() {
  document.getElementById('statTotal').textContent     = clients.length;
  document.getElementById('statNew').textContent       = clients.filter(c => c.status === 'New Lead').length;
  document.getElementById('statContacted').textContent = clients.filter(c => c.status === 'Contacted' || c.status === 'Meeting Scheduled').length;
  document.getElementById('statClient').textContent    = clients.filter(c => c.status === 'Active Client').length;
}

function showTableLoading(on) {
  const tbody = document.getElementById('clientsTableBody');
  if (on) {
    document.getElementById('clientsTable').style.display = 'table';
    document.getElementById('tableEmpty').style.display = 'none';
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;padding:3rem;color:var(--text-muted)">
          Loading clients...
        </td>
      </tr>`;
  }
}

function statusBadge(status) {
  const map = {
    'New Lead':          'status-new',
    'Contacted':         'status-contacted',
    'Meeting Scheduled': 'status-meeting',
    'Active Client':     'status-client',
    'Not Interested':    'status-notinterested',
  };
  return `<span class="status-badge ${map[status] || ''}">${escHtml(status || 'Unknown')}</span>`;
}

function sourceBadge(source) {
  const isLinkedIn = source === 'LinkedIn';
  return `<span class="source-badge ${isLinkedIn ? 'source-linkedin' : ''}">${escHtml(source || 'Unknown')}</span>`;
}

// ─── Event Binding ────────────────────────────────────
function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', applyFiltersAndRender);
  document.getElementById('statusFilter').addEventListener('change', applyFiltersAndRender);
  document.getElementById('sourceFilter').addEventListener('change', applyFiltersAndRender);

  document.getElementById('selectAll').addEventListener('change', e => {
    filteredClients.forEach(c => e.target.checked ? selectedIds.add(c.id) : selectedIds.delete(c.id));
    applyFiltersAndRender();
  });

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      sortDir = (sortCol === col && sortDir === 'asc') ? 'desc' : 'asc';
      sortCol = col;
      applyFiltersAndRender();
    });
  });

  // Add / Edit modal
  document.getElementById('openAddModal').addEventListener('click', openAddModal);
  document.getElementById('emptyAddBtn')?.addEventListener('click', openAddModal);
  document.getElementById('closeAddModal').addEventListener('click', closeAddModal);
  document.getElementById('cancelAddModal').addEventListener('click', closeAddModal);
  document.getElementById('clientForm').addEventListener('submit', saveClient);

  // Import modal
  document.getElementById('openImportModal').addEventListener('click', openImportModal);
  document.getElementById('emptyImportBtn')?.addEventListener('click', openImportModal);
  document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
  document.getElementById('cancelImport').addEventListener('click', cancelImport);
  document.getElementById('confirmImport').addEventListener('click', confirmImport);
  document.getElementById('csvFileInput').addEventListener('change', handleCSVFile);

  // Drag & drop
  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) parseCSV(file);
    else showToast('Please upload a .csv file', 'error');
  });

  // Email
  document.getElementById('emailSelectedBtn').addEventListener('click', openComposePanel);
  document.getElementById('closeCompose').addEventListener('click', () => {
    document.getElementById('composePanel').style.display = 'none';
  });
  document.getElementById('sendEmailBtn').addEventListener('click', sendBulkEmail);
  document.getElementById('copyEmailBtn').addEventListener('click', copyEmailBody);

  // Export / Delete
  document.getElementById('exportBtn').addEventListener('click', exportCSV);
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);

  // Notes modal
  document.getElementById('closeNotesModal').addEventListener('click', () => {
    document.getElementById('notesModal').style.display = 'none';
  });
  document.getElementById('closeNotesCancelBtn').addEventListener('click', () => {
    document.getElementById('notesModal').style.display = 'none';
  });

  // Close overlays on backdrop click
  ['addModal', 'importModal', 'notesModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) document.getElementById(id).style.display = 'none';
    });
  });
}

// ─── Add / Edit Modal ─────────────────────────────────
function openAddModal() {
  document.getElementById('modalTitle').textContent    = 'Add New Client';
  document.getElementById('saveClientBtn').textContent = 'Save Client';
  document.getElementById('editClientId').value        = '';
  document.getElementById('clientForm').reset();
  document.getElementById('addModal').style.display = 'flex';
}

function openEditModal(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modalTitle').textContent    = 'Edit Client';
  document.getElementById('saveClientBtn').textContent = 'Update Client';
  document.getElementById('editClientId').value        = id;
  document.getElementById('cfFirstName').value = c.first_name || '';
  document.getElementById('cfLastName').value  = c.last_name  || '';
  document.getElementById('cfPhone').value     = c.phone      || '';
  document.getElementById('cfEmail').value     = c.email      || '';
  document.getElementById('cfStatus').value    = c.status     || 'New Lead';
  document.getElementById('cfSource').value    = c.source     || 'Manual Entry';
  document.getElementById('cfNotes').value     = c.notes      || '';
  document.getElementById('addModal').style.display = 'flex';
}

function closeAddModal() {
  document.getElementById('addModal').style.display = 'none';
}

async function saveClient(e) {
  e.preventDefault();
  const btn   = document.getElementById('saveClientBtn');
  const idVal = document.getElementById('editClientId').value;

  const fields = {
    first_name: document.getElementById('cfFirstName').value.trim(),
    last_name:  document.getElementById('cfLastName').value.trim(),
    phone:      document.getElementById('cfPhone').value.trim(),
    email:      document.getElementById('cfEmail').value.trim().toLowerCase(),
    status:     document.getElementById('cfStatus').value,
    source:     document.getElementById('cfSource').value,
    notes:      document.getElementById('cfNotes').value.trim(),
  };

  btn.textContent = 'Saving...';
  btn.disabled = true;

  if (idVal) {
    const ok = await updateClientDB(parseInt(idVal), fields);
    if (ok) {
      const idx = clients.findIndex(c => c.id === parseInt(idVal));
      if (idx !== -1) clients[idx] = { ...clients[idx], ...fields };
      showToast('Client updated!', 'success');
    }
  } else {
    const saved = await insertClient(fields);
    if (saved) {
      clients.unshift(saved);
      showToast(`${fields.first_name} ${fields.last_name} added!`, 'success');
    }
  }

  btn.textContent = idVal ? 'Update Client' : 'Save Client';
  btn.disabled = false;
  closeAddModal();
  applyFiltersAndRender();
}

// ─── Delete ───────────────────────────────────────────
async function deleteClient(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Delete ${c.first_name} ${c.last_name}? This cannot be undone.`)) return;

  const ok = await deleteClientDB(id);
  if (ok) {
    clients = clients.filter(x => x.id !== id);
    selectedIds.delete(id);
    applyFiltersAndRender();
    showToast('Client deleted', 'info');
  }
}

async function deleteSelected() {
  if (selectedIds.size === 0) return;
  const count = selectedIds.size;
  if (!confirm(`Delete ${count} selected client(s)? This cannot be undone.`)) return;

  const ids = [...selectedIds];
  const { error } = await db.from('clients').delete().in('id', ids);
  if (error) { showToast('Error deleting: ' + error.message, 'error'); return; }

  clients = clients.filter(c => !selectedIds.has(c.id));
  selectedIds.clear();
  applyFiltersAndRender();
  showToast(`${count} client(s) deleted`, 'info');
}

// ─── Selection UI ─────────────────────────────────────
function updateSelectionUI() {
  const count = selectedIds.size;
  document.getElementById('selectedCount').textContent    = count;
  document.getElementById('emailSelectedBtn').disabled    = count === 0;
  document.getElementById('deleteSelectedBtn').disabled   = count === 0;
  document.getElementById('selectAll').checked =
    filteredClients.length > 0 && filteredClients.every(c => selectedIds.has(c.id));
}

// ─── LinkedIn CSV Import ──────────────────────────────
function openImportModal() {
  pendingImport = [];
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('dropZone').style.display      = 'block';
  document.getElementById('csvFileInput').value          = '';
  document.getElementById('importModal').style.display   = 'flex';
}

function closeImportModal() {
  document.getElementById('importModal').style.display = 'none';
}

function cancelImport() {
  pendingImport = [];
  closeImportModal();
}

function handleCSVFile(e) {
  const file = e.target.files[0];
  if (file) parseCSV(file);
}

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSVText(e.target.result);
    if (rows.length < 2) {
      showToast('Could not read the file — make sure it is the LinkedIn Connections.csv export.', 'error');
      return;
    }

    // LinkedIn header: First Name, Last Name, URL, Email Address, Company, Position, Connected On
    const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, ' ').replace(/"/g, ''));
    const idx = {
      firstName: findCol(header, ['first name', 'firstname', 'first']),
      lastName:  findCol(header, ['last name',  'lastname',  'last']),
      email:     findCol(header, ['email address', 'email', 'e-mail']),
      company:   findCol(header, ['company', 'organization']),
      position:  findCol(header, ['position', 'title', 'job title']),
    };

    if (idx.firstName === -1 && idx.lastName === -1) {
      showToast('Could not find name columns. Make sure this is the LinkedIn Connections CSV.', 'error');
      return;
    }

    pendingImport = rows.slice(1)
      .filter(r => r.some(c => c.trim() !== ''))
      .map(r => ({
        firstName: getCol(r, idx.firstName),
        lastName:  getCol(r, idx.lastName),
        email:     getCol(r, idx.email).toLowerCase(),
        company:   getCol(r, idx.company),
        position:  getCol(r, idx.position),
      }))
      .filter(c => c.firstName || c.lastName);

    showPreview();
  };
  reader.readAsText(file);
}

function findCol(header, names) {
  for (const n of names) { const i = header.indexOf(n); if (i !== -1) return i; }
  return -1;
}
function getCol(row, idx) {
  if (idx === -1 || idx >= row.length) return '';
  return row[idx].trim().replace(/^"|"$/g, '');
}

function showPreview() {
  document.getElementById('previewCount').textContent    = pendingImport.length;
  document.getElementById('dropZone').style.display      = 'none';
  document.getElementById('importPreview').style.display = 'block';

  document.getElementById('previewTableBody').innerHTML =
    pendingImport.slice(0, 100).map(c => `
      <tr>
        <td>${escHtml(c.firstName)}</td>
        <td>${escHtml(c.lastName)}</td>
        <td>${escHtml(c.email)  || '<span style="color:#9ca3af">—</span>'}</td>
        <td>${escHtml(c.company)|| '<span style="color:#9ca3af">—</span>'}</td>
        <td>${escHtml(c.position)||'<span style="color:#9ca3af">—</span>'}</td>
      </tr>`).join('')
    + (pendingImport.length > 100
      ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:.75rem">…and ${pendingImport.length - 100} more</td></tr>`
      : '');
}

async function confirmImport() {
  if (pendingImport.length === 0) return;
  const btn = document.getElementById('confirmImport');
  btn.textContent = 'Importing...';
  btn.disabled = true;

  // Deduplicate against existing emails
  const existingEmails = new Set(clients.map(c => c.email).filter(Boolean));
  const existingNames  = new Set(clients.map(c => `${c.first_name}|${c.last_name}`));

  const newRows = pendingImport
    .filter(c => {
      if (c.email && existingEmails.has(c.email)) return false;
      if (existingNames.has(`${c.firstName}|${c.lastName}`)) return false;
      return true;
    })
    .map(c => ({
      first_name: c.firstName,
      last_name:  c.lastName,
      email:      c.email || null,
      phone:      null,
      status:     'New Lead',
      source:     'LinkedIn',
      notes:      [c.position, c.company].filter(Boolean).join(' at ') || null,
    }));

  if (newRows.length === 0) {
    showToast('All contacts already exist — nothing new to import.', 'info');
    btn.textContent = 'Import All Contacts';
    btn.disabled = false;
    closeImportModal();
    return;
  }

  const inserted = await bulkInsertClients(newRows);
  clients = [...inserted, ...clients];
  applyFiltersAndRender();
  closeImportModal();
  showToast(`${inserted.length} LinkedIn contact${inserted.length !== 1 ? 's' : ''} imported!`, 'success');

  btn.textContent = 'Import All Contacts';
  btn.disabled = false;
  pendingImport = [];
}

// ─── CSV Parser ───────────────────────────────────────
function parseCSVText(text) {
  const rows = [];
  let row = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++;
        row.push(field); field = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length) { row.push(field); if (row.some(c => c !== '')) rows.push(row); }
  return rows;
}

// ─── Email Outreach ───────────────────────────────────
function openComposePanel() {
  const selected = clients.filter(c => selectedIds.has(c.id));
  const withEmail = selected.filter(c => c.email);

  if (withEmail.length === 0) {
    showToast('None of the selected contacts have email addresses.', 'error');
    return;
  }

  const noEmail = selected.filter(c => !c.email);
  let toText = withEmail.map(c => c.email).join(', ');
  if (noEmail.length > 0) toText += ` (${noEmail.length} skipped — no email)`;

  document.getElementById('composeTo').textContent = `To: ${toText}`;
  document.getElementById('composePanel').style.display = 'block';
  document.getElementById('composePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openSingleEmail(client) {
  selectedIds.clear();
  selectedIds.add(client.id);
  updateSelectionUI();
  openComposePanel();
}

async function sendBulkEmail() {
  const selected = clients.filter(c => selectedIds.has(c.id) && c.email);
  if (selected.length === 0) { showToast('No email addresses available.', 'error'); return; }

  const subject = encodeURIComponent(document.getElementById('emailSubject').value.trim());
  const body    = encodeURIComponent(document.getElementById('emailBody').value.trim());

  if (selected.length > 50) {
    const batches = [];
    for (let i = 0; i < selected.length; i += 50)
      batches.push(selected.slice(i, i + 50).map(c => c.email).join(','));
    alert(
      `You have ${selected.length} recipients. Here are ${batches.length} batches to paste into BCC:\n\n` +
      batches.map((b, i) => `Batch ${i + 1}:\n${b}`).join('\n\n')
    );
    return;
  }

  const bcc = selected.map(c => encodeURIComponent(c.email)).join(',');
  window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;

  // Update "New Lead" → "Contacted"
  const toUpdate = selected.filter(c => c.status === 'New Lead').map(c => c.id);
  if (toUpdate.length > 0) {
    await updateStatusBatch(toUpdate, 'Contacted');
    toUpdate.forEach(id => {
      const idx = clients.findIndex(c => c.id === id);
      if (idx !== -1) clients[idx].status = 'Contacted';
    });
    applyFiltersAndRender();
  }

  showToast(`Email client opened for ${selected.length} recipient(s). Statuses updated.`, 'success');
}

function copyEmailBody() {
  const body = document.getElementById('emailBody').value;
  navigator.clipboard.writeText(body)
    .then(() => showToast('Copied to clipboard!', 'success'))
    .catch(() => showToast('Could not copy — please select and copy manually.', 'error'));
}

// ─── Notes Modal ──────────────────────────────────────
function openNotesModal(client) {
  document.getElementById('notesModalTitle').textContent = `Notes — ${client.first_name} ${client.last_name}`;
  document.getElementById('notesModalContent').innerHTML =
    `<p>${escHtml(client.notes).replace(/\n/g, '<br/>')}</p>`;
  document.getElementById('notesModal').style.display = 'flex';
}

// ─── Export CSV ───────────────────────────────────────
function exportCSV() {
  const data = filteredClients.length ? filteredClients : clients;
  if (!data.length) { showToast('No clients to export.', 'error'); return; }

  const headers = ['First Name','Last Name','Phone','Email','Status','Source','Notes','Date Added'];
  const rows = data.map(c => [
    c.first_name, c.last_name, c.phone, c.email,
    c.status, c.source, c.notes,
    c.created_at ? new Date(c.created_at).toLocaleDateString() : ''
  ].map(v => `"${(v || '').replace(/"/g, '""')}"`));

  const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `brady-wells-clients-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${data.length} client(s)`, 'success');
}

// ─── Toast ────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ─── Utility ──────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
