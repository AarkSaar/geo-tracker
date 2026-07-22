// ─── CONSTANTS ────────────────────────────────────────────────
const USERS = {
  "admin@geo.com": { password: "admin123", role: "admin", name: "Admin" },
  "user@geo.com": { password: "user123", role: "student", name: "John Doe" },
};

const STORAGE_KEYS = {
  SESSION: "gt_session",
  RECORDS: "gt_records",
  ACTIVE_SESS: "gt_active_session",
};

// Geofence center & radius (canvas units)
const GEO = { cx: 210, cy: 120, radius: 70 };

// ─── STATE ────────────────────────────────────────────────────
let state = {
  user: null,
  insideZone: false,
  clockedIn: false,
  clockInTime: null,
  position: { x: GEO.cx + 120, y: GEO.cy }, // starts outside
};

// ─── HELPERS ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const fmt = (d) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtFull = (d) =>
  new Date(d).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function duration(ms) {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function getRecords() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS) || "[]");
}
function saveRecord(r) {
  const records = getRecords();
  records.push(r);
  localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
}

// ─── SCREENS ──────────────────────────────────────────────────
function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

// ─── AUTH ─────────────────────────────────────────────────────
function tryLogin() {
  const email = $("auth-email").value.trim();
  const pass = $("auth-password").value;
  const user = USERS[email];
  const err = $("auth-error");

  if (!user || user.password !== pass) {
    err.textContent = "Invalid email or password.";
    err.classList.remove("hidden");
    return;
  }
  err.classList.add("hidden");

  if ($("remember-me").checked) {
    localStorage.setItem(
      STORAGE_KEYS.SESSION,
      JSON.stringify({ email, role: user.role, name: user.name }),
    );
  }

  state.user = { email, ...user };
  user.role === "admin" ? loadAdmin() : loadDashboard();
}

function logout(clearAll = false) {
  if (clearAll) localStorage.removeItem(STORAGE_KEYS.SESSION);
  state.user = null;
  state.clockedIn = false;
  state.clockInTime = null;
  $("auth-email").value = "";
  $("auth-password").value = "";
  showScreen("screen-auth");
}

// ─── DASHBOARD ────────────────────────────────────────────────
function loadDashboard() {
  showScreen("screen-dashboard");
  $("user-name-header").textContent = state.user.name;

  // restore active session from storage
  const saved = JSON.parse(
    localStorage.getItem(STORAGE_KEYS.ACTIVE_SESS) || "null",
  );
  if (saved) {
    state.clockedIn = true;
    state.clockInTime = saved.clockInTime;
    $("btn-clockin").classList.add("hidden");
    $("btn-clockout").classList.remove("hidden");
  }

  drawCanvas();
  renderSessionLog();
}

// ─── GEOFENCE CANVAS ──────────────────────────────────────────
function drawCanvas() {
  const canvas = $("geo-canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background grid
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Geofence zone (shaded circle)
  ctx.beginPath();
  ctx.arc(GEO.cx, GEO.cy, GEO.radius, 0, Math.PI * 2);
  ctx.fillStyle = state.insideZone
    ? "rgba(134,239,172,0.12)"
    : "rgba(56,189,248,0.08)";
  ctx.fill();
  ctx.strokeStyle = state.insideZone ? "#86efac" : "#38bdf8";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Zone label
  ctx.fillStyle = state.insideZone ? "#86efac" : "#38bdf8";
  ctx.font = "11px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("100m Zone", GEO.cx, GEO.cy - GEO.radius - 8);

  // Office marker
  ctx.fillStyle = "#38bdf8";
  ctx.font = "18px serif";
  ctx.textAlign = "center";
  ctx.fillText("🏢", GEO.cx, GEO.cy + 6);

  // User dot
  const { x, y } = state.position;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = state.insideZone ? "#22c55e" : "#ef4444";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Accuracy ring
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.strokeStyle = state.insideZone
    ? "rgba(34,197,94,0.3)"
    : "rgba(239,68,68,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // "You" label
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 10px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("YOU", x, y - 22);
}

function setPosition(inside) {
  state.insideZone = inside;
  state.position = inside
    ? { x: GEO.cx + 20, y: GEO.cy + 10 }
    : { x: GEO.cx + 140, y: GEO.cy };

  // Update status card
  const card = document.getElementById("status-card");
  const text = document.getElementById("status-text");
  card.className = "status-card " + (inside ? "inside" : "outside");
  text.textContent = inside
    ? "Status: WITHIN BOUNDARY"
    : "Status: OUTSIDE BOUNDARY";

  // Enable/disable clock-in
  if (!state.clockedIn) {
    $("btn-clockin").disabled = !inside;
  }

  drawCanvas();

  // Show alert if clocked in and left
  if (!inside && state.clockedIn) {
    showNotification("⚠️ You left the geofence zone!");
  }
  if (inside && !state.clockedIn) {
    showNotification("✅ You entered the work zone. You may Clock In.");
  }
}

// ─── CLOCK IN / OUT ───────────────────────────────────────────
function clockIn() {
  if (!state.insideZone) return;
  state.clockedIn = true;
  state.clockInTime = Date.now();
  localStorage.setItem(
    STORAGE_KEYS.ACTIVE_SESS,
    JSON.stringify({
      clockInTime: state.clockInTime,
      user: state.user.email,
    }),
  );
  $("btn-clockin").classList.add("hidden");
  $("btn-clockout").classList.remove("hidden");
  showNotification("🟢 Clocked In at " + fmt(state.clockInTime));
  renderSessionLog();
}

function clockOut() {
  const clockOutTime = Date.now();
  const record = {
    user: state.user.name,
    email: state.user.email,
    clockIn: state.clockInTime,
    clockOut: clockOutTime,
    duration: clockOutTime - state.clockInTime,
  };
  saveRecord(record);
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESS);

  state.clockedIn = false;
  state.clockInTime = null;
  $("btn-clockout").classList.add("hidden");
  $("btn-clockin").classList.remove("hidden");
  $("btn-clockin").disabled = !state.insideZone;
  showNotification("🔴 Clocked Out. Duration: " + duration(record.duration));
  renderSessionLog();
}

