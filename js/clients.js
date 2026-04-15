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

// LinkedIn state
let linkedinContacts = [];
let pendingLinkedIn = [];

// ─── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  showTableLoading(true);
  await loadClients();
  showTableLoading(false);
  applyFiltersAndRender();
  bindEvents();
  bindLinkedInTab();
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
  const { data: { user } } = await db.auth.getUser();
  const { data, error } = await db
    .from('clients')
    .insert([{ ...fields, user_id: user.id }])
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
  const { data: { user } } = await db.auth.getUser();
  const rowsWithUser = rows.map(r => ({ ...r, user_id: user.id }));

  const BATCH = 50;
  const inserted = [];
  for (let i = 0; i < rowsWithUser.length; i += BATCH) {
    const chunk = rowsWithUser.slice(i, i + BATCH);
    const { data, error } = await db.from('clients').insert(chunk).select();
    if (error) { showToast('Import error: ' + error.message, 'error'); return inserted; }
    if (data) inserted.push(...data);
  }
  return inserted;
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

  const callF   = document.getElementById('callFilter').value;
  const marketF = document.getElementById('marketFilter').value;

  filteredClients = clients.filter(c => {
    const matchSearch =
      !search ||
      (c.first_name   || '').toLowerCase().includes(search) ||
      (c.last_name    || '').toLowerCase().includes(search) ||
      (c.email        || '').toLowerCase().includes(search) ||
      (c.phone        || '').toLowerCase().includes(search) ||
      (c.market_type  || '').toLowerCase().includes(search);
    const matchStatus = !statusF || c.status === statusF;
    const matchSource = !sourceF || c.source === sourceF;
    const matchCall   = !callF ||
      (callF === 'not_called' && !c.last_called) ||
      (callF === 'called'     &&  c.last_called);
    const matchMarket = !marketF || c.market_type === marketF;
    return matchSearch && matchStatus && matchSource && matchCall && matchMarket;
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
      <td>${statusBadge(c.status)}</td>
      <td>
        <select class="market-inline-select ${c.market_type ? 'has-value' : ''}" data-id="${c.id}">
          <option value="">—</option>
          <option value="Young Professional" ${c.market_type === 'Young Professional' ? 'selected' : ''}>Young Professional</option>
          <option value="Established"        ${c.market_type === 'Established'        ? 'selected' : ''}>Established</option>
          <option value="Retirement"         ${c.market_type === 'Retirement'         ? 'selected' : ''}>Retirement</option>
        </select>
      </td>
      <td style="white-space:nowrap;font-size:0.82rem">
        ${c.last_called
          ? `<span style="color:#16a34a;font-weight:600">&#10003; ${new Date(c.last_called).toLocaleDateString()}</span>`
          : '<span style="color:#9ca3af">Not called</span>'}
      </td>
      <td class="col-source">${sourceBadge(c.source)}</td>
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

  tbody.querySelectorAll('.market-inline-select').forEach(sel =>
    sel.addEventListener('change', async e => {
      const id = parseInt(e.target.dataset.id);
      const val = e.target.value || null;
      await updateClientDB(id, { market_type: val });
      const c = clients.find(x => x.id === id);
      if (c) c.market_type = val;
      e.target.className = 'market-inline-select' + (val ? ' has-value' : '');
    }));
}

function renderStats(tab = 'clients') {
  const clientBox   = document.getElementById('statClientBox');
  const notCalledBox = document.getElementById('statNotCalledBox');

  if (tab === 'linkedin') {
    document.getElementById('labelTotal').textContent     = 'LinkedIn Connections';
    document.getElementById('labelNew').textContent       = 'Not Contacted';
    document.getElementById('labelContacted').textContent = 'Contacted';
    document.getElementById('statTotal').textContent      = linkedinContacts.length;
    document.getElementById('statNew').textContent        = linkedinContacts.filter(c => !c.contacted_at).length;
    document.getElementById('statContacted').textContent  = linkedinContacts.filter(c => c.contacted_at).length;
    clientBox.style.display   = 'none';
    notCalledBox.style.display = 'none';
  } else {
    document.getElementById('labelTotal').textContent     = 'Total Contacts';
    document.getElementById('labelNew').textContent       = 'New Leads';
    document.getElementById('labelContacted').textContent = 'Contacted';
    document.getElementById('statTotal').textContent      = clients.length;
    document.getElementById('statNew').textContent        = clients.filter(c => c.status === 'New Lead').length;
    document.getElementById('statContacted').textContent  = clients.filter(c => c.status === 'Contacted' || c.status === 'Meeting Scheduled').length;
    document.getElementById('statClient').textContent     = clients.filter(c => c.status === 'Active Client').length;
    document.getElementById('statNotCalled').textContent  = clients.filter(c => !c.last_called).length;
    clientBox.style.display   = '';
    notCalledBox.style.display = '';
  }
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

function normalizeMarket(raw) {
  if (!raw) return null;
  const m = raw.toLowerCase();
  if (m.includes('young')) return 'Young Professional';
  if (m.includes('established')) return 'Established';
  if (m.includes('retirement')) return 'Retirement';
  return null;
}

function marketBadge(market) {
  if (!market) return '<span style="color:#9ca3af;font-size:0.78rem">—</span>';
  const map = {
    'Young Professional': 'market-young',
    'Established':        'market-established',
    'Retirement':         'market-retirement',
  };
  return `<span class="market-badge ${map[market] || ''}">${escHtml(market)}</span>`;
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
  document.getElementById('marketFilter').addEventListener('change', applyFiltersAndRender);

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

  // Import pane inside Add Client modal
  document.getElementById('emptyImportBtn')?.addEventListener('click', () => { openAddModal(); switchAddTab('import'); });
  document.getElementById('cancelAddModal2').addEventListener('click', closeAddModal);
  document.getElementById('confirmImport2').addEventListener('click', confirmImport2);
  document.getElementById('csvFileInput2').addEventListener('change', handleCSVFile2);

  // Old import modal (kept for any remaining references)
  document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
  document.getElementById('cancelImport').addEventListener('click', cancelImport);
  document.getElementById('confirmImport').addEventListener('click', confirmImport);
  document.getElementById('csvFileInput').addEventListener('change', handleCSVFile);

  // Drag & drop (original drop zone in old import modal)
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

  // Remove duplicates button
  document.getElementById('removeDupsBtn').addEventListener('click', removeDuplicates);

  // Call modal
  bindCallModal();

  // Outreach tab
  bindOutreachTab();

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
  document.getElementById('modalTitle').textContent    = 'Add Client';
  document.getElementById('saveClientBtn').textContent = 'Save Client';
  document.getElementById('editClientId').value        = '';
  document.getElementById('clientForm').reset();
  switchAddTab('manual');
  document.getElementById('addModal').style.display = 'flex';
}

function switchAddTab(tab) {
  const isManual = tab === 'manual';
  document.getElementById('addPaneManual').style.display = isManual ? '' : 'none';
  document.getElementById('addPaneImport').style.display = isManual ? 'none' : 'block';

  const btnManual = document.getElementById('addTabManual');
  const btnImport = document.getElementById('addTabImport');
  btnManual.style.borderBottomColor = isManual ? 'var(--gold)' : 'transparent';
  btnManual.style.color = isManual ? 'var(--navy)' : 'var(--text-muted)';
  btnManual.style.fontWeight = isManual ? '600' : '500';
  btnImport.style.borderBottomColor = isManual ? 'transparent' : 'var(--gold)';
  btnImport.style.color = isManual ? 'var(--text-muted)' : 'var(--navy)';
  btnImport.style.fontWeight = isManual ? '500' : '600';

  if (!isManual) {
    // Reset import pane state
    pendingImport = [];
    document.getElementById('importPreview2').style.display = 'none';
    document.getElementById('dropZone2').style.display      = 'block';
    document.getElementById('csvFileInput2').value          = '';
    document.getElementById('confirmImport2').disabled      = true;
    // Wire drag & drop each time pane opens
    const dz = document.getElementById('dropZone2');
    dz.ondragover  = e => { e.preventDefault(); dz.classList.add('drag-over'); };
    dz.ondragleave = () => dz.classList.remove('drag-over');
    dz.ondrop      = e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleCSVFile2({ target: { files: [file] } });
    };
  }
}

function handleCSVFile2(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.name.endsWith('.vcf') || file.name.endsWith('.vcard')) {
    parseVCF(file, true);
  } else if (file.name.endsWith('.csv')) {
    parseCSV(file, true);
  } else {
    showToast('Please upload a .vcf or .csv file', 'error');
  }
}

