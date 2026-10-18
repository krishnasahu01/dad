// Global state
let appConfig = {
  businessName: "Dad's Bed Measurement & Visit Service",
  dadPhone: "+91 9876543210",
  bookingFee: 99,
  currencySymbol: "₹",
  upiId: "bedsheetfitting@upi"
};

let activeBooking = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  initDatePicker();
});

// 1. Fetch public config
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to load settings');
    appConfig = await res.json();

    const brandEls = document.querySelectorAll('#brand-name');
    brandEls.forEach(el => el.textContent = appConfig.businessName);

    const feeEls = document.querySelectorAll('.booking-fee-text, #payAmount, #confAmount');
    feeEls.forEach(el => el.textContent = appConfig.bookingFee);

    const phoneEl = document.getElementById('footerDadPhone');
    if (phoneEl) phoneEl.textContent = appConfig.dadPhone;

    const upiEl = document.getElementById('displayUpiId');
    if (upiEl) upiEl.textContent = appConfig.upiId;

  } catch (err) {
    console.error('Config load error:', err);
  }
}

// 2. Setup Date Picker (Today to next 14 days)
function initDatePicker() {
  const dateInput = document.getElementById('bookingDate');
  if (!dateInput) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const minDate = `${yyyy}-${mm}-${dd}`;

  const max = new Date();
  max.setDate(max.getDate() + 14);
  const max_yyyy = max.getFullYear();
  const max_mm = String(max.getMonth() + 1).padStart(2, '0');
  const max_dd = String(max.getDate()).padStart(2, '0');
  const maxDate = `${max_yyyy}-${max_mm}-${max_dd}`;

  dateInput.min = minDate;
  dateInput.max = maxDate;
  dateInput.value = minDate;

  loadAvailableSlots();
}

// 3. Load available slots for selected date
async function loadAvailableSlots() {
  const dateInput = document.getElementById('bookingDate');
  const container = document.getElementById('slotsContainer');
  const hiddenSlot = document.getElementById('selectedTimeSlot');
  hiddenSlot.value = '';

  if (!dateInput.value) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 0.5rem 0;">Please select a date.</div>';
    return;
  }

  container.innerHTML = '<div style="color: var(--text-muted); padding: 0.5rem 0;"><i class="fa-solid fa-spinner fa-spin"></i> Checking Dad\'s slots...</div>';

  try {
    const res = await fetch(`/api/slots?date=${dateInput.value}`);
    const data = await res.json();

    if (!data.slots || data.slots.length === 0) {
      container.innerHTML = '<div style="color: var(--danger); padding: 0.5rem 0;">No slots available for this date.</div>';
      return;
    }

    container.innerHTML = '';
    data.slots.forEach(slot => {
      const div = document.createElement('div');
      div.className = `slot-option ${slot.isAvailable ? '' : 'disabled'}`;
      div.innerHTML = `
        <i class="fa-solid ${slot.isAvailable ? 'fa-clock' : 'fa-ban'}"></i>
        <span>${slot.label}</span>
        <span class="slot-status" style="color: ${slot.isAvailable ? 'var(--success)' : 'var(--danger)'};">
          ${slot.isAvailable ? 'Available' : 'Booked'}
        </span>
      `;

      if (slot.isAvailable) {
        div.addEventListener('click', () => {
          document.querySelectorAll('.slot-option').forEach(s => s.classList.remove('selected'));
          div.classList.add('selected');
          hiddenSlot.value = slot.label;
        });
      }

      container.appendChild(div);
    });

  } catch (err) {
    container.innerHTML = '<div style="color: var(--danger); padding: 0.5rem 0;">Failed to load time slots.</div>';
  }
}

