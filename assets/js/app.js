import { ALIASES } from "./aliases.js";
import { loadStats, recordWin, recordSkip, derivedStats, resetStats } from "./stats.js";

const toRad = (d) => d * Math.PI / 180;
const toDeg = (r) => r * 180 / Math.PI;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const λ1 = toRad(lon1), λ2 = toRad(lon2);
  const y = Math.sin(λ2-λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bearingToArrow(b) {
  if (b >= 337.5 || b < 22.5) return "⬆️";
  if (b < 67.5) return "↗️";
  if (b < 112.5) return "➡️";
  if (b < 157.5) return "↘️";
  if (b < 202.5) return "⬇️";
  if (b < 247.5) return "↙️";
  if (b < 292.5) return "⬅️";
  return "↖️";
}

function normName(s) {
  return (s || "").trim().toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/’/g, "'")
    .replace(/[.,]/g, "");
}

function applyAlias(inputNormalized) {
  const mapped = ALIASES.get(inputNormalized);
  return mapped ? normName(mapped) : inputNormalized;
}

function proximityPct(distanceKm) {
  const max = 20015;
  const x = Math.max(0, Math.min(distanceKm, max));
  const pct = Math.round(100 * Math.exp(-x / 4500));
  return Math.max(0, Math.min(100, pct));
}

// DOM
const svg = document.getElementById("svg");
const statusEl = document.getElementById("status");
const guessInput = document.getElementById("guessInput");
const guessBtn = document.getElementById("guessBtn");
const skipBtn = document.getElementById("skipBtn");
const guessLog = document.getElementById("guessLog");
const guessCountEl = document.getElementById("guessCount");
const roundCountEl = document.getElementById("roundCount");
const streakCountEl = document.getElementById("streakCount");
const countriesList = document.getElementById("countriesList");
const keyboardEl = document.getElementById("keyboard");
const toast = document.getElementById("toast");

const proxPctEl = document.getElementById("proxPct");
const proxFill = document.getElementById("proxFill");

// stats modal
const statsBtn = document.getElementById("statsBtn");
const statsModal = document.getElementById("statsModal");
const closeStatsBtn = document.getElementById("closeStatsBtn");
const resetStatsBtn = document.getElementById("resetStatsBtn");

const sRounds = document.getElementById("sRounds");
const sWins = document.getElementById("sWins");
const sWinPct = document.getElementById("sWinPct");
const sAvgGuesses = document.getElementById("sAvgGuesses");
const sBestStreak = document.getElementById("sBestStreak");
const sStreak = document.getElementById("sStreak");

// SVG helpers
function clearSvg() { while (svg.firstChild) svg.removeChild(svg.firstChild); }

function drawPath(d, fill = "#e8e8e8", stroke = "rgba(11,12,16,.35)", strokeWidth = 2) {
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  p.setAttribute("fill", fill);
  p.setAttribute("stroke", stroke);
  p.setAttribute("stroke-width", String(strokeWidth));
  svg.appendChild(p);
}

// Minimal TopoJSON -> GeoJSON features (world-atlas countries-110m)
function topoToGeoFeatures(topo) {
  const arcs = topo.arcs;
  const transform = topo.transform;

  function arcToPoints(arcIndex) {
    let idx = arcIndex;
    let reverse = false;
    if (idx < 0) { idx = ~idx; reverse = true; }
    const arc = arcs[idx];
    let x = 0, y = 0;
    const pts = arc.map(([dx, dy]) => {
      x += dx; y += dy;
      const lon = x * transform.scale[0] + transform.translate[0];
      const lat = y * transform.scale[1] + transform.translate[1];
      return [lon, lat];
    });
    return reverse ? pts.reverse() : pts;
  }

  function objectToCoordinates(obj) {
    if (obj.type === "Polygon") {
      return obj.arcs.map(ring => ring.flatMap(a => arcToPoints(a)));
    }
    if (obj.type === "MultiPolygon") {
      return obj.arcs.map(poly => poly.map(ring => ring.flatMap(a => arcToPoints(a))));
    }
    return null;
  }

  const geos = [];
  const collection = topo.objects.countries;
  if (!collection || collection.type !== "GeometryCollection") return geos;

  for (const g of collection.geometries) {
    const coords = objectToCoordinates(g);
    if (!coords) continue;
    geos.push({ type: "Feature", properties: g.properties || {}, geometry: { type: g.type, coordinates: coords } });
  }
  return geos;
}

