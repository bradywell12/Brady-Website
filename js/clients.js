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

  const callF = document.getElementById('callFilter').value;

  filteredClients = clients.filter(c => {
    const matchSearch =
      !search ||
      (c.first_name || '').toLowerCase().includes(search) ||
      (c.last_name  || '').toLowerCase().includes(search) ||
      (c.email      || '').toLowerCase().includes(search) ||
      (c.phone      || '').toLowerCase().includes(search);
    const matchStatus = !statusF || c.status === statusF;
    const matchSource = !sourceF || c.source === sourceF;
    const matchCall   = !callF ||
      (callF === 'not_called' && !c.last_called) ||
      (callF === 'called'     &&  c.last_called);
    return matchSearch && matchStatus && matchSource && matchCall;
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
      <td style="white-space:nowrap">
        ${c.phone
          ? `<a href="tel:${escHtml(c.phone)}" style="color:var(--text)">${escHtml(c.phone)}</a>`
          : '<span style="color:#9ca3af">—</span>'}
      </td>
      <td>${c.email
        ? `<a href="mailto:${escHtml(c.email)}" style="color:var(--accent)">${escHtml(c.email)}</a>`
        : '<span style="color:#9ca3af">—</span>'}</td>
      <td>${statusBadge(c.status)}</td>
      <td style="white-space:nowrap;font-size:0.82rem">
        ${c.last_called
          ? `<span style="color:#16a34a;font-weight:600">&#10003; ${new Date(c.last_called).toLocaleDateString()}</span>`
          : '<span style="color:#9ca3af">Not called</span>'}
      </td>
      <td>${sourceBadge(c.source)}</td>
      <td>
        <div class="row-actions">
          ${c.phone
            ? `<button class="action-btn call-btn" title="Call ${escHtml(c.first_name)}" data-id="${c.id}">&#128222;</button>`
            : ''}
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
  tbody.querySelectorAll('.action-btn.call-btn').forEach(btn =>
    btn.addEventListener('click', () => openCallModal(parseInt(btn.dataset.id))));

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
  document.getElementById('statNotCalled').textContent = clients.filter(c => !c.last_called).length;
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
  document.getElementById('callFilter').addEventListener('change', applyFiltersAndRender);

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
    if (file?.name.endsWith('.vcf') || file?.name.endsWith('.vcard')) parseVCF(file);
    else if (file?.name.endsWith('.csv')) parseCSV(file);
    else showToast('Please upload a .vcf or .csv file', 'error');
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

  // Call modal
  bindCallModal();

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
  if (!file) return;
  if (file.name.endsWith('.vcf') || file.name.endsWith('.vcard')) {
    parseVCF(file);
  } else {
    parseCSV(file);
  }
}

// ─── vCard (.vcf) Parser — handles iPhone/iCloud exports ─
function parseVCF(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    // Split into individual vCards
    const cards = text.split(/END:VCARD/i).filter(c => c.trim());

    pendingImport = cards.map(card => {
      // Normalize line endings and unfold folded lines
      const c = card
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n[ \t]/g, ''); // unfold RFC 6350 folded lines

      const get = (field) => {
        const regex = new RegExp(`(?:item\\d+\\.)?${field}[^:\\n]*:([^\\n]+)`, 'i');
        const match = c.match(regex);
        return match ? match[1].trim() : '';
      };
      card = c;

      // Name — try N field first (Last;First;Middle;;), then FN (full name)
      let firstName = '', lastName = '';
      const nField = get('N');
      if (nField) {
        const parts = nField.split(';');
        lastName  = (parts[0] || '').trim();
        firstName = (parts[1] || '').trim();
      }
      if (!firstName && !lastName) {
        const fn = get('FN');
        if (fn) {
          const parts = fn.split(' ');
          firstName = parts[0] || '';
          lastName  = parts.slice(1).join(' ') || '';
        }
      }

      // Phone — catch every TEL variation iPhone uses
      // Normalize line endings first, then try multiple patterns
      const normalizedCard = card.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const telMatch =
        normalizedCard.match(/(?:item\d+\.)?TEL[^:\n]*:([^\n]+)/i) ||
        normalizedCard.match(/TEL[^:\n]*:([^\n]+)/i) ||
        normalizedCard.match(/TEL:([^\n]+)/i);
      const phone = telMatch ? telMatch[1].trim().replace(/\s+/g, '') : '';

      // Email — grab first EMAIL value
      const emailMatch = card.match(/^EMAIL[^:]*:(.+)$/im);
      const email = emailMatch ? emailMatch[1].trim().toLowerCase() : '';

      // Company
      const company = get('ORG').split(';')[0].trim();

      // Title
      const position = get('TITLE');

      return { firstName, lastName, phone, email, company, position };
    }).filter(c => c.firstName || c.lastName);

    if (pendingImport.length === 0) {
      showToast('No contacts found in this vCard file.', 'error');
      return;
    }

    showPreview();
  };
  reader.readAsText(file);
}

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSVText(e.target.result);
    if (rows.length < 2) {
      showToast('Could not read the file — make sure it is a CSV file.', 'error');
      return;
    }

    const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, ' ').replace(/"/g, ''));

    // Supports: LinkedIn, iPhone/iCloud, Google Contacts, or any generic CSV
    const idx = {
      firstName: findCol(header, [
        'first name', 'firstname', 'first',
        'given name',                          // Google Contacts
        'name'                                 // fallback single-name column
      ]),
      lastName: findCol(header, [
        'last name', 'lastname', 'last',
        'family name', 'surname',              // Google Contacts
      ]),
      phone: findCol(header, [
        'phone', 'phone number', 'mobile', 'mobile phone',
        'phone 1 - value', 'phone 2 - value', // Google Contacts
        'home phone', 'work phone', 'iphone',
        'primary phone',
      ]),
      email: findCol(header, [
        'email address', 'email', 'e-mail',
        'e-mail address',                      // Google Contacts
        'email 1 - value',                     // Google Contacts
      ]),
      company: findCol(header, [
        'company', 'organization', 'org',
        'company name',
      ]),
      position: findCol(header, [
        'position', 'title', 'job title', 'role', 'department',
      ]),
    };

    // If we still can't find a name column, show the raw headers to help debug
    if (idx.firstName === -1 && idx.lastName === -1) {
      showToast(`Could not find a name column. Columns found: ${header.join(', ')}`, 'error');
      return;
    }

    pendingImport = rows.slice(1)
      .filter(r => r.some(c => c.trim() !== ''))
      .map(r => {
        let firstName = getCol(r, idx.firstName);
        let lastName  = getCol(r, idx.lastName);

        // If only a single "Name" column exists, split on the first space
        if (firstName && idx.lastName === -1) {
          const parts = firstName.split(' ');
          firstName = parts[0];
          lastName  = parts.slice(1).join(' ');
        }

        return {
          firstName,
          lastName,
          phone:    getCol(r, idx.phone),
          email:    getCol(r, idx.email).toLowerCase(),
          company:  getCol(r, idx.company),
          position: getCol(r, idx.position),
        };
      })
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
        <td>${escHtml(c.phone)  || '<span style="color:#9ca3af">—</span>'}</td>
        <td>${escHtml(c.email)  || '<span style="color:#9ca3af">—</span>'}</td>
        <td>${escHtml(c.company)|| '<span style="color:#9ca3af">—</span>'}</td>
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
      email:      c.email    || null,
      phone:      c.phone    || null,
      status:     'New Lead',
      source:     c.company || c.position ? 'LinkedIn' : 'Manual Entry',
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
document.addEventListener('DOMContentLoaded', () => {
  if (typeof emailjs !== 'undefined') emailjs.init(EJS_PUBLIC_KEY);
});

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

// Wraps emailjs.send with a 10-second timeout so it never hangs forever
function sendWithTimeout(serviceId, templateId, params) {
  return Promise.race([
    emailjs.send(serviceId, templateId, params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out after 10s')), 10000)
    )
  ]);
}

async function sendBulkEmail() {
  const selected = clients.filter(c => selectedIds.has(c.id) && c.email);
  if (selected.length === 0) { showToast('No email addresses available.', 'error'); return; }

  // Guard: warn if keys are still placeholders
  if (EJS_SERVICE_ID.startsWith('PASTE') || EJS_OUTREACH_TEMPLATE.startsWith('PASTE') || EJS_PUBLIC_KEY.startsWith('PASTE')) {
    showToast('EmailJS keys are not set up yet. Open js/supabase-config.js and fill in your keys.', 'error');
    return;
  }

  const subject = document.getElementById('emailSubject').value.trim();
  const body    = document.getElementById('emailBody').value.trim();
  const btn     = document.getElementById('sendEmailBtn');

  btn.textContent = `Sending 0 / ${selected.length}...`;
  btn.disabled = true;

  let sent = 0, failed = 0;

  try {
    for (const client of selected) {
      const personalizedBody = body.replace(/\[First Name\]/gi, client.first_name || 'there');

      try {
        await sendWithTimeout(EJS_SERVICE_ID, EJS_OUTREACH_TEMPLATE, {
          to_email: client.email,
          to_name:  `${client.first_name || ''} ${client.last_name || ''}`.trim(),
          subject:  subject,
          message:  personalizedBody,
        });
        sent++;
      } catch (err) {
        console.warn(`Failed to send to ${client.email}:`, err);
        failed++;
      }

      btn.textContent = `Sending ${sent + failed} / ${selected.length}...`;
    }

    // Update "New Lead" → "Contacted"
    const toUpdate = selected.slice(0, sent).filter(c => c.status === 'New Lead').map(c => c.id);
    if (toUpdate.length > 0) {
      await updateStatusBatch(toUpdate, 'Contacted');
      toUpdate.forEach(id => {
        const idx = clients.findIndex(c => c.id === id);
        if (idx !== -1) clients[idx].status = 'Contacted';
      });
      applyFiltersAndRender();
    }

    if (failed === 0) {
      showToast(`${sent} email${sent !== 1 ? 's' : ''} sent successfully!`, 'success');
    } else {
      showToast(`${sent} sent, ${failed} failed — check browser console for details.`, 'error');
    }
  } finally {
    // Always re-enable the button no matter what
    btn.textContent = 'Send Emails';
    btn.disabled = false;
  }
}

function copyEmailBody() {
  const body = document.getElementById('emailBody').value;
  navigator.clipboard.writeText(body)
    .then(() => showToast('Copied to clipboard!', 'success'))
    .catch(() => showToast('Could not copy — please select and copy manually.', 'error'));
}

// ─── Call Modal ───────────────────────────────────────
let callTargetId = null;

function openCallModal(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  callTargetId = id;

  document.getElementById('callModalTitle').textContent = `Call — ${c.first_name} ${c.last_name}`;
  document.getElementById('callNotes').value = '';
  document.getElementById('callOutcome').value = 'Contacted';
  document.getElementById('callModal').style.display = 'flex';

  // Dial immediately on mobile / FaceTime on desktop
  if (c.phone) window.location.href = `tel:${c.phone}`;
}

function bindCallModal() {
  document.getElementById('closeCallModal').addEventListener('click', () => {
    document.getElementById('callModal').style.display = 'none';
  });
  document.getElementById('cancelCallModal').addEventListener('click', () => {
    document.getElementById('callModal').style.display = 'none';
  });
  document.getElementById('saveCallBtn').addEventListener('click', saveCallLog);
  document.getElementById('callModal').addEventListener('click', e => {
    if (e.target.id === 'callModal') document.getElementById('callModal').style.display = 'none';
  });
}

async function saveCallLog() {
  if (!callTargetId) return;
  const btn = document.getElementById('saveCallBtn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const outcome  = document.getElementById('callOutcome').value;
  const newNotes = document.getElementById('callNotes').value.trim();
  const now      = new Date().toISOString();

  const c = clients.find(x => x.id === callTargetId);
  const updatedNotes = newNotes
    ? (c.notes ? c.notes + '\n\n' : '') + `[Call ${new Date().toLocaleDateString()}] ${newNotes}`
    : c.notes;

  const ok = await updateClientDB(callTargetId, {
    status:      outcome,
    last_called: now,
    notes:       updatedNotes || null,
  });

  if (ok) {
    const idx = clients.findIndex(x => x.id === callTargetId);
    if (idx !== -1) {
      clients[idx].status      = outcome;
      clients[idx].last_called = now;
      clients[idx].notes       = updatedNotes || null;
    }
    showToast('Call logged!', 'success');
    applyFiltersAndRender();
  }

  btn.textContent = 'Save Call Log';
  btn.disabled = false;
  document.getElementById('callModal').style.display = 'none';
  callTargetId = null;
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