async function confirmImport2() {
  if (!pendingImport.length) return;
  const btn = document.getElementById('confirmImport2');
  btn.textContent = 'Importing...';
  btn.disabled = true;
  const inserted = await bulkInsertClients(pendingImport);
  if (inserted.length) {
    clients.unshift(...inserted);
    applyFiltersAndRender();
    showToast(`Imported ${inserted.length} contact${inserted.length !== 1 ? 's' : ''}!`, 'success');
    closeAddModal();
  }
  btn.textContent = 'Import All';
  btn.disabled = false;
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
  document.getElementById('cfStatus').value    = c.status      || 'New Lead';
  document.getElementById('cfSource').value    = c.source      || 'Manual Entry';
  document.getElementById('cfMarket').value    = c.market_type || '';
  document.getElementById('cfNotes').value     = c.notes       || '';
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
    first_name:  document.getElementById('cfFirstName').value.trim(),
    last_name:   document.getElementById('cfLastName').value.trim(),
    phone:       document.getElementById('cfPhone').value.trim(),
    email:       document.getElementById('cfEmail').value.trim().toLowerCase(),
    status:      document.getElementById('cfStatus').value,
    source:      document.getElementById('cfSource').value,
    market_type: document.getElementById('cfMarket').value || null,
    notes:       document.getElementById('cfNotes').value.trim(),
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
let importPane2 = false; // true when using the Import CSV tab inside Add Client modal

function parseVCF(file, pane2 = false) {
  importPane2 = pane2;
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

      const cleaned = cleanName(firstName, lastName);
      return { firstName: cleaned.first, lastName: cleaned.last, phone, email, company, position };
    }).filter(c => c.firstName || c.lastName);

    if (pendingImport.length === 0) {
      showToast('No contacts found in this vCard file.', 'error');
      return;
    }

    showPreview();
  };
  reader.readAsText(file);
}