// ─── SESSION LOG ──────────────────────────────────────────────
function renderSessionLog() {
  const container = $("session-log");
  const today = new Date().toDateString();
  const records = getRecords().filter(
    (r) =>
      r.email === state.user?.email &&
      new Date(r.clockIn).toDateString() === today,
  );

  // Show active session at top
  let html = "";
  if (state.clockedIn && state.clockInTime) {
    html += `<div class="session-entry">
      <span><span class="in">▶ In:</span> ${fmt(state.clockInTime)}</span>
      <span class="dur">Ongoing…</span>
    </div>`;
  }

  records
    .slice()
    .reverse()
    .forEach((r) => {
      html += `<div class="session-entry">
      <span><span class="in">▶ In:</span> ${fmt(r.clockIn)} &nbsp; <span class="out">◀ Out:</span> ${fmt(r.clockOut)}</span>
      <span class="dur">${duration(r.duration)}</span>
    </div>`;
    });

  container.innerHTML =
    html || '<p style="color:#475569;font-size:13px">No sessions today.</p>';
}

// ─── ADMIN PANEL ──────────────────────────────────────────────
function loadAdmin() {
  showScreen("screen-admin");
  const records = getRecords();
  const tbody = $("attendance-body");
  const noRec = $("no-records");

  if (records.length === 0) {
    tbody.innerHTML = "";
    noRec.classList.remove("hidden");
    return;
  }
  noRec.classList.add("hidden");
  tbody.innerHTML = records
    .slice()
    .reverse()
    .map(
      (r) => `
    <tr>
      <td>${r.user}</td>
      <td>${fmtFull(r.clockIn)}</td>
      <td>${r.clockOut ? fmtFull(r.clockOut) : '<em style="color:#64748b">Active</em>'}</td>
      <td style="color:#38bdf8;font-weight:600">${duration(r.duration)}</td>
    </tr>
  `,
    )
    .join("");
}

function exportCSV() {
  const records = getRecords();
  if (!records.length) return alert("No records to export.");
  const rows = [["Student", "Clock In", "Clock Out", "Duration (min)"]];
  records.forEach((r) =>
    rows.push([
      r.user,
      fmtFull(r.clockIn),
      fmtFull(r.clockOut),
      Math.floor(r.duration / 60000),
    ]),
  );
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "attendance.csv";
  a.click();
}

// ─── NOTIFICATION TOAST ───────────────────────────────────────
function showNotification(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  el.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:#1e293b; border:1px solid #334155; color:#f1f5f9;
    padding:12px 20px; border-radius:10px; font-size:13px;
    box-shadow:0 8px 24px rgba(0,0,0,0.5); z-index:9999;
    animation: fadeIn .3s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── EVENT LISTENERS ──────────────────────────────────────────
$("btn-login").addEventListener("click", tryLogin);
$("auth-password").addEventListener(
  "keydown",
  (e) => e.key === "Enter" && tryLogin(),
);
$("btn-logout").addEventListener("click", () => logout(true));
$("btn-admin-logout").addEventListener("click", () => logout(true));
$("btn-clockin").addEventListener("click", clockIn);
$("btn-clockout").addEventListener("click", clockOut);
$("btn-export").addEventListener("click", exportCSV);

document.querySelectorAll(".sim-btn").forEach((btn) => {
  btn.addEventListener("click", () =>
    setPosition(btn.dataset.pos === "inside"),
  );
});

// ─── INIT ─────────────────────────────────────────────────────
const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || "null");
if (saved) {
  state.user = { ...saved, password: USERS[saved.email]?.password };
  saved.role === "admin" ? loadAdmin() : loadDashboard();
} else {
  showScreen("screen-auth");
}
