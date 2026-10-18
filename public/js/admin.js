let adminToken = localStorage.getItem('bedsheet_admin_token') || null;
let currentBookings = [];
let editingBookingId = null;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (adminToken) {
    const isValid = await verifyToken();
    if (isValid) {
      showDashboard();
    } else {
      showLogin();
    }
  } else {
    showLogin();
  }
});

// 1. Session verification
async function verifyToken() {
  try {
    const res = await fetch('/api/admin/verify', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

let currentAdmin = null;

function showLogin() {
  document.getElementById('loginScreen').classList.add('active');
  document.getElementById('adminInterface').style.display = 'none';
}

function showDashboard(isDefaultPassword = false) {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('adminInterface').style.display = 'flex';
  
  const greetingEl = document.getElementById('adminGreeting');
  if (greetingEl && currentAdmin) {
    greetingEl.textContent = `Logged in as: ${currentAdmin.username}`;
  }

  const alertBanner = document.getElementById('securityAlertBanner');
  if (alertBanner) {
    alertBanner.style.display = isDefaultPassword ? 'flex' : 'none';
  }

  loadDashboard();
  loadBookings();
  loadSettings();
}

function logoutAdmin() {
  localStorage.removeItem('bedsheet_admin_token');
  adminToken = null;
  currentAdmin = null;
  showLogin();
}

// 2. Admin Login
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const btn = document.getElementById('btnLoginSubmit');

  if (!username || !password) {
    showToast('Please enter both username and password', 'warning');
    return;
  }

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Secure Login';
    btn.disabled = false;

    if (!res.ok) {
      showToast(data.error || 'Login failed', 'danger');
      return;
    }

    adminToken = data.token;
    currentAdmin = data.admin;
    localStorage.setItem('bedsheet_admin_token', adminToken);
    
    // Clear login input values for security
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';

    showToast(`Welcome back, ${data.admin.name}!`, 'success');
    showDashboard(data.isDefaultPassword);

  } catch (err) {
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Secure Login';
    btn.disabled = false;
    showToast('Failed to connect to server', 'danger');
  }
}

// 3. Load Dashboard Stats
async function loadDashboard() {
  try {
    const res = await fetch('/api/admin/dashboard', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    document.getElementById('statToday').textContent = data.todayAppointments;
    document.getElementById('statPending').textContent = data.pendingVisits;
    document.getElementById('statCompleted').textContent = data.completedVisits;
    document.getElementById('statTotal').textContent = data.totalBookings;
    document.getElementById('statRevenue').textContent = `₹${data.totalAdvanceCollected.toLocaleString()}`;

  } catch (err) {
    console.error('Stats error:', err);
  }
}

// 4. Load Bookings with Filters
async function loadBookings() {
  const status = document.getElementById('filterStatus').value;
  const date = document.getElementById('filterDate').value;
  const search = document.getElementById('filterSearch').value.trim();

  const tbody = document.getElementById('bookingsTableBody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  let url = `/api/admin/bookings?status=${status}`;
  if (date) url += `&date=${date}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    currentBookings = data.bookings || [];

    if (currentBookings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No bookings match your filter.</td></tr>`;
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    tbody.innerHTML = currentBookings.map(b => {
      const isToday = b.booking_date === todayStr;
      const cleanPhone = b.phone.replace(/[^0-9]/g, '');
      const mapsQuery = encodeURIComponent(`${b.address_line}, ${b.landmark || ''}, ${b.city} ${b.pincode}`);
      const waMsg = encodeURIComponent(`Hello ${b.customer_name}! This is from Dad's Handcrafted Bedsheets. We are scheduled to visit your home on ${b.booking_date} (${b.time_slot}) to measure your bed and show fabric samples. Please confirm if you are available.`);

      return `
        <tr>
          <!-- Booking ID -->
          <td>
            <strong style="color: var(--primary); font-size: 0.95rem;">${b.id}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
              ${new Date(b.created_at).toLocaleDateString()}
            </div>
          </td>

          <!-- Date & Slot -->
          <td>
            <div style="font-weight: 700;">
              ${b.booking_date}
              ${isToday ? '<span class="badge" style="background: #fef08a; color: #854d0e; font-size: 0.7rem; margin-left: 0.25rem;">TODAY</span>' : ''}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${b.time_slot}</div>
          </td>

          <!-- Customer & Contact -->
          <td>
            <div style="font-weight: 700; color: #1e293b;">${b.customer_name}</div>
            <div style="font-size: 0.85rem; color: #475569; margin-top: 0.15rem;">
              <i class="fa-solid fa-phone" style="font-size: 0.75rem;"></i> ${b.phone}
            </div>
            ${b.alt_phone ? `<div style="font-size: 0.75rem; color: var(--text-muted);">Alt: ${b.alt_phone}</div>` : ''}
            <div style="display: flex; gap: 0.35rem; margin-top: 0.4rem;">
              <a href="tel:${cleanPhone}" class="action-icon-btn call" title="Call Customer">
                <i class="fa-solid fa-phone"></i>
              </a>
              <a href="https://wa.me/${cleanPhone}?text=${waMsg}" target="_blank" class="action-icon-btn wa" title="WhatsApp Customer">
                <i class="fa-brands fa-whatsapp"></i>
              </a>
            </div>
          </td>

          <!-- Address & GPS Navigation for Dad -->
          <td style="max-width: 270px;">
            ${b.latitude && b.longitude ? `
              <div style="margin-bottom: 0.35rem;">
                <span class="badge" style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; font-size: 0.72rem;">
                  <i class="fa-solid fa-location-crosshairs"></i> Exact GPS Pin Captured
                </span>
              </div>
            ` : ''}
            <div style="font-size: 0.85rem; line-height: 1.35; font-weight: 500;">${b.address_line}</div>
            ${b.landmark ? `<div style="font-size: 0.75rem; color: var(--text-muted);">Landmark: ${b.landmark}</div>` : ''}
            ${b.latitude && b.longitude ? `
              <div style="font-size: 0.72rem; color: #64748b; font-family: monospace; margin-top: 0.2rem;">
                GPS: ${b.latitude.toFixed(5)}, ${b.longitude.toFixed(5)}
              </div>
            ` : ''}
            <div style="margin-top: 0.45rem;">
              <a href="${b.maps_url || (b.latitude ? `https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}` : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`)}" 
                 target="_blank" 
                 class="btn btn-sm" 
                 style="background: #dc2626; color: white; padding: 0.35rem 0.65rem; font-size: 0.78rem; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 700;" 
                 title="Drive to Customer with Google Maps">
                <i class="fa-solid fa-diamond-turn-right"></i> Drive with GPS
              </a>
            </div>
          </td>

          <!-- Bed Type & Specs -->
          <td>
            <div style="font-weight: 700; font-size: 0.85rem;">${b.bed_type}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${b.number_of_beds} bed(s)</div>
            <div style="font-size: 0.75rem; color: #4f46e5; margin-top: 0.2rem;">${b.fabric_preference || ''}</div>
            ${b.special_instructions ? `<div style="font-size: 0.75rem; color: #64748b; font-style: italic; margin-top: 0.2rem;">"${b.special_instructions}"</div>` : ''}
          </td>

          <!-- Payment Verification -->
          <td>
            <span class="badge ${b.payment_status === 'PAID' ? 'badge-paid' : 'badge-pending'}">
              <i class="fa-solid ${b.payment_status === 'PAID' ? 'fa-circle-check' : 'fa-hourglass'}"></i>
              ${b.payment_status} (₹${b.booking_fee})
            </span>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
              ${b.payment_method || 'Advance'}
            </div>
            <code style="font-size: 0.68rem; color: #64748b; display: block; overflow: hidden; text-overflow: ellipsis; max-width: 110px;">
              ${b.payment_tx_id || 'Pending'}
            </code>
          </td>

          <!-- Status Dropdown -->
          <td>
            <select class="form-control" style="font-size: 0.8rem; padding: 0.35rem 0.5rem; width: auto; font-weight: 600;" onchange="updateBookingStatus('${b.id}', this.value)">
              <option value="CONFIRMED" ${b.booking_status === 'CONFIRMED' ? 'selected' : ''}>Confirmed</option>
              <option value="IN_PROGRESS" ${b.booking_status === 'IN_PROGRESS' ? 'selected' : ''}>In Progress</option>
              <option value="COMPLETED" ${b.booking_status === 'COMPLETED' ? 'selected' : ''}>Completed</option>
              <option value="CANCELLED" ${b.booking_status === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
            </select>
          </td>

          <!-- Actions -->
          <td>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              <button class="btn btn-outline btn-sm" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;" onclick="openNotesModal('${b.id}')" title="Dad's Measurement Notes">
                <i class="fa-solid fa-ruler"></i> Notes
              </button>
              <button class="action-icon-btn" style="color: var(--danger);" onclick="deleteBooking('${b.id}')" title="Delete Booking">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load bookings</td></tr>`;
  }
}

// 5. Update Status
async function updateBookingStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/admin/bookings/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Status update failed', 'danger');
      return;
    }

    showToast(`Booking ${id} set to ${newStatus}`, 'success');
    loadDashboard();

  } catch (err) {
    showToast('Failed to update status', 'danger');
  }
}

// 6. Dad's Bed Measurement & Notes Modal
function openNotesModal(id) {
  editingBookingId = id;
  const booking = currentBookings.find(b => b.id === id);
  if (!booking) return;

  document.getElementById('notesBookingId').textContent = id;
  document.getElementById('modalBedMeasurements').value = booking.bed_measurements || '';
  document.getElementById('modalDadNotes').value = booking.dad_notes || '';
  document.getElementById('modalOrderAmount').value = booking.total_order_amount || '';
  document.getElementById('modalAdvanceFee').textContent = booking.booking_fee || '99';

  document.getElementById('notesModal').classList.add('active');
}

function closeNotesModal() {
  document.getElementById('notesModal').classList.remove('active');
  editingBookingId = null;
}

async function saveNotes(e) {
  e.preventDefault();
  if (!editingBookingId) return;

  const bed_measurements = document.getElementById('modalBedMeasurements').value;
  const dad_notes = document.getElementById('modalDadNotes').value;
  const total_order_amount = document.getElementById('modalOrderAmount').value;

  try {
    const res = await fetch(`/api/admin/bookings/${editingBookingId}/notes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        bed_measurements,
        dad_notes,
        total_order_amount
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to save notes', 'danger');
      return;
    }

    showToast("Dad's visit notes & bed measurements saved!", 'success');
    closeNotesModal();
    loadBookings();
    loadDashboard();

  } catch (err) {
    showToast('Error saving notes', 'danger');
  }
}

// 7. Delete Booking
async function deleteBooking(id) {
  if (!confirm(`Are you sure you want to delete booking ${id}? This cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    if (!res.ok) {
      showToast('Failed to delete booking', 'danger');
      return;
    }

    showToast('Booking deleted', 'success');
    loadBookings();
    loadDashboard();

  } catch (err) {
    showToast('Network error while deleting', 'danger');
  }
}

// 8. Filters & Search
function clearDateFilter() {
  document.getElementById('filterDate').value = '';
  loadBookings();
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadBookings();
  }, 300);
}

// 9. Admin Tabs
function switchAdminTab(tab) {
  const tabs = document.querySelectorAll('.admin-tab-btn');
  tabs.forEach(t => t.classList.remove('active'));

  document.getElementById('tab-bookings').style.display = 'none';
  document.getElementById('tab-settings').style.display = 'none';

  if (tab === 'bookings') {
    tabs[0].classList.add('active');
    document.getElementById('tab-bookings').style.display = 'block';
  } else {
    tabs[1].classList.add('active');
    document.getElementById('tab-settings').style.display = 'block';
    loadSettings();
  }
}

// 10. Settings Management
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    
    const settingsMap = {};
    data.settings.forEach(s => settingsMap[s.key] = s.value);

    document.getElementById('settingBusinessName').value = settingsMap['business_name'] || '';
    document.getElementById('settingDadPhone').value = settingsMap['dad_phone'] || '';
    document.getElementById('settingBookingFee').value = settingsMap['booking_fee'] || '99';
    document.getElementById('settingUpiId').value = settingsMap['upi_id'] || '';

    if (currentAdmin) {
      const nameEl = document.getElementById('secAdminName');
      const userEl = document.getElementById('secAdminUsername');
      if (nameEl) nameEl.value = currentAdmin.name || '';
      if (userEl) userEl.value = currentAdmin.username || '';
    }

  } catch (err) {
    console.error('Settings load error:', err);
  }
}

async function saveSettings(e) {
  e.preventDefault();

  const business_name = document.getElementById('settingBusinessName').value;
  const dad_phone = document.getElementById('settingDadPhone').value;
  const booking_fee = document.getElementById('settingBookingFee').value;
  const upi_id = document.getElementById('settingUpiId').value;

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        business_name,
        dad_phone,
        booking_fee,
        upi_id
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to update settings', 'danger');
      return;
    }

    showToast('Settings saved successfully!', 'success');

  } catch (err) {
    showToast('Failed to save settings', 'danger');
  }
}

// Update Admin Username & Password
async function handleCredentialsChange(e) {
  e.preventDefault();

  const newName = document.getElementById('secAdminName').value.trim();
  const newUsername = document.getElementById('secAdminUsername').value.trim();
  const currentPassword = document.getElementById('secCurrentPassword').value;
  const newPassword = document.getElementById('secNewPassword').value;
  const confirmPassword = document.getElementById('secConfirmPassword').value;

  if (newPassword && newPassword !== confirmPassword) {
    showToast('New passwords do not match!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/admin/change-credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        newName,
        newUsername,
        currentPassword,
        newPassword
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Credential update failed', 'danger');
      return;
    }

    showToast('Username and password updated securely!', 'success');
    currentAdmin = data.admin;

    document.getElementById('secCurrentPassword').value = '';
    document.getElementById('secNewPassword').value = '';
    document.getElementById('secConfirmPassword').value = '';

    const alertBanner = document.getElementById('securityAlertBanner');
    if (alertBanner) alertBanner.style.display = 'none';

    const greetingEl = document.getElementById('adminGreeting');
    if (greetingEl) greetingEl.textContent = `Logged in as: ${data.admin.username}`;

  } catch (err) {
    showToast('Error updating credentials', 'danger');
  }
}

// Emergency Recovery Modal
function openRecoveryModal() {
  document.getElementById('recoveryModal').classList.add('active');
}

function closeRecoveryModal() {
  document.getElementById('recoveryModal').classList.remove('active');
}

async function handleRecoveryReset(e) {
  e.preventDefault();

  const masterKey = document.getElementById('recMasterKey').value.trim();
  const newUsername = document.getElementById('recNewUsername').value.trim();
  const newPassword = document.getElementById('recNewPassword').value;

  try {
    const res = await fetch('/api/admin/recovery-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterKey, newUsername, newPassword })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Recovery failed. Invalid master key.', 'danger');
      return;
    }

    showToast('Credentials reset successfully! Please login with your new credentials.', 'success');
    closeRecoveryModal();

    document.getElementById('recMasterKey').value = '';
    document.getElementById('recNewUsername').value = '';
    document.getElementById('recNewPassword').value = '';

    document.getElementById('loginUsername').value = newUsername;
    document.getElementById('loginPassword').value = '';

  } catch (err) {
    showToast('Error communicating with recovery service', 'danger');
  }
}

// Toggle Show/Hide Password
function togglePasswordVisibility(fieldId, btn) {
  const input = document.getElementById(fieldId);
  if (!input) return;

  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

// 11. Toast Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'fa-info-circle';
  if (type === 'danger') icon = 'fa-circle-xmark';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'success') icon = 'fa-circle-check';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