function parseCSV(file, pane2 = false) {
  importPane2 = pane2;
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
        'primary phone type', 'primary phone',
        'mobile phone', 'mobile', 'cell phone', 'cell',
        'home phone', 'business phone', 'work phone',
        'phone', 'phone number',
        'phone 1 - value', 'phone 2 - value', // Google Contacts
        'iphone',
      ]),
      email: findCol(header, [
        'email address', 'email', 'e-mail',
        'e-mail address',                      // Google Contacts
        'email 1 - value',                     // Google Contacts
      ]),
      company:    findCol(header, ['employer', 'company', 'organization', 'org', 'company name']),
      position:   findCol(header, ['job title', 'position', 'title', 'role', 'department']),
      marketType: findCol(header, ['market type', 'market', 'category', 'type']),
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

        const cleaned = cleanName(firstName, lastName);
        return {
          firstName:  cleaned.first,
          lastName:   cleaned.last,
          phone:      getCol(r, idx.phone),
          email:      getCol(r, idx.email).toLowerCase(),
          company:    getCol(r, idx.company),
          position:   getCol(r, idx.position),
          marketType: getCol(r, idx.marketType),
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
  const rowsHtml = pendingImport.slice(0, 100).map(c => `
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

  if (importPane2) {
    document.getElementById('dropZone2').style.display       = 'none';
    document.getElementById('importPreview2').style.display  = 'block';
    document.getElementById('importCount2').textContent      = `${pendingImport.length} contacts ready to import`;
    document.getElementById('importPreviewBody2').innerHTML  = rowsHtml;
    document.getElementById('confirmImport2').disabled       = false;
  } else {
    document.getElementById('previewCount').textContent      = pendingImport.length;
    document.getElementById('dropZone').style.display        = 'none';
    document.getElementById('importPreview').style.display   = 'block';
    document.getElementById('previewTableBody').innerHTML    = rowsHtml;
  }
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
      first_name:  c.firstName,
      last_name:   c.lastName,
      email:       c.email      || null,
      phone:       c.phone      || null,
      status:      'New Lead',
      source:      c.company || c.position ? 'LinkedIn' : 'Manual Entry',
      market_type: normalizeMarket(c.marketType),
      notes:       [c.position, c.company].filter(Boolean).join(' at ') || null,
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

// ─── Portal Tab Switching ─────────────────────────────
function switchPortalTab(tab) {
  document.getElementById('tabClients').classList.toggle('active',  tab === 'clients');
  document.getElementById('tabLinkedin').classList.toggle('active', tab === 'linkedin');

  const clientEls = [
    document.querySelector('.crm-toolbar'),
    document.querySelector('.table-wrap'),
  ];
  clientEls.forEach(el => { if (el) el.style.display = tab === 'clients' ? '' : 'none'; });
  // Always keep composePanel hidden on tab switch — only opens via Email Selected button
  const composePanel = document.getElementById('composePanel');
  if (composePanel) composePanel.style.display = 'none';
  document.getElementById('outreachTab').style.display = tab === 'linkedin' ? 'block' : 'none';

  if (tab === 'linkedin') {
    if (linkedinContacts.length === 0) {
      loadLinkedIn().then(() => { renderLinkedInTable(); renderStats('linkedin'); });
    } else {
      renderStats('linkedin');
    }
  } else {
    renderStats('clients');
  }
}

// ─── Email Outreach Tab ───────────────────────────────
let outreachSelected = new Set(); // keys like "c:123" or "li:456"

function resolveOutreachContact(key) {
  const [type, id] = key.split(':');
  const numId = parseInt(id);
  return type === 'li'
    ? linkedinContacts.find(x => x.id === numId)
    : clients.find(x => x.id === numId);
}

function renderOutreachList() {
  const search = (document.getElementById('outreachSearch').value || '').toLowerCase();
  const list   = document.getElementById('outreachContactList');

  // Merge clients + LinkedIn contacts, dedupe by email
  const seenEmails = new Set();
  const allContacts = [];

  for (const c of clients) {
    const key = `c:${c.id}`;
    const email = (c.email || '').toLowerCase();
    if (email) seenEmails.add(email);
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    if (!search || name.includes(search) || email.includes(search)) {
      allContacts.push({ key, c, badge: 'Client' });
    }
  }
  for (const c of linkedinContacts) {
    const key = `li:${c.id}`;
    const email = (c.email || '').toLowerCase();
    // Skip if same email already in clients
    if (email && seenEmails.has(email)) continue;
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    if (!search || name.includes(search) || email.includes(search)) {
      allContacts.push({ key, c, badge: 'LinkedIn' });
    }
  }

  if (allContacts.length === 0) {
    list.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">No contacts found.</div>`;
    return;
  }

  list.innerHTML = allContacts.map(({ key, c, badge }) => `
    <div class="outreach-contact-item ${outreachSelected.has(key) ? 'selected' : ''}" data-key="${key}">
      <input type="checkbox" class="outreach-check" data-key="${key}"
             ${outreachSelected.has(key) ? 'checked' : ''}
             ${!c.email ? 'disabled' : ''} />
      <div class="outreach-contact-info">
        <div class="outreach-contact-name">
          ${escHtml(c.first_name || '')} ${escHtml(c.last_name || '')}
          <span style="font-size:0.7rem;color:var(--text-muted);margin-left:4px">${badge}</span>
        </div>
        ${c.email
          ? `<div class="outreach-contact-email">${escHtml(c.email)}</div>`
          : `<div class="outreach-no-email">No email on file</div>`}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.outreach-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const key = e.target.dataset.key;
      e.target.checked ? outreachSelected.add(key) : outreachSelected.delete(key);
      e.target.closest('.outreach-contact-item').classList.toggle('selected', e.target.checked);
      updateOutreachUI();
    });
  });

  list.querySelectorAll('.outreach-contact-item').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.type === 'checkbox') return;
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb && !cb.disabled) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
  });

  updateOutreachUI();
}

function updateOutreachUI() {
  const count = outreachSelected.size;
  document.getElementById('outreachSelectedCount').textContent = `${count} selected`;

  const pills = document.getElementById('outreachToPills');
  const selectedContacts = [...outreachSelected]
    .map(resolveOutreachContact)
    .filter(c => c && c.email);

  if (selectedContacts.length === 0) {
    pills.innerHTML = `<span style="color:var(--text-muted);font-size:0.85rem">Select contacts on the left</span>`;
    document.getElementById('outreachSendNote').textContent = 'Select contacts on the left then click Send Emails.';
  } else {
    pills.innerHTML = selectedContacts.map(c =>
      `<span class="outreach-pill">${escHtml(c.first_name)} ${escHtml(c.last_name)}</span>`
    ).join('');
    document.getElementById('outreachSendNote').textContent =
      `${selectedContacts.length} email${selectedContacts.length !== 1 ? 's' : ''} will be sent.`;
  }

  // Sync select-all checkbox
  const allWithEmail = [
    ...clients.map(c => `c:${c.id}`).filter(k => resolveOutreachContact(k)?.email),
    ...linkedinContacts.map(c => `li:${c.id}`).filter(k => resolveOutreachContact(k)?.email),
  ];
  document.getElementById('outreachSelectAll').checked =
    allWithEmail.length > 0 && allWithEmail.every(k => outreachSelected.has(k));
}

function bindOutreachTab() {
  document.getElementById('outreachSearch').addEventListener('input', renderOutreachList);

  document.getElementById('outreachSelectAll').addEventListener('change', e => {
    clients.filter(c => c.email).forEach(c =>
      e.target.checked ? outreachSelected.add(`c:${c.id}`) : outreachSelected.delete(`c:${c.id}`)
    );
    linkedinContacts.filter(c => c.email).forEach(c =>
      e.target.checked ? outreachSelected.add(`li:${c.id}`) : outreachSelected.delete(`li:${c.id}`)
    );
    renderOutreachList();
  });

  document.getElementById('outreachSendBtn').addEventListener('click', sendOutreachEmails);
  document.getElementById('outreachCopyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('outreachBody').value)
      .then(() => showToast('Message copied!', 'success'))
      .catch(() => showToast('Could not copy — please select manually.', 'error'));
  });
}

async function sendOutreachEmails() {
  const selected = [...outreachSelected].map(resolveOutreachContact).filter(c => c && c.email);
  if (selected.length === 0) { showToast('No contacts with emails selected.', 'error'); return; }

  if (EJS_SERVICE_ID.startsWith('PASTE') || EJS_OUTREACH_TEMPLATE.startsWith('PASTE')) {
    showToast('EmailJS keys are not set up yet.', 'error');
    return;
  }

  const subject = document.getElementById('outreachSubject').value.trim();
  const body    = document.getElementById('outreachBody').value.trim();
  const btn     = document.getElementById('outreachSendBtn');

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
          subject,
          message:  personalizedBody,
        });
        sent++;
      } catch (err) {
        console.warn(`Failed to send to ${client.email}:`, err);
        failed++;
      }
      btn.textContent = `Sending ${sent + failed} / ${selected.length}...`;
    }

    // Update status for clients (not LinkedIn contacts — they have no status field)
    const toUpdate = selected
      .slice(0, sent)
      .filter(c => c.status === 'New Lead' && clients.find(x => x.id === c.id))
      .map(c => c.id);
    if (toUpdate.length > 0) {
      await updateStatusBatch(toUpdate, 'Contacted');
      toUpdate.forEach(id => {
        const idx = clients.findIndex(c => c.id === id);
        if (idx !== -1) clients[idx].status = 'Contacted';
      });
    }

    if (failed === 0) showToast(`${sent} email${sent !== 1 ? 's' : ''} sent!`, 'success');
    else showToast(`${sent} sent, ${failed} failed.`, 'error');

    outreachSelected.clear();
    renderOutreachList();
  } finally {
    btn.textContent = 'Send Emails';
    btn.disabled = false;
  }
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

// ─── Remove Duplicates ────────────────────────────────
async function removeDuplicates() {
  const btn = document.getElementById('removeDupsBtn');
  btn.textContent = 'Scanning...';
  btn.disabled = true;

  // Make sure LinkedIn contacts are loaded even if tab hasn't been visited
  if (linkedinContacts.length === 0) await loadLinkedIn();

  // --- Clients: dedup by name+phone, name+email, or phone+email ---
  const clientsToDelete = [];
  const clientSeen = new Map();
  const clientsSorted = [...clients].sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );
  for (const c of clientsSorted) {
    const phone = (c.phone || '').replace(/\D/g, '');
    const email = (c.email || '').toLowerCase().trim();
    const first = (c.first_name || '').toLowerCase().trim();
    const last  = (c.last_name  || '').toLowerCase().trim();
    const isDup =
      (phone && clientSeen.has(`${first}|${last}|${phone}`)) ||
      (email && clientSeen.has(`${first}|${last}|${email}`)) ||
      (phone && email && clientSeen.has(`${phone}|${email}`));
    if (isDup) {
      clientsToDelete.push(c.id);
    } else {
      if (phone) clientSeen.set(`${first}|${last}|${phone}`, c.id);
      if (email) clientSeen.set(`${first}|${last}|${email}`, c.id);
      if (phone && email) clientSeen.set(`${phone}|${email}`, c.id);
    }
  }

  // --- LinkedIn: dedup by first+last name OR email ---
  const linkedinToDelete = [];
  const liSeen = new Map();
  const liSorted = [...linkedinContacts].sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );
  for (const c of liSorted) {
    const email = (c.email || '').toLowerCase().trim();
    const first = (c.first_name || '').toLowerCase().trim();
    const last  = (c.last_name  || '').toLowerCase().trim();
    const keyName  = `${first}|${last}`;
    const keyEmail = `email|${email}`;
    const isDup =
      liSeen.has(keyName) ||
      (email && liSeen.has(keyEmail));
    if (isDup) {
      linkedinToDelete.push(c.id);
    } else {
      liSeen.set(keyName, c.id);
      if (email) liSeen.set(keyEmail, c.id);
    }
  }

  const totalDups = clientsToDelete.length + linkedinToDelete.length;

  btn.textContent = 'Remove Duplicates';
  btn.disabled = false;

  if (totalDups === 0) {
    showToast('No duplicates found — all clean!', 'success');
    return;
  }

  const parts = [];
  if (clientsToDelete.length)  parts.push(`${clientsToDelete.length} client duplicate${clientsToDelete.length !== 1 ? 's' : ''}`);
  if (linkedinToDelete.length) parts.push(`${linkedinToDelete.length} LinkedIn duplicate${linkedinToDelete.length !== 1 ? 's' : ''}`);

  if (!confirm(`Found ${parts.join(' and ')}. Delete them and keep the originals?`)) return;

  btn.textContent = 'Deleting...';
  btn.disabled = true;

  let errMsg = null;

  if (clientsToDelete.length) {
    const { error } = await db.from('clients').delete().in('id', clientsToDelete);
    if (error) errMsg = error.message;
  }

  if (linkedinToDelete.length) {
    const { error } = await db.from('linkedin_contacts').delete().in('id', linkedinToDelete);
    if (error) errMsg = error.message;
  }

  btn.textContent = 'Remove Duplicates';
  btn.disabled = false;

  if (errMsg) {
    showToast('Error: ' + errMsg, 'error');
    return;
  }

  // Reload both lists to stay in sync
  await Promise.all([loadClients(), loadLinkedIn()]);
  applyFiltersAndRender();
  renderLinkedInTable();
  renderStats(document.getElementById('tabLinkedin').classList.contains('active') ? 'linkedin' : 'clients');
  showToast(`Removed ${totalDups} duplicate${totalDups !== 1 ? 's' : ''}!`, 'success');
}

// ─── Fix Parentheses in Existing Names ───────────────
async function fixParenthesesInNames() {
  const affected = clients.filter(c => /\(.*\)/.test(c.first_name || ''));
  if (affected.length === 0) {
    showToast('No names with () found — all clean!', 'info');
    return;
  }

  if (!confirm(`Found ${affected.length} contact(s) with () in their first name. Move the () to the last name field?`)) return;

  let fixed = 0;
  for (const c of affected) {
    const cleaned = cleanName(c.first_name, c.last_name);
    const ok = await updateClientDB(c.id, {
      first_name: cleaned.first,
      last_name:  cleaned.last,
    });
    if (ok) {
      const idx = clients.findIndex(x => x.id === c.id);
      if (idx !== -1) {
        clients[idx].first_name = cleaned.first;
        clients[idx].last_name  = cleaned.last;
      }
      fixed++;
    }
  }

  applyFiltersAndRender();
  showToast(`Fixed ${fixed} contact${fixed !== 1 ? 's' : ''}!`, 'success');
}

// ─── Name Cleanup ─────────────────────────────────────
// Moves parenthetical content from first name into last name
// e.g. "Wayne (Mazda)" → first: "Wayne", last: "(Mazda)"
// e.g. "Matt (Mazda) Smith" → first: "Matt", last: "Smith (Mazda)"
function cleanName(firstName, lastName) {
  const parenMatch = (firstName || '').match(/^(.*?)\s*(\(.*\))\s*$/);
  if (parenMatch) {
    const cleanFirst = parenMatch[1].trim();
    const paren      = parenMatch[2].trim();
    const cleanLast  = [lastName, paren].filter(Boolean).join(' ').trim();
    return { first: cleanFirst, last: cleanLast };
  }
  return { first: firstName || '', last: lastName || '' };
}

// ─── Utility ──────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Compose Email Toggle ─────────────────────────────
function toggleComposePanel() {
  const panel = document.getElementById('outreachCompose');
  const btn   = document.getElementById('composeEmailBtn');
  if (panel.style.display === 'flex') {
    panel.style.display = 'none';
    if (btn) btn.textContent = '\u2709 Compose Email';
  } else {
    panel.style.display = 'flex';
    if (btn) btn.textContent = '\u2715 Close Compose';
    // Load LinkedIn contacts if not yet fetched, then populate list
    if (linkedinContacts.length === 0) {
      loadLinkedIn().then(() => renderOutreachList());
    } else {
      renderOutreachList();
    }
  }
}

// ─── Add LinkedIn Connection ──────────────────────────
function openAddLinkedInModal() {
  document.getElementById('linkedinAddForm').reset();
  delete document.getElementById('linkedinAddForm').dataset.editId;
  document.getElementById('addLinkedInModal').querySelector('h2').textContent = 'Add LinkedIn Connection';
  document.getElementById('addLinkedInModal').style.display = 'flex';
}

async function saveLinkedInContact(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Saving...'; btn.disabled = true;

  const form   = document.getElementById('linkedinAddForm');
  const editId = form.dataset.editId ? parseInt(form.dataset.editId) : null;
  const fields = {
    first_name:   document.getElementById('liFirstName').value.trim(),
    last_name:    document.getElementById('liLastName').value.trim(),
    email:        document.getElementById('liEmail').value.trim().toLowerCase() || null,
    linkedin_url: document.getElementById('liUrl').value.trim() || null,
  };

  if (editId) {
    const { error } = await db.from('linkedin_contacts').update(fields).eq('id', editId);
    if (error) {
      showToast('Error updating: ' + error.message, 'error');
    } else {
      const c = linkedinContacts.find(x => x.id === editId);
      if (c) Object.assign(c, fields);
      renderLinkedInTable();
      renderStats('linkedin');
      document.getElementById('addLinkedInModal').style.display = 'none';
      showToast('Connection updated!', 'success');
    }
  } else {
    const { data: { user } } = await db.auth.getUser();
    const { data, error } = await db.from('linkedin_contacts').insert([{ ...fields, user_id: user.id }]).select().single();
    if (error) {
      showToast('Error saving: ' + error.message, 'error');
    } else {
      linkedinContacts.unshift(data);
      renderLinkedInTable();
      renderStats('linkedin');
      document.getElementById('addLinkedInModal').style.display = 'none';
      showToast('Connection added!', 'success');
    }
  }

  delete form.dataset.editId;
  document.getElementById('addLinkedInModal').querySelector('h2').textContent = 'Add LinkedIn Connection';
  btn.textContent = 'Save Connection'; btn.disabled = false;
}

// ─── LinkedIn Contact ─────────────────────────────────
let linkedinContactUrl = '';
let linkedinContactId  = null;

function openLinkedInContact(url, firstName, id) {
  linkedinContactUrl = url;
  linkedinContactId  = id;
  const base = `Hi [First Name],\n\nI hope you're doing well! My name is Brady Wells and I'm a Financial Representative with Northwestern Mutual.\n\nI'd love to connect and have a quick conversation about your financial goals — whether that's building wealth, protecting your family, or planning for retirement.\n\nWould you be open to a free, no-obligation chat this week?\n\nLooking forward to connecting,\nBrady Wells\nFinancial Representative | Northwestern Mutual`;
  document.getElementById('linkedinContactMessage').value =
    base.replace(/\[First Name\]/gi, firstName || 'there');
  document.getElementById('linkedinContactModal').style.display = 'flex';
}

async function copyAndOpenLinkedIn() {
  const msg = document.getElementById('linkedinContactMessage').value;
  // Mark as contacted in DB
  if (linkedinContactId) {
    const now = new Date().toISOString();
    await db.from('linkedin_contacts').update({ contacted_at: now }).eq('id', linkedinContactId);
    const c = linkedinContacts.find(x => x.id === linkedinContactId);
    if (c) c.contacted_at = now;
    renderStats('linkedin');
  }
  navigator.clipboard.writeText(msg).then(() => {
    showToast('Message copied! Opening LinkedIn...', 'success');
    setTimeout(() => window.open(linkedinContactUrl, '_blank'), 500);
  }).catch(() => {
    window.open(linkedinContactUrl, '_blank');
  });
  document.getElementById('linkedinContactModal').style.display = 'none';
}

// ─── LinkedIn Tab ─────────────────────────────────────
async function loadLinkedIn() {
  let all = [], from = 0, batchSize = 1000;
  while (true) {
    const { data, error } = await db
      .from('linkedin_contacts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + batchSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  linkedinContacts = all;
}

function renderLinkedInTable() {
  const tbody = document.getElementById('linkedinTableBody');
  const empty = document.getElementById('linkedinEmpty');
  const table = document.getElementById('linkedinTable');

  if (linkedinContacts.length === 0) {
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  table.style.display = 'table';
  empty.style.display = 'none';

  tbody.innerHTML = linkedinContacts.map(c => `
    <tr>
      <td>${escHtml(c.first_name || '')}</td>
      <td>${escHtml(c.last_name  || '')}</td>
      <td>${c.email
        ? `<a href="mailto:${escHtml(c.email)}" style="color:var(--accent)">${escHtml(c.email)}</a>`
        : '<span style="color:#9ca3af">—</span>'}</td>
      <td>${c.linkedin_url
        ? `<a href="${escHtml(c.linkedin_url)}" target="_blank" style="color:#0077b5;font-size:0.85rem">View Profile</a>`
        : '<span style="color:#9ca3af">—</span>'}</td>
      <td>
        ${c.linkedin_url
          ? `<button class="btn-linkedin-contact${c.contacted_at ? ' contacted' : ''}" onclick="openLinkedInContact('${escHtml(c.linkedin_url)}','${escHtml(c.first_name || '')}',${c.id})">&#128172; ${c.contacted_at ? 'Contacted ✓' : 'Contact'}</button>`
          : '<span style="color:#9ca3af;font-size:0.82rem">No URL</span>'}
      </td>
      <td>
        <button class="action-btn edit" title="Edit" data-lid="${c.id}">&#9998;</button>
        <button class="action-btn delete" title="Delete" data-lid="${c.id}">&#128465;</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.action-btn.edit').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.lid);
      const c = linkedinContacts.find(x => x.id === id);
      if (!c) return;
      document.getElementById('liFirstName').value = c.first_name || '';
      document.getElementById('liLastName').value  = c.last_name  || '';
      document.getElementById('liEmail').value     = c.email      || '';
      document.getElementById('liUrl').value       = c.linkedin_url || '';
      document.getElementById('addLinkedInModal').querySelector('h2').textContent = 'Edit Connection';
      document.getElementById('linkedinAddForm').dataset.editId = id;
      document.getElementById('addLinkedInModal').style.display = 'flex';
    }));

  tbody.querySelectorAll('.action-btn.delete').forEach(btn =>
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.lid);
      const { error } = await db.from('linkedin_contacts').delete().eq('id', id);
      if (!error) {
        linkedinContacts = linkedinContacts.filter(x => x.id !== id);
        renderLinkedInTable();
        renderStats('linkedin');
      }
    }));
}

function parseLinkedInCSVFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSVText(e.target.result);
    // LinkedIn CSV has a 3-line header notice — skip until we find the real header
    let headerIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      if (rows[i].some(h => /first.?name/i.test(h))) { headerIdx = i; break; }
    }
    const header = rows[headerIdx].map(h => h.trim().toLowerCase().replace(/\s+/g, ' ').replace(/"/g, ''));
    const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c.trim()));

    const iFirst = findCol(header, ['first name', 'firstname', 'first']);
    const iLast  = findCol(header, ['last name', 'lastname', 'last']);
    const iEmail = findCol(header, ['email address', 'email', 'e-mail']);
    const iUrl   = findCol(header, ['url', 'linkedin url', 'profile url', 'connected on']);

    pendingLinkedIn = dataRows.map(r => ({
      first_name:   getCol(r, iFirst),
      last_name:    getCol(r, iLast),
      email:        getCol(r, iEmail).toLowerCase() || null,
      linkedin_url: getCol(r, iUrl) || null,
    })).filter(c => c.first_name || c.last_name);

    if (pendingLinkedIn.length === 0) {
      showToast('No connections found in file.', 'error');
      return;
    }

    document.getElementById('linkedinPreviewCount').textContent = pendingLinkedIn.length;
    document.getElementById('linkedinDropZone').style.display = 'none';
    document.getElementById('linkedinImportPreview').style.display = 'block';
    document.getElementById('linkedinPreviewBody').innerHTML = pendingLinkedIn.slice(0, 100).map(c => `
      <tr>
        <td>${escHtml(c.first_name)}</td>
        <td>${escHtml(c.last_name)}</td>
        <td>${escHtml(c.email || '')||'<span style="color:#9ca3af">—</span>'}</td>
        <td>${c.linkedin_url
          ? `<a href="${escHtml(c.linkedin_url)}" target="_blank" style="color:#0077b5">View</a>`
          : '<span style="color:#9ca3af">—</span>'}</td>
      </tr>`).join('');
  };
  reader.readAsText(file);
}

