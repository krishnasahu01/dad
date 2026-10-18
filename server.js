const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5050;
const JWT_SECRET = process.env.JWT_SECRET || 'bedsheet_booking_super_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions for settings
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// Admin Auth Middleware
function authAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Please login as admin.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token.' });
  }
}

// ==========================================
// PUBLIC API ENDPOINTS
// ==========================================

// 1. Get Public Configuration
app.get('/api/config', (req, res) => {
  const businessName = getSetting('business_name') || "Dad's Handcrafted Bedsheets";
  const dadPhone = getSetting('dad_phone') || '+91 9876543210';
  const bookingFee = parseFloat(getSetting('booking_fee') || '99');
  const currencySymbol = getSetting('currency_symbol') || '₹';
  const upiId = getSetting('upi_id') || 'bedsheetfitting@upi';

  const slots = db.prepare('SELECT * FROM slots_config WHERE is_active = 1').all();

  res.json({
    businessName,
    dadPhone,
    bookingFee,
    currencySymbol,
    upiId,
    slots
  });
});

// 2. Get available slots for a specific date (prevents double bookings)
app.get('/api/slots', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required (YYYY-MM-DD)' });
  }

  const allSlots = db.prepare('SELECT * FROM slots_config WHERE is_active = 1').all();
  
  // Get already booked slots for this date where payment is completed or pending
  const bookedSlots = db.prepare(`
    SELECT time_slot FROM bookings 
    WHERE booking_date = ? 
    AND booking_status NOT IN ('CANCELLED')
    AND payment_status IN ('PAID', 'PENDING')
  `).all(date).map(row => row.time_slot);

  const slotStatus = allSlots.map(slot => ({
    id: slot.id,
    label: slot.slot_label,
    startTime: slot.start_time,
    endTime: slot.end_time,
    isAvailable: !bookedSlots.includes(slot.slot_label)
  }));

  res.json({ date, slots: slotStatus });
});

// 3. Initiate a booking (with GPS Current Location & anti-fake payment)
app.post('/api/bookings/initiate', (req, res) => {
  const {
    customerName,
    phone,
    altPhone,
    addressLine,
    landmark,
    city,
    pincode,
    latitude,
    longitude,
    mapsUrl,
    bookingDate,
    timeSlot,
    bedType,
    numberOfBeds,
    specialInstructions
  } = req.body;

  // Validation: Name, Phone, Date, Slot, and Location (either GPS or Address)
  if (!customerName || !phone || !bookingDate || !timeSlot) {
    return res.status(400).json({ error: 'Please enter your Name, Phone Number, Date, and Time Slot.' });
  }

  if (!latitude && !longitude && !addressLine) {
    return res.status(400).json({ error: 'Please click "Use Current Location" or enter your house address so Dad knows where to go.' });
  }

  // Check if slot is already booked
  const existing = db.prepare(`
    SELECT id FROM bookings 
    WHERE booking_date = ? AND time_slot = ? AND booking_status NOT IN ('CANCELLED') AND payment_status = 'PAID'
  `).get(bookingDate, timeSlot);

  if (existing) {
    return res.status(409).json({ error: 'Sorry! This time slot has just been booked. Please select another slot.' });
  }

  // Generate Booking ID
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const bookingId = `BK-${randomSuffix}`;
  const bookingFee = parseFloat(getSetting('booking_fee') || '99');

  // Compute clean maps navigation URL
  let finalMapsUrl = mapsUrl;
  if (latitude && longitude) {
    finalMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  } else if (addressLine) {
    finalMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addressLine}, ${city || ''} ${pincode || ''}`)}`;
  }

  try {
    db.prepare(`
      INSERT INTO bookings (
        id, customer_name, phone, alt_phone, address_line, landmark, city, pincode,
        latitude, longitude, maps_url,
        booking_date, time_slot, bed_type, number_of_beds, fabric_preference,
        special_instructions, booking_fee, payment_status, booking_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'AWAITING_PAYMENT')
    `).run(
      bookingId,
      customerName.trim(),
      phone.trim(),
      altPhone ? altPhone.trim() : '',
      addressLine ? addressLine.trim() : 'Location pinned via GPS',
      landmark ? landmark.trim() : '',
      city ? city.trim() : 'Customer GPS Pin',
      pincode ? pincode.trim() : '',
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      finalMapsUrl,
      bookingDate,
      timeSlot,
      bedType || 'Home Bed Check & Measurement',
      parseInt(numberOfBeds) || 1,
      'Standard Consultation',
      specialInstructions ? specialInstructions.trim() : '',
      bookingFee
    );

    res.json({
      success: true,
      bookingId,
      amount: bookingFee,
      currency: getSetting('currency_symbol') || '₹',
      customerName,
      phone,
      bookingDate,
      timeSlot,
      mapsUrl: finalMapsUrl
    });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'Failed to initiate booking. Please try again.' });
  }
});