// 4. ⭐ Detect User's Current GPS Location
function detectCurrentLocation() {
  const btn = document.getElementById('btnDetectGps');
  const box = document.getElementById('locationBox');
  const resultBox = document.getElementById('gpsResultBox');
  const gpsDetails = document.getElementById('gpsDetails');
  const addressText = document.getElementById('gpsAddressText');
  const previewLink = document.getElementById('previewMapLink');

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser. Please type your address.', 'warning');
    return;
  }

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting your exact GPS location...';
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);

      // Save in hidden fields
      document.getElementById('geoLat').value = lat;
      document.getElementById('geoLng').value = lng;
      
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      document.getElementById('geoMapsUrl').value = mapsUrl;

      box.classList.add('detected');
      btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Location Captured! (Click to re-detect)';
      btn.style.background = '#10b981';
      btn.disabled = false;

      gpsDetails.innerHTML = `📍 GPS Pin: ${lat.toFixed(5)}, ${lng.toFixed(5)} <span style="font-size: 0.75rem; color: #059669; font-weight: normal;">(Accurate to ±${accuracy}m)</span>`;
      previewLink.href = mapsUrl;
      resultBox.style.display = 'block';

      showToast('Location captured! Dad can now navigate straight to you.', 'success');

      // Attempt reverse geocode to get street name for convenience
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData && geoData.display_name) {
            addressText.innerHTML = `<strong>Nearby:</strong> ${geoData.display_name}`;
            const addressInput = document.getElementById('addressLine');
            if (!addressInput.value) {
              const road = geoData.address.road || geoData.address.suburb || '';
              const city = geoData.address.city || geoData.address.town || geoData.address.state_district || '';
              addressInput.value = `${road ? road + ', ' : ''}${city}`.trim();
            }
          }
        }
      } catch (e) {
        console.log('Reverse geocoding skip:', e);
      }
    },
    (error) => {
      btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use My Current Location';
      btn.disabled = false;

      let msg = 'Could not get location.';
      if (error.code === error.PERMISSION_DENIED) {
        msg = 'Location permission was denied. Please allow location access or type your address below.';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        msg = 'Location position unavailable. Please type your address below.';
      } else if (error.code === error.TIMEOUT) {
        msg = 'Location request timed out. Please try again or type your address.';
      }
      showToast(msg, 'warning');
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// 5. Booking Form Submission
async function handleBookingSubmit(e) {
  e.preventDefault();

  const timeSlot = document.getElementById('selectedTimeSlot').value;
  if (!timeSlot) {
    showToast('Please select a visit time slot!', 'warning');
    return;
  }

  const lat = document.getElementById('geoLat').value;
  const lng = document.getElementById('geoLng').value;
  const addressLine = document.getElementById('addressLine').value.trim();

  if (!lat && !addressLine) {
    showToast('Please click "Use My Current Location" or enter your house address.', 'warning');
    return;
  }

  const payload = {
    customerName: document.getElementById('customerName').value,
    phone: document.getElementById('phone').value,
    addressLine: addressLine,
    landmark: document.getElementById('landmark').value,
    latitude: lat,
    longitude: lng,
    mapsUrl: document.getElementById('geoMapsUrl').value,
    bookingDate: document.getElementById('bookingDate').value,
    timeSlot: timeSlot,
    numberOfBeds: document.getElementById('numberOfBeds').value,
    specialInstructions: document.getElementById('specialInstructions').value
  };

  try {
    const res = await fetch('/api/bookings/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to initiate booking', 'danger');
      return;
    }

    activeBooking = data;
    openPaymentModal(data);

  } catch (err) {
    showToast('Network error while creating booking.', 'danger');
  }
}

// 6. Payment Modal Logic
function openPaymentModal(data) {
  document.getElementById('payBookingId').textContent = data.bookingId;
  document.getElementById('payAmount').textContent = data.amount;
  document.getElementById('paymentModal').classList.add('active');
  const cardName = document.getElementById('cardHolderName');
  if (cardName) cardName.value = data.customerName;
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('active');
}

function switchPayTab(tab) {
  const tabs = document.querySelectorAll('.payment-tabs .tab-btn');
  tabs.forEach(t => t.classList.remove('active'));

  document.getElementById('tab-upi').style.display = 'none';
  document.getElementById('tab-card').style.display = 'none';

  if (tab === 'upi') {
    tabs[0].classList.add('active');
    document.getElementById('tab-upi').style.display = 'block';
  } else {
    tabs[1].classList.add('active');
    document.getElementById('tab-card').style.display = 'block';
  }
}