async function confirmLinkedInImport() {
  if (pendingLinkedIn.length === 0) return;
  const btn = document.getElementById('confirmLinkedInImport');
  btn.textContent = 'Importing...';
  btn.disabled = true;

  const { data: { user } } = await db.auth.getUser();
  const existing = new Set(linkedinContacts.map(c => `${c.first_name}|${c.last_name}`));
  const newRows = pendingLinkedIn
    .filter(c => !existing.has(`${c.first_name}|${c.last_name}`))
    .map(c => ({ ...c, user_id: user.id }));

  const BATCH = 50;
  let inserted = [];
  for (let i = 0; i < newRows.length; i += BATCH) {
    const { data, error } = await db.from('linkedin_contacts').insert(newRows.slice(i, i + BATCH)).select();
    if (error) { showToast('Import error: ' + error.message, 'error'); break; }
    if (data) inserted.push(...data);
  }

  linkedinContacts = [...inserted, ...linkedinContacts];
  renderLinkedInTable();
  renderStats('linkedin');
  document.getElementById('linkedinImportModal').style.display = 'none';
  showToast(`${inserted.length} LinkedIn connection${inserted.length !== 1 ? 's' : ''} imported!`, 'success');
  btn.textContent = 'Import All';
  btn.disabled = false;
  pendingLinkedIn = [];
}