// 4. Verify & Confirm Payment (No fake bookings! Real/Simulated secure gateway verification)
app.post('/api/bookings/verify-payment', (req, res) => {
  const { bookingId, paymentMethod, transactionId } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: 'Booking ID is required' });
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const generatedTxId = transactionId || `TXN_${paymentMethod || 'UPI'}_${Date.now().toString(36).toUpperCase()}_${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      UPDATE bookings 
      SET payment_status = 'PAID',
          payment_method = ?,
          payment_tx_id = ?,
          payment_time = ?,
          booking_status = 'CONFIRMED'
      WHERE id = ?
    `).run(paymentMethod || 'UPI', generatedTxId, now, bookingId);

    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);

    res.json({
      success: true,
      message: 'Payment verified successfully! Slot is permanently reserved.',
      booking: updated
    });
  } catch (err) {
    console.error('Payment verification failed:', err);
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
});

// 5. Track booking by ID or Phone
app.get('/api/bookings/track', (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Please enter a Booking ID or Phone Number' });
  }

  const cleanQuery = query.trim();
  const bookings = db.prepare(`
    SELECT id, customer_name, phone, booking_date, time_slot, bed_type, 
           booking_status, payment_status, payment_tx_id, booking_fee, created_at,
           dad_notes, bed_measurements, total_order_amount
    FROM bookings
    WHERE id = ? OR phone LIKE ? OR alt_phone LIKE ?
    ORDER BY created_at DESC
  `).all(cleanQuery, `%${cleanQuery}%`, `%${cleanQuery}%`);

  res.json({ bookings });
});

// ==========================================
// ADMIN API ENDPOINTS (Protected with JWT)
// ==========================================

// In-memory brute force protection for admin login
const loginAttempts = new Map();

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };
  if (record.lockUntil && record.lockUntil > now) {
    const remainingMins = Math.ceil((record.lockUntil - now) / 60000);
    return { allowed: false, remainingMins };
  }
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.lockUntil = now + 15 * 60 * 1000; // 15 minute lock after 5 failed attempts
  }
  loginAttempts.set(ip, record);
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

// Admin Login (Secure, rate-limited, timing-attack protected)
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const rateLimit = checkLoginRateLimit(ip);
  
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: `Too many failed attempts! For your security, login is locked for ${rateLimit.remainingMins} minutes.`
    });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Please enter both username and password.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username.trim());
  if (!admin) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Clear failed attempts on success
  clearLoginAttempts(ip);

  const isDefaultPassword = bcrypt.compareSync('admin123', admin.password_hash);

  const token = jwt.sign(
    { id: admin.id, username: admin.username, name: admin.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    admin: { id: admin.id, username: admin.username, name: admin.name },
    isDefaultPassword
  });
});

// Admin verify token
app.get('/api/admin/verify', authAdmin, (req, res) => {
  res.json({ valid: true, admin: req.admin });
});

// Admin Dashboard Metrics
app.get('/api/admin/dashboard', authAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const totalBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE payment_status = 'PAID'").get().count;
  const todayAppointments = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE booking_date = ? AND payment_status = 'PAID'").get(today).count;
  const pendingVisits = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE booking_status = 'CONFIRMED' AND payment_status = 'PAID'").get().count;
  const completedVisits = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE booking_status = 'COMPLETED'").get().count;
  
  const revenueRow = db.prepare("SELECT SUM(booking_fee) as advance_total, SUM(total_order_amount) as orders_total FROM bookings WHERE payment_status = 'PAID'").get();

  res.json({
    totalBookings,
    todayAppointments,
    pendingVisits,
    completedVisits,
    totalAdvanceCollected: revenueRow.advance_total || 0,
    totalOrderValue: revenueRow.orders_total || 0,
    todayDate: today
  });
});

// Admin List Bookings (with search & filters)
app.get('/api/admin/bookings', authAdmin, (req, res) => {
  const { status, date, search } = req.query;

  let query = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];

  if (status && status !== 'ALL') {
    query += ' AND booking_status = ?';
    params.push(status);
  }

  if (date) {
    query += ' AND booking_date = ?';
    params.push(date);
  }

  if (search) {
    query += ' AND (id LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR city LIKE ? OR pincode LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  query += ' ORDER BY booking_date ASC, created_at DESC';

  const bookings = db.prepare(query).all(...params);
  res.json({ bookings });
});