function fitProjector(feature, width = 1000, height = 780, pad = 60) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords;
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(feature.geometry.coordinates);

  const lonSpan = (maxLon - minLon) || 1;
  const latSpan = (maxLat - minLat) || 1;

  const sx = (width - 2*pad) / lonSpan;
  const sy = (height - 2*pad) / latSpan;
  const s = Math.min(sx, sy);

  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;

  return (lon, lat) => {
    const x = (lon - cx) * s + width / 2;
    const y = (cy - lat) * s + height / 2;
    return [x, y];
  };
}

function featureToSvgPath(feature) {
  const project = fitProjector(feature);
  function ringToPath(ring) {
    let d = "";
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = project(ring[i][0], ring[i][1]);
      d += (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)} ` : `L ${x.toFixed(2)} ${y.toFixed(2)} `);
    }
    return d + "Z ";
  }

  let d = "";
  if (feature.geometry.type === "Polygon") {
    for (const ring of feature.geometry.coordinates) d += ringToPath(ring);
  } else if (feature.geometry.type === "MultiPolygon") {
    for (const poly of feature.geometry.coordinates) for (const ring of poly) d += ringToPath(ring);
  }
  return d.trim();
}

function featureCentroid(feature) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords;
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(feature.geometry.coordinates);
  return [(minLon + maxLon)/2, (minLat + maxLat)/2];
}

// Game state
let features = [];
let byName = new Map();
let currentTarget = null;
let guessCount = 0;
let roundCount = 1;
let stats = loadStats();

function showToast(msg) {
  toast.textContent = msg;
  toast.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.style.display = "none", 1200);
}

function setProximityUI(pct) {
  proxPctEl.textContent = pct === null ? "—" : String(pct);
  proxFill.style.width = pct === null ? "0%" : `${pct}%`;
}

function updateTopMeta() {
  guessCountEl.textContent = String(guessCount);
  roundCountEl.textContent = String(roundCount);
  streakCountEl.textContent = String(stats.streak || 0);
}

function clearRoundUI() {
  guessLog.innerHTML = "";
  guessCount = 0;
  setProximityUI(null);
  statusEl.textContent = "Make a guess.";
  guessInput.value = "";
  guessInput.focus();
  updateTopMeta();
}

function pickRandomTarget() { return features[Math.floor(Math.random() * features.length)]; }

function renderSilhouette(feature) {
  clearSvg();
  const d = featureToSvgPath(feature);
  drawPath(d, "#e8e8e8", "rgba(11,12,16,.35)", 2);
}

function startNewRound() {
  currentTarget = pickRandomTarget();
  renderSilhouette(currentTarget);
  roundCount += 1;
  clearRoundUI();
  updateTopMeta();
}

function logGuess(name, arrow, km, pct) {
  const row = document.createElement("div");
  row.className = "guessitem";
  row.innerHTML = `
    <div><strong>${name}</strong></div>
    <div class="pill">
      <span>${arrow}</span>
      <span>${Math.round(km).toLocaleString()} km</span>
      <span>•</span>
      <span>${pct}%</span>
    </div>
  `;
  guessLog.prepend(row);
}

function resolveGuessFeature(rawInput) {
  let key = normName(rawInput);
  key = applyAlias(key);
  if (byName.has(key)) return byName.get(key);
  const key2 = key.replace(/^the\s+/, "");
  if (byName.has(key2)) return byName.get(key2);
  return null;
}

function handleGuess() {
  if (!currentTarget) return;
  const raw = guessInput.value;
  if (!raw.trim()) return;

  const guessFeature = resolveGuessFeature(raw);
  if (!guessFeature) {
    statusEl.textContent = "Not found. Try one of the dropdown suggestions (start typing).";
    return;
  }

  guessCount += 1;
  updateTopMeta();

  const targetName = currentTarget.properties.name || "Unknown";
  const guessName = guessFeature.properties.name || "Unknown";

  const [gLon, gLat] = featureCentroid(guessFeature);
  const [tLon, tLat] = featureCentroid(currentTarget);

  const km = haversineKm(gLat, gLon, tLat, tLon);
  const b = bearingDeg(gLat, gLon, tLat, tLon);
  const arrow = bearingToArrow(b);

  const correct = normName(guessName) === normName(targetName);
  const pct = correct ? 100 : proximityPct(km);

  setProximityUI(pct);
  logGuess(guessName, arrow, km, pct);

  if (correct) {
    statusEl.textContent = `✅ Correct: ${targetName}`;
    stats = recordWin(stats, guessCount);
    updateTopMeta();
    showToast(`Correct! ${targetName} — next round…`);
    setTimeout(() => startNewRound(), 650);
  } else {
    statusEl.textContent = "Keep going — unlimited guesses.";
    guessInput.value = "";
    guessInput.focus();
  }
}

function handleSkip() {
  if (!currentTarget) return;
  const targetName = currentTarget.properties.name || "Unknown";
  statusEl.textContent = `⏭️ Skipped. It was: ${targetName}`;
  showToast(`Skipped: ${targetName}`);
  stats = recordSkip(stats);
  updateTopMeta();
  setTimeout(() => startNewRound(), 500);
}

// Keyboard
function makeKey(label, { wide = false, onClick } = {}) {
  const btn = document.createElement("button");
  btn.className = "kbtn" + (wide ? " wide" : "");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildKeyboard() {
  keyboardEl.innerHTML = "";
  const rows = [
    "QWERTYUIOP".split(""),
    "ASDFGHJKL".split(""),
    ["ENTER", ..."ZXCVBNM".split(""), "⌫"]
  ];

  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "krow";
    for (const k of r) {
      if (k === "ENTER") row.appendChild(makeKey("ENTER", { wide: true, onClick: () => handleGuess() }));
      else if (k === "⌫") row.appendChild(makeKey("⌫", { wide: true, onClick: () => { guessInput.value = guessInput.value.slice(0, -1); guessInput.focus(); } }));
      else row.appendChild(makeKey(k, { onClick: () => { guessInput.value += k; guessInput.focus(); } }));
    }
    keyboardEl.appendChild(row);
  }
}

// Stats modal
function openStats() {
  const d = derivedStats(stats);
  sRounds.textContent = String(stats.rounds);
  sWins.textContent = String(stats.wins);
  sWinPct.textContent = String(d.winPct);
  sAvgGuesses.textContent = d.avgGuesses ? d.avgGuesses.toFixed(2) : "0";
  sBestStreak.textContent = String(stats.bestStreak);
  sStreak.textContent = String(stats.streak);

  statsModal.style.display = "flex";
  statsModal.setAttribute("aria-hidden", "false");
}
function closeStats() {
  statsModal.style.display = "none";
  statsModal.setAttribute("aria-hidden", "true");
}

statsBtn.addEventListener("click", openStats);
closeStatsBtn.addEventListener("click", closeStats);
statsModal.addEventListener("click", (e) => { if (e.target === statsModal) closeStats(); });
resetStatsBtn.addEventListener("click", () => { stats = resetStats(); updateTopMeta(); openStats(); });

// Events
guessBtn.addEventListener("click", handleGuess);
skipBtn.addEventListener("click", handleSkip);
guessInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleGuess(); });

// Init
async function init() {
  buildKeyboard();
  updateTopMeta();

  const res = await fetch("./data/countries-110m.json");
  if (!res.ok) throw new Error("Missing data/countries-110m.json");
  const topo = await res.json();

  features = topoToGeoFeatures(topo).filter(f => f && f.geometry && f.properties && f.properties.name);

  byName.clear();
  countriesList.innerHTML = "";

  for (const f of features) {
    const name = f.properties.name;
    const key = normName(name);
    if (!byName.has(key)) byName.set(key, f);

    const loose = normName(name.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""));
    if (!byName.has(loose)) byName.set(loose, f);

    const opt = document.createElement("option");
    opt.value = name;
    countriesList.appendChild(opt);
  }

  statusEl.textContent = "Make a guess.";
  currentTarget = pickRandomTarget();
  renderSilhouette(currentTarget);
  clearRoundUI();
}

init().catch((err) => {
  console.error(err);
  statusEl.textContent = "Failed to load map data. Put countries-110m.json into /data then refresh.";
});