function openLinkedInImportModal() {
  pendingLinkedIn = [];
  document.getElementById('linkedinDropZone').style.display = 'block';
  document.getElementById('linkedinImportPreview').style.display = 'none';
  document.getElementById('linkedinImportModal').style.display = 'flex';
}

// Bind LinkedIn tab events (called once on DOMContentLoaded)
function bindLinkedInTab() {
  document.getElementById('importLinkedInBtn').addEventListener('click', openLinkedInImportModal);
  document.getElementById('linkedinEmptyImportBtn')?.addEventListener('click', openLinkedInImportModal);
  document.getElementById('closeLinkedInImportModal').addEventListener('click', () => {
    document.getElementById('linkedinImportModal').style.display = 'none';
  });
  document.getElementById('cancelLinkedInImport').addEventListener('click', () => {
    document.getElementById('linkedinImportModal').style.display = 'none';
  });
  document.getElementById('confirmLinkedInImport').addEventListener('click', confirmLinkedInImport);

  const fileInput = document.getElementById('linkedinFileInput');
  fileInput.addEventListener('change', e => { if (e.target.files[0]) parseLinkedInCSVFile(e.target.files[0]); });

  const drop = document.getElementById('linkedinDropZone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) parseLinkedInCSVFile(file);
  });
}
