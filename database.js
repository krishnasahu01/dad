const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'bedsheet_bookings.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for high performance
db.pragma('journal_mode = WAL');

// Initialize tables
function initDb() {
  // Settings table (booking fee, dad's business name, phone, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Admin users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Time slots template
  db.exec(`
    CREATE TABLE IF NOT EXISTS slots_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_label TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
  `);

  // Bookings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      alt_phone TEXT,
      address_line TEXT NOT NULL,
      landmark TEXT,
      city TEXT NOT NULL,
      pincode TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      bed_type TEXT NOT NULL,
      number_of_beds INTEGER DEFAULT 1,
      fabric_preference TEXT,
      special_instructions TEXT,
      booking_fee REAL NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PAID, REFUNDED
      payment_method TEXT,                            -- UPI, CARD, NETBANKING, RAZORPAY
      payment_tx_id TEXT,
      payment_time DATETIME,
      booking_status TEXT NOT NULL DEFAULT 'CONFIRMED', -- CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED
      dad_notes TEXT,
      bed_measurements TEXT,
      total_order_amount REAL DEFAULT 0,
      latitude REAL,
      longitude REAL,
      maps_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations for existing database
  try { db.exec("ALTER TABLE bookings ADD COLUMN latitude REAL;"); } catch (e) {}
  try { db.exec("ALTER TABLE bookings ADD COLUMN longitude REAL;"); } catch (e) {}
  try { db.exec("ALTER TABLE bookings ADD COLUMN maps_url TEXT;"); } catch (e) {}

  // Insert default settings if not exists
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  if (!getSetting.get('business_name')) {
    setSetting.run('business_name', "Dad's Handcrafted Bedsheets & Bed Fitting");
  }
  if (!getSetting.get('dad_phone')) {
    setSetting.run('dad_phone', '+91 9876543210');
  }
  if (!getSetting.get('booking_fee')) {
    setSetting.run('booking_fee', '99'); // ₹99 Advance anti-fake visit fee (deducted from final order)
  }
  if (!getSetting.get('currency_symbol')) {
    setSetting.run('currency_symbol', '₹');
  }
  if (!getSetting.get('upi_id')) {
    setSetting.run('upi_id', 'bedsheetfitting@upi');
  }

  // Insert default slots if empty
  const countSlots = db.prepare('SELECT COUNT(*) as count FROM slots_config').get();
  if (countSlots.count === 0) {
    const insertSlot = db.prepare('INSERT INTO slots_config (slot_label, start_time, end_time) VALUES (?, ?, ?)');
    insertSlot.run('Morning Slot 1 (09:00 AM - 11:30 AM)', '09:00', '11:30');
    insertSlot.run('Afternoon Slot 2 (12:00 PM - 02:30 PM)', '12:00', '14:30');
    insertSlot.run('Evening Slot 3 (03:30 PM - 06:00 PM)', '15:30', '18:00');
    insertSlot.run('Night Slot 4 (06:30 PM - 08:30 PM)', '18:30', '20:30');
  }

  // Insert default admin if not exists (username: admin, password: admin123)
  const countAdmins = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (countAdmins.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admins (username, password_hash, name) VALUES (?, ?, ?)').run(
      'admin',
      hash,
      "Dad's Bedsheet Admin"
    );
  }

  // Seed 2 sample initial bookings so the admin panel has nice data out of the box
  const countBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get();
  if (countBookings.count === 0) {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO bookings (
        id, customer_name, phone, alt_phone, address_line, landmark, city, pincode,
        booking_date, time_slot, bed_type, number_of_beds, fabric_preference,
        special_instructions, booking_fee, payment_status, payment_method, payment_tx_id,
        payment_time, booking_status, dad_notes, bed_measurements, total_order_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'BK-78912',
      'Rajesh Sharma',
      '+91 9823456780',
      '+91 9823456781',
      'Flat 402, Sunshine Heights, MG Road',
      'Opposite City Mall',
      'Mumbai',
      '400001',
      today,
      'Morning Slot 1 (09:00 AM - 11:30 AM)',
      'King Size (Double Mattress)',
      2,
      '100% Pure Cotton with Floral Print',
      'Please bring sample cloth fabrics and measuring tape for deep 10-inch mattress.',
      99,
      'PAID',
      'UPI (GooglePay)',
      'UPI94827103948',
      new Date().toISOString(),
      'CONFIRMED',
      'Call 15 mins before arrival. Security gate needs visitor entry.',
      'King Bed: 72" x 78", Mattress depth: 10 inches',
      1800
    );

    db.prepare(`
      INSERT INTO bookings (
        id, customer_name, phone, alt_phone, address_line, landmark, city, pincode,
        booking_date, time_slot, bed_type, number_of_beds, fabric_preference,
        special_instructions, booking_fee, payment_status, payment_method, payment_tx_id,
        payment_time, booking_status, dad_notes, bed_measurements, total_order_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'BK-45190',
      'Pooja Verma',
      '+91 9765432109',
      '',
      'House #14, Green Park Society, Near Shiv Temple',
      'Near Shiv Temple',
      'Pune',
      '411001',
      tomorrow,
      'Evening Slot 3 (03:30 PM - 06:00 PM)',
      'Queen Size (Custom Elastic Fitted)',
      1,
      'Glazed Soft Cotton - Pastel Mint Green',
      'Need elastic fitted bedsheet so corners do not slip off.',
      99,
      'PAID',
      'Card (Visa)',
      'TXN_CARD_883291',
      new Date().toISOString(),
      'CONFIRMED',
      '',
      '',
      0
    );
  }
}

initDb();

module.exports = db;
