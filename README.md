# 🛌 Dad's Bed Measurement & Visit Booking Portal

A complete Full-Stack web application with:
1. **Customer Slot Booking Website**: Customers can book an appointment slot for Dad to visit their house and check/measure their bed.
2. **1-Click GPS Location**: Customers click "Use My Current Location" so Dad can navigate directly to their exact house via Google Maps GPS.
3. **Anti-Fake Booking Payment Protection**: Requires a genuine advance booking fee (e.g. ₹99, 100% deductible from final bedsheet order) via UPI (Google Pay, PhonePe, Paytm QR) or Card so pranksters and fake addresses cannot waste Dad's time and petrol.
4. **Secured Admin Panel for You & Dad**:
   - Live metrics (Today's visits, pending appointments, advance fees collected).
   - Direct **"Drive with GPS" (Google Maps turn-by-turn navigation)** button for Dad's smartphone.
   - One-click **Call Customer** (`tel:`) and **WhatsApp direct chat** with GPS location link.
   - **Dad's Bed Measurement Notebook**: Record mattress dimensions, fabric chosen, and total order invoice.
   - Status updates (Confirmed, In Progress, Completed, Cancelled).
   - **Full Security System**:
     - No credentials in public HTML source code.
     - Public customers cannot see or access the Admin link.
     - Change admin username & password anytime from the dashboard.
     - Master recovery key in `.env` for emergency reset.
     - Brute-force rate limiting (locks out unauthorized guesses after 5 attempts).

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
# or: node server.js
```

### 3. Access URLs
- **Customer Booking Website**: [http://localhost:5050](http://localhost:5050)
- **Admin Panel**: [http://localhost:5050/admin.html](http://localhost:5050/admin.html)

---

## 🔐 Admin Security & Credentials
- The admin login inputs are completely confidential and blank (no pre-filled credentials).
- Once logged in, go to the **Settings & Password** tab to set your own custom username and password.
- **Emergency Master Recovery Key**: Stored in your private `.env` file as `ADMIN_SECURITY_KEY`. If you ever forget your password, you can reset it instantly by clicking *"Forgot / Master Key?"* on the login screen.
