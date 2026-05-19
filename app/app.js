'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  cpu: [], mem: [], net: [], disk: [],
  startTime: Date.now(),
  currentFilter: 'all',
  logs: [],
};

const MAX_POINTS = 60;

// ─── CHART ENGINE ─────────────────────────────────────────────────────────────
class Sparkline {
  constructor(canvasId, color, gradFrom, gradTo) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.color = color;
    this.gradFrom = gradFrom;
    this.gradTo = gradTo;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = 100 * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = '100px';
    this.ctx.scale(dpr, dpr);
    this.W = rect.width;
    this.H = 100;
  }

  draw(data) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    if (data.length < 2) return;

    const step = W / (MAX_POINTS - 1);
    const pad = 4;

    // Grid lines
    ctx.strokeStyle = 'rgba(30,42,56,0.6)';
    ctx.lineWidth = 1;
    [25, 50, 75].forEach(pct => {
      const y = H - pad - (pct / 100) * (H - pad * 2);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    });

    // Fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, this.gradFrom);
    grad.addColorStop(1, this.gradTo);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, H);
    data.forEach((v, i) => {
      const x = i * step;
      const y = H - pad - (v / 100) * (H - pad * 2);
      i === 0 ? ctx.lineTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo((data.length - 1) * step, H);
    ctx.closePath();
    ctx.fill();

    // Line
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 6;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = H - pad - (v / 100) * (H - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Latest dot
    const last = data[data.length - 1];
    const lx = (data.length - 1) * step;
    const ly = H - pad - (last / 100) * (H - pad * 2);
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ─── SERVICES DATA ────────────────────────────────────────────────────────────
const SERVICES = [
  { name: 'API Gateway',    port: 8080 },
  { name: 'Prometheus',     port: 9090 },
  { name: 'Grafana',        port: 3000 },
  { name: 'Node Exporter',  port: 9100 },
  { name: 'Alert Manager',  port: 9093 },
  { name: 'cAdvisor',       port: 8081 },
  { name: 'k8s Controller', port: 6443 },
  { name: 'etcd',           port: 2379 },
];

const METRICS_DEFS = [
  { name: 'http_requests_total',         type: 'counter', base: 18420 },
  { name: 'http_request_duration_p99',   type: 'gauge',   base: 0.287 },
  { name: 'process_cpu_seconds_total',   type: 'counter', base: 3812 },
  { name: 'go_goroutines',               type: 'gauge',   base: 42 },
  { name: 'node_memory_bytes',           type: 'gauge',   base: 4294967296 },
  { name: 'container_cpu_usage',         type: 'gauge',   base: 0.12 },
  { name: 'kube_pod_status_phase',       type: 'gauge',   base: 1 },
  { name: 'up',                          type: 'gauge',   base: 1 },
];

const LOG_MESSAGES = {
  INFO: [
    'Scrape completed: target=prometheus interval=15s',
    'Pod scheduled: nginx-deployment-abc123 → node-1',
    'Health check passed: /healthz 200 OK',
    'Alert resolved: HighCPUUsage (duration=2m30s)',
    'Config reload triggered: prometheus.yml changed',
    'Metrics stored: 1284 samples in 12ms',
    'Service discovered: new endpoint registered',
    'Garbage collection completed: freed 128MB',
  ],
  WARN: [
    'Scrape timeout: target=node-exporter:9100 exceeded 10s',
    'Memory pressure detected: 82% used',
    'Slow query: alert evaluation took 450ms',
    'Rate limit approaching: 900/1000 req/min',
    'Certificate expires in 14 days: *.cluster.local',
  ],
  ERROR: [
    'Failed to reach target: connection refused :9093',
    'Pod CrashLoopBackOff: redis-5d8b9f-xk2p4',
    'OOM killed: container exceeded memory limit',
    'Alert rule evaluation failed: invalid PromQL syntax',
  ],
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
let cpuChart, memChart;

function init() {
  cpuChart = new Sparkline('cpu-chart', '#00e5ff', 'rgba(0,229,255,0.15)', 'rgba(0,229,255,0)');
  memChart = new Sparkline('mem-chart', '#ff6b35', 'rgba(255,107,53,0.15)', 'rgba(255,107,53,0)');

  buildServices();
  buildMetricsTable();

  setInterval(tick, 1000);
  setInterval(addLog, 2200);
  tick();
  addLog();
  addLog();
  addLog();

  setupNav();
  setupLogFilters();
  clockTick();
  setInterval(clockTick, 1000);
}

// ─── SIMULATION ───────────────────────────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function smooth(arr, newVal) {
  const last = arr.length ? arr[arr.length - 1] : newVal;
  const v = Math.max(0, Math.min(100, last + (newVal - last) * 0.35 + rand(-2, 2)));
  arr.push(v);
  if (arr.length > MAX_POINTS) arr.shift();
  return v;
}

let cpuTarget = 45, memTarget = 60;

function tick() {
  // Occasionally spike
  if (Math.random() < 0.04) cpuTarget = rand(70, 95);
  else cpuTarget += rand(-5, 5);
  cpuTarget = Math.max(10, Math.min(95, cpuTarget));

  if (Math.random() < 0.02) memTarget = rand(75, 90);
  else memTarget += rand(-2, 2);
  memTarget = Math.max(30, Math.min(92, memTarget));

  const cpu  = smooth(state.cpu, cpuTarget);
  const mem  = smooth(state.mem, memTarget);
  const net  = smooth(state.net, rand(10, 60));
  const disk = smooth(state.disk, rand(40, 75));

  updateKPI('cpu', cpu, cpu > 80 ? 'danger' : cpu > 60 ? 'warn' : '');
  updateKPI('mem', mem, mem > 85 ? 'danger' : mem > 70 ? 'warn' : '');
  updateKPI('net', net, '');
  updateKPI('disk', disk, disk > 80 ? 'danger' : '');

  cpuChart.draw(state.cpu);
  memChart.draw(state.mem);

  updateMetricsTable();
}

function updateKPI(id, val, cls) {
  const display = id === 'net' ? val.toFixed(1) : Math.round(val);
  document.getElementById(`${id}-val`).textContent = display;
  const fill = document.getElementById(`${id}-fill`);
  fill.style.width = Math.min(val, 100) + '%';
  fill.className = `kpi-fill ${cls}`;
}

// ─── SERVICES ─────────────────────────────────────────────────────────────────
function buildServices() {
  const grid = document.getElementById('services-grid');
  SERVICES.forEach(svc => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.id = `svc-${svc.port}`;

    const up = Math.random() > 0.1;
    const status = up ? 'up' : (Math.random() > 0.5 ? 'degraded' : 'down');
    const latency = up ? Math.round(rand(1, 40)) : '--';

    card.innerHTML = `
      <div class="service-name">${svc.name}</div>
      <div class="service-status">
        <span class="status-dot ${status}"></span>
        <span>${status.toUpperCase()}</span>
      </div>
      <div class="service-latency">:${svc.port} · ${latency}ms</div>
    `;
    grid.appendChild(card);
  });

  // Occasionally flip a service status
  setInterval(() => {
    const svc = SERVICES[Math.floor(Math.random() * SERVICES.length)];
    const card = document.getElementById(`svc-${svc.port}`);
    if (!card) return;
    const up = Math.random() > 0.12;
    const status = up ? 'up' : (Math.random() > 0.5 ? 'degraded' : 'down');
    const latency = up ? Math.round(rand(1, 40)) : '--';
    card.querySelector('.status-dot').className = `status-dot ${status}`;
    card.querySelector('.service-status span:last-child').textContent = status.toUpperCase();
    card.querySelector('.service-latency').textContent = `:${svc.port} · ${latency}ms`;
  }, 5000);
}

// ─── METRICS TABLE ────────────────────────────────────────────────────────────
let metricVals = METRICS_DEFS.map(m => m.base);

function buildMetricsTable() {
  const body = document.getElementById('metrics-body');
  METRICS_DEFS.forEach((m, i) => {
    const tr = document.createElement('tr');
    tr.id = `mrow-${i}`;
    tr.innerHTML = `
      <td class="metric-name">${m.name}</td>
      <td class="metric-val" id="mval-${i}">-</td>
      <td><span class="metric-type">${m.type}</span></td>
      <td id="mtrend-${i}">─</td>
    `;
    body.appendChild(tr);
  });
  updateMetricsTable();
}

function updateMetricsTable() {
  METRICS_DEFS.forEach((m, i) => {
    const prev = metricVals[i];
    let next;
    if (m.type === 'counter') next = prev + rand(0, 10);
    else next = prev * (1 + rand(-0.05, 0.05));
    next = Math.max(0, next);
    metricVals[i] = next;

    const valEl = document.getElementById(`mval-${i}`);
    const trendEl = document.getElementById(`mtrend-${i}`);
    if (!valEl) return;

    valEl.textContent = next > 1000000
      ? (next / 1073741824).toFixed(2) + ' GB'
      : next > 1000
        ? Math.round(next).toLocaleString()
        : next.toFixed(3);

    const diff = next - prev;
    trendEl.textContent = diff > 0 ? '▲' : diff < 0 ? '▼' : '─';
    trendEl.className = diff > 0 ? 'trend-up' : diff < 0 ? 'trend-down' : 'trend-flat';
  });
}

// ─── LOGS ─────────────────────────────────────────────────────────────────────
function addLog() {
  const r = Math.random();
  const level = r < 0.6 ? 'INFO' : r < 0.85 ? 'WARN' : 'ERROR';
  const msgs = LOG_MESSAGES[level];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);

  const entry = { time, level, msg };
  state.logs.push(entry);
  if (state.logs.length > 200) state.logs.shift();

  renderLog(entry);
}

function renderLog(entry) {
  if (state.currentFilter !== 'all' && entry.level !== state.currentFilter) return;

  const stream = document.getElementById('log-stream');
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.dataset.level = entry.level;
  div.innerHTML = `
    <span class="log-time">${entry.time}</span>
    <span class="log-level ${entry.level}">${entry.level}</span>
    <span class="log-msg">${entry.msg}</span>
  `;
  stream.appendChild(div);
  stream.scrollTop = stream.scrollHeight;

  // Limit DOM nodes
  while (stream.children.length > 100) stream.removeChild(stream.firstChild);
}

function renderAllLogs() {
  const stream = document.getElementById('log-stream');
  stream.innerHTML = '';
  state.logs.forEach(e => renderLog(e));
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
      if (btn.dataset.view === 'logs') renderAllLogs();
      if (btn.dataset.view === 'dashboard') {
        setTimeout(() => { cpuChart.resize(); cpuChart.draw(state.cpu); memChart.resize(); memChart.draw(state.mem); }, 50);
      }
    });
  });
}

function setupLogFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.dataset.level;
      renderAllLogs();
    });
  });
  document.getElementById('clear-logs').addEventListener('click', () => {
    state.logs = [];
    document.getElementById('log-stream').innerHTML = '';
  });
}

// ─── CLOCK & UPTIME ──────────────────────────────────────────────────────────
function clockTick() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toTimeString().slice(0, 8);

  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  document.getElementById('uptime-display').textContent = `UPTIME: ${h}:${m}:${s}`;
}

// ─── START ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