// 7. Verify & Confirm Payment
async function processPayment(method) {
  if (!activeBooking) return;

  const btn = event.currentTarget;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying Payment...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/bookings/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: activeBooking.bookingId,
        paymentMethod: method
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Payment verification failed', 'danger');
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }

    closePaymentModal();
    openSuccessModal(data.booking);

    // Reset form
    document.getElementById('bookingForm').reset();
    document.getElementById('geoLat').value = '';
    document.getElementById('geoLng').value = '';
    document.getElementById('geoMapsUrl').value = '';
    document.getElementById('gpsResultBox').style.display = 'none';
    document.getElementById('locationBox').classList.remove('detected');
    document.getElementById('btnDetectGps').innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use My Current Location';
    document.getElementById('btnDetectGps').style.background = '#2563eb';
    initDatePicker();

  } catch (err) {
    showToast('Payment processing error', 'danger');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// 8. Open Success Confirmation Modal
function openSuccessModal(booking) {
  document.getElementById('confBookingId').textContent = booking.id;
  document.getElementById('confCustomerName').textContent = booking.customer_name;
  document.getElementById('confDateTime').textContent = `${booking.booking_date} | ${booking.time_slot}`;
  document.getElementById('confAmount').textContent = booking.booking_fee;
  document.getElementById('confTxId').textContent = booking.payment_tx_id;

  const mapsLink = booking.maps_url || (booking.latitude ? `https://www.google.com/maps/dir/?api=1&destination=${booking.latitude},${booking.longitude}` : '');

  // Setup WhatsApp message for Dad with direct GPS navigation link
  const waMsg = encodeURIComponent(
    `Hello Dad! A new Bed Measurement Visit has been booked:\n\n` +
    `• Booking ID: ${booking.id}\n` +
    `• Customer: ${booking.customer_name}\n` +
    `• Phone: ${booking.phone}\n` +
    `• Date & Slot: ${booking.booking_date} (${booking.time_slot})\n` +
    `• House / Address: ${booking.address_line}\n` +
    (mapsLink ? `• 🗺️ GPS Navigation Link (Tap to Drive):\n${mapsLink}\n` : '') +
    `• Advance Paid: ₹${booking.booking_fee} (Txn: ${booking.payment_tx_id})\n\n` +
    `Customer is ready for your visit!`
  );

  const cleanPhone = appConfig.dadPhone.replace(/[^0-9]/g, '');
  const waBtn = document.getElementById('btnWhatsAppDad');
  waBtn.href = `https://wa.me/${cleanPhone}?text=${waMsg}`;

  document.getElementById('successModal').classList.add('active');
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('active');
}

// 9. Track Booking Logic
function openTrackModal() {
  document.getElementById('trackModal').classList.add('active');
}

function closeTrackModal() {
  document.getElementById('trackModal').classList.remove('active');
}

async function trackBooking() {
  const query = document.getElementById('trackInput').value.trim();
  const resultsDiv = document.getElementById('trackResults');

  if (!query) {
    resultsDiv.innerHTML = '<div style="color: var(--danger); font-size: 0.9rem;">Please enter your Booking ID or Phone number.</div>';
    return;
  }

  resultsDiv.innerHTML = '<div style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Searching bookings...</div>';

  try {
    const res = await fetch(`/api/bookings/track?query=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.bookings || data.bookings.length === 0) {
      resultsDiv.innerHTML = '<div style="color: var(--text-muted); padding: 1rem; text-align: center;">No bookings found for this search.</div>';
      return;
    }

    resultsDiv.innerHTML = data.bookings.map(b => `
      <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <strong style="color: #2563eb; font-size: 1rem;">${b.id}</strong>
          <span class="badge badge-${b.booking_status.toLowerCase()}">${b.booking_status}</span>
        </div>
        <div style="font-size: 0.85rem; color: #334155;">
          <div><strong>Customer:</strong> ${b.customer_name} (${b.phone})</div>
          <div><strong>Date:</strong> ${b.booking_date} | <strong>Slot:</strong> ${b.time_slot}</div>
          <div><strong>Advance Fee:</strong> ₹${b.booking_fee} (${b.payment_status})</div>
          ${b.dad_notes ? `<div style="margin-top: 0.35rem; padding: 0.35rem 0.5rem; background: #e0f2fe; border-radius: 4px; color: #0369a1;"><strong>Dad's Note:</strong> ${b.dad_notes}</div>` : ''}
          ${b.bed_measurements ? `<div style="margin-top: 0.35rem; padding: 0.35rem 0.5rem; background: #fef3c7; border-radius: 4px; color: #92400e;"><strong>Bed Measurements:</strong> ${b.bed_measurements}</div>` : ''}
        </div>
      </div>
    `).join('');

  } catch (err) {
    resultsDiv.innerHTML = '<div style="color: var(--danger);">Failed to query booking status.</div>';
  }
}

// 10. Toast Helper
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