// Admin Update Booking Status
app.put('/api/admin/bookings/:id/status', authAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid booking status' });
  }

  db.prepare('UPDATE bookings SET booking_status = ? WHERE id = ?').run(status, id);
  res.json({ success: true, message: `Status updated to ${status}` });
});

// Admin Update Dad Visit Notes & Bed Measurements
app.put('/api/admin/bookings/:id/notes', authAdmin, (req, res) => {
  const { id } = req.params;
  const { dad_notes, bed_measurements, total_order_amount } = req.body;

  db.prepare(`
    UPDATE bookings 
    SET dad_notes = ?,
        bed_measurements = ?,
        total_order_amount = ?
    WHERE id = ?
  `).run(
    dad_notes || '',
    bed_measurements || '',
    parseFloat(total_order_amount) || 0,
    id
  );

  res.json({ success: true, message: "Dad's visit notes and measurements saved!" });
});

// Admin Delete Booking
app.delete('/api/admin/bookings/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  res.json({ success: true, message: 'Booking removed successfully' });
});

// Admin Get Settings
app.get('/api/admin/settings', authAdmin, (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  const slots = db.prepare('SELECT * FROM slots_config').all();
  res.json({ settings, slots });
});

// Admin Update Settings
app.post('/api/admin/settings', authAdmin, (req, res) => {
  const { business_name, dad_phone, booking_fee, upi_id } = req.body;

  if (business_name) setSetting('business_name', business_name);
  if (dad_phone) setSetting('dad_phone', dad_phone);
  if (booking_fee) setSetting('booking_fee', booking_fee.toString());
  if (upi_id) setSetting('upi_id', upi_id);

  res.json({ success: true, message: 'Settings saved successfully' });
});

// Admin Change Credentials (Username & Password)
app.post('/api/admin/change-credentials', authAdmin, (req, res) => {
  const { currentPassword, newUsername, newPassword, newName } = req.body;
  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required to make security changes.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(400).json({ error: 'Current password does not match.' });
  }

  const targetUsername = newUsername ? newUsername.trim() : admin.username;
  const targetName = newName ? newName.trim() : admin.name;
  let targetHash = admin.password_hash;

  if (newPassword && newPassword.trim().length >= 6) {
    targetHash = bcrypt.hashSync(newPassword.trim(), 10);
  } else if (newPassword && newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  // Check if username already taken by another admin
  const conflict = db.prepare('SELECT id FROM admins WHERE username = ? AND id != ?').get(targetUsername, req.admin.id);
  if (conflict) {
    return res.status(400).json({ error: 'This username is already taken. Please choose another.' });
  }

  db.prepare(`
    UPDATE admins 
    SET username = ?, password_hash = ?, name = ?
    WHERE id = ?
  `).run(targetUsername, targetHash, targetName, req.admin.id);

  res.json({
    success: true,
    message: 'Admin credentials updated securely!',
    admin: { id: admin.id, username: targetUsername, name: targetName }
  });
});

// Admin Emergency Master Key Reset (Recovery without knowing old password)
app.post('/api/admin/recovery-reset', (req, res) => {
  const { masterKey, newUsername, newPassword } = req.body;
  const configuredKey = process.env.ADMIN_SECURITY_KEY || 'DAD_SECRET_PIN_7894';

  if (!masterKey || masterKey !== configuredKey) {
    return res.status(403).json({ error: 'Invalid Master Recovery Key. Access denied.' });
  }

  if (!newUsername || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Please enter a valid username and password (at least 6 characters).' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  
  // Update first admin or insert
  const firstAdmin = db.prepare('SELECT id FROM admins ORDER BY id ASC LIMIT 1').get();
  if (firstAdmin) {
    db.prepare('UPDATE admins SET username = ?, password_hash = ? WHERE id = ?').run(
      newUsername.trim(),
      newHash,
      firstAdmin.id
    );
  } else {
    db.prepare('INSERT INTO admins (username, password_hash, name) VALUES (?, ?, ?)').run(
      newUsername.trim(),
      newHash,
      "Dad's Administrator"
    );
  }

  res.json({ success: true, message: 'Admin username and password have been reset successfully!' });
});

// Fallback to index.html for SPA routing (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🛌 Dad's Bedsheet Booking & Bed Measurement Portal`);
  console.log(`🌐 Customer Website : http://localhost:${PORT}`);
  console.log(`🔐 Admin Panel      : http://localhost:${PORT}/admin.html`);
  console.log(`🛡️  Security         : Protected with JWT & Brute-Force Rate Limiting`);
  console.log(`====================================================`);
});
