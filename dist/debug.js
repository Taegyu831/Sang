// Debug panel, loaded only with ?debug=1.
//
// Purpose: measure how much each ratio moves with head angle, with and without
// the pose correction, on a real person. Start the camera as usual, press
// record, then slowly turn left/right and nod up/down for 20 to 30 seconds.
// The summary shows, per metric, the spread (std), and how many units the
// metric shifts per 10 degrees of yaw and pitch (a good correction is near 0),
// plus how often each axis result stays the same (the number that matters for
// "same person, same result").

import { fitPoseSensitivity, meanOf, stdOf, poseWeight } from "./pose.js";
import { AXIS_ORDER, AXES, classifyAxes } from "./reading.js";
import { interpret } from "./interpret.js";

let content = null;
fetch(new URL("./content.json", import.meta.url)).then((r) => r.json()).then((c) => { content = c; }).catch(() => {});

const LIVE_KEYS = [
  ["upperThird", "상정 %"],
  ["middleThird", "중정 %"],
  ["lowerThird", "하정 %"],
  ["openMeasure", "오안 세 여백 배"],
  ["noseWidth", "코 너비 %"],
  ["mouthNose", "입/코 배"],
  ["philtrumLower", "인중/하정 %"],
  ["jawCheek", "턱/광대 %"],
  ["foreheadFace", "이마/광대 %"],
  ["faceRatio", "광대/얼굴길이 %"],
  ["eyeTilt", "눈꼬리 도"],
  ["mouthLift", "입꼬리 %"],
];
const SUMMARY_KEYS = LIVE_KEYS.map(([key]) => key).concat(["eyeGap", "noseEyeGap", "symmetry", "noseDepth"]);
const LABELS = Object.fromEntries(LIVE_KEYS);

const state = { recording: false, frames: [], last: null, summary: null };

const style = document.createElement("style");
style.textContent = `
#sangDebug{position:fixed;right:12px;bottom:12px;z-index:9999;width:392px;max-height:86vh;overflow:auto;
  background:rgba(10,10,12,.94);color:#e8e8ea;border:1px solid #3a3a40;border-radius:10px;
  font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:10px 12px}
#sangDebug h4{margin:0 0 6px;font:600 12px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.04em;display:flex;justify-content:space-between}
#sangDebug table{width:100%;border-collapse:collapse;margin:4px 0 8px}
#sangDebug th,#sangDebug td{padding:1px 4px;text-align:right;border-bottom:1px solid #26262b;white-space:nowrap}
#sangDebug th:first-child,#sangDebug td:first-child{text-align:left}
#sangDebug th{color:#9a9aa3;font-weight:500}
#sangDebug .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
#sangDebug button{background:#23232a;color:#e8e8ea;border:1px solid #4a4a52;border-radius:6px;padding:3px 8px;font:inherit;cursor:pointer}
#sangDebug button.rec{background:#7a1f1f;border-color:#b33}
#sangDebug .good{color:#7fd48a}#sangDebug .bad{color:#ff8a7a}#sangDebug .dim{color:#8a8a93}
#sangDebug .warn{color:#f1c76b}
`;
document.head.append(style);

const root = document.createElement("div");
root.id = "sangDebug";
document.body.append(root);

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "-");
const sgn = (v, d = 2) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(d)}` : "-");

function modalShare(keys) {
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  let best = null;
  for (const [k, c] of counts) if (!best || c > best[1]) best = [k, c];
  return best ? { key: best[0], share: best[1] / keys.length } : { key: "-", share: NaN };
}

function summarize(frames) {
  const rowsRaw = frames.map((f) => ({ yaw: f.pose.yaw, pitch: f.pose.pitch, ...f.rawValues }));
  const rowsFix = frames.map((f) => ({ yaw: f.pose.yaw, pitch: f.pose.pitch, ...f.correctedValues }));
  const yaws = frames.map((f) => f.pose.yaw);
  const pitches = frames.map((f) => f.pose.pitch);
  const metrics = SUMMARY_KEYS.map((key) => {
    const rawStd = stdOf(rowsRaw.map((r) => r[key]));
    const fixStd = stdOf(rowsFix.map((r) => r[key]));
    const rawFit = fitPoseSensitivity(rowsRaw, key);
    const fixFit = fitPoseSensitivity(rowsFix, key);
    return {
      key,
      rawMean: meanOf(rowsRaw.map((r) => r[key])),
      fixMean: meanOf(rowsFix.map((r) => r[key])),
      rawStd,
      fixStd,
      gain: Number.isFinite(rawStd) && rawStd > 0 ? 1 - fixStd / rawStd : NaN,
      rawYaw: rawFit ? rawFit.perYaw * 10 : NaN,
      fixYaw: fixFit ? fixFit.perYaw * 10 : NaN,
      rawPitch: rawFit ? rawFit.perPitch * 10 : NaN,
      fixPitch: fixFit ? fixFit.perPitch * 10 : NaN,
    };
  });
  const rawAxes = frames.map((f) => classifyAxes(f.rawValues));
  const fixAxes = frames.map((f) => classifyAxes(f.correctedValues));
  const axes = AXIS_ORDER.map((axis) => ({
    axis,
    raw: modalShare(rawAxes.map((a) => a.axes[axis]?.key ?? "?")),
    fixed: modalShare(fixAxes.map((a) => a.axes[axis]?.key ?? "?")),
  }));
  const wholeRaw = modalShare(rawAxes.map((a) => a.signature));
  const wholeFix = modalShare(fixAxes.map((a) => a.signature));
  let themes = [];
  if (content) {
    const rawThemes = frames.map((f) => interpret(f.rawValues, content).themes);
    const fixThemes = frames.map((f) => interpret(f.correctedValues, content).themes);
    themes = content.themes.map((t, i) => ({
      id: t.short,
      raw: modalShare(rawThemes.map((r) => r[i].state + (r[i].soft ? "~" : ""))),
      fixed: modalShare(fixThemes.map((r) => r[i].state + (r[i].soft ? "~" : ""))),
    }));
  }
  return {
    n: frames.length,
    seconds: (frames.at(-1).t - frames[0].t) / 1000,
    yawRange: [Math.min(...yaws), Math.max(...yaws)],
    pitchRange: [Math.min(...pitches), Math.max(...pitches)],
    metrics,
    axes,
    wholeRaw,
    wholeFix,
    themes,
  };
}

const liveEl = document.createElement("div");
const controlEl = document.createElement("div");
root.append(liveEl, controlEl);

// Live numbers repaint about 5 times a second; the buttons and the summary are
// only rebuilt when the state changes, so clicks are never lost to a repaint.
function renderLive() {
  const f = state.last;
  const recording = state.recording;
  const parts = [];
  parts.push(`<h4><span>DEBUG 자세 보정</span><span class="dim">${recording ? `REC ${state.frames.length}` : state.frames.length ? `${state.frames.length} frames` : "idle"}</span></h4>`);
  if (!f) {
    parts.push(`<div class="dim">카메라를 시작하고 얼굴을 비추면 값이 나옵니다.</div>`);
  } else {
    const w = poseWeight(f.pose.yaw, f.pose.pitch);
    parts.push(`<table><tr><th>자세(도)</th><th>yaw</th><th>pitch</th><th>roll</th></tr>
      <tr><td>랜드마크 기반</td><td>${sgn(f.pose.yaw, 1)}</td><td>${sgn(f.pose.pitch, 1)}</td><td>${sgn(f.pose.roll, 1)}</td></tr>
      <tr><td>MediaPipe 행렬</td><td>${sgn(f.matrixPose?.yaw, 1)}</td><td>${sgn(f.matrixPose?.pitch, 1)}</td><td>${sgn(f.matrixPose?.roll, 1)}</td></tr></table>
      <div class="dim">신뢰 가중치 ${fmt(w, 2)} · yaw+ = 원본 영상 기준 오른쪽, pitch+ = 위를 봄</div>`);
    const rows = LIVE_KEYS.map(([key, label]) => {
      const raw = f.rawValues[key];
      const fix = f.correctedValues[key];
      return `<tr><td>${label}</td><td>${fmt(raw)}</td><td>${fmt(fix)}</td><td class="dim">${sgn(fix - raw)}</td></tr>`;
    }).join("");
    parts.push(`<table><tr><th>지표</th><th>보정 전</th><th>보정 후</th><th>차이</th></tr>${rows}</table>`);
    const rawSig = classifyAxes(f.rawValues);
    const fixSig = classifyAxes(f.correctedValues);
    const axisRows = AXIS_ORDER.map((axis) => {
      const a = rawSig.axes[axis];
      const b = fixSig.axes[axis];
      const mark = (x) => (x ? `${x.key}${x.near ? "*" : ""}` : "-");
      return `<tr><td>${AXES[axis].label}</td><td>${mark(a)}</td><td>${mark(b)}</td></tr>`;
    }).join("");
    parts.push(`<table><tr><th>틀 결과(*경계 근처)</th><th>보정 전</th><th>보정 후</th></tr>${axisRows}</table>`);
    if (content) {
      const a = interpret(f.rawValues, content).themes;
      const b = interpret(f.correctedValues, content).themes;
      const themeRows = a.map((t, i) => `<tr><td>${t.short}</td><td>${t.state}${t.soft ? "~" : ""}${t.near ? "*" : ""}</td><td>${b[i].state}${b[i].soft ? "~" : ""}${b[i].near ? "*" : ""}</td></tr>`).join("");
      parts.push(`<table><tr><th>주제(~약함 *경계)</th><th>보정 전</th><th>보정 후</th></tr>${themeRows}</table>`);
    }
  }
  liveEl.innerHTML = parts.join("");
}

function renderControls() {
  const recording = state.recording;
  const parts = [];
  parts.push(`<div class="row">
    <button id="dbgRec" class="${recording ? "rec" : ""}">${recording ? "기록 정지" : "기록 시작"}</button>
    <button id="dbgClear">초기화</button>
    <button id="dbgCsv" ${state.frames.length && !recording ? "" : "disabled"}>CSV 저장</button>
    <button id="dbgCopy" ${state.summary ? "" : "disabled"}>요약 복사</button>
  </div>`);
  if (recording) parts.push(`<div class="warn">고개를 좌우로 천천히 돌리고, 위아래로 끄덕이세요. 20~30초 권장. 표정은 무표정 유지.</div>`);
  const s = state.summary;
  if (s && !recording) {
    parts.push(`<div class="dim">${s.n}프레임 · ${fmt(s.seconds, 1)}초 · yaw ${fmt(s.yawRange[0], 0)}~${fmt(s.yawRange[1], 0)} · pitch ${fmt(s.pitchRange[0], 0)}~${fmt(s.pitchRange[1], 0)}</div>`);
    const rows = s.metrics.map((m) => {
      const cls = m.gain > 0.2 ? "good" : m.gain < -0.05 ? "bad" : "";
      return `<tr><td>${LABELS[m.key] ?? m.key}</td><td>${fmt(m.rawStd)}</td><td>${fmt(m.fixStd)}</td><td class="${cls}">${Number.isFinite(m.gain) ? `${Math.round(m.gain * 100)}%` : "-"}</td></tr>`;
    }).join("");
    parts.push(`<table><tr><th>흔들림(표준편차)</th><th>전</th><th>후</th><th>감소</th></tr>${rows}</table>`);
    const slopeRows = s.metrics.map((m) => `<tr><td>${LABELS[m.key] ?? m.key}</td><td>${sgn(m.rawYaw)}</td><td>${sgn(m.fixYaw)}</td><td>${sgn(m.rawPitch)}</td><td>${sgn(m.fixPitch)}</td></tr>`).join("");
    parts.push(`<table><tr><th>각도 10도당 변화</th><th>yaw 전</th><th>후</th><th>pitch 전</th><th>후</th></tr>${slopeRows}</table>`);
    const axisRows = s.axes.map((a) => `<tr><td>${AXES[a.axis].label}</td><td>${a.raw.key} ${fmt(a.raw.share * 100, 0)}%</td><td>${a.fixed.key} ${fmt(a.fixed.share * 100, 0)}%</td></tr>`).join("")
      + `<tr><td>세 축 모두</td><td>${fmt(s.wholeRaw.share * 100, 0)}%</td><td>${fmt(s.wholeFix.share * 100, 0)}%</td></tr>`;
    parts.push(`<table><tr><th>틀 결과 일관성(최빈값 비율)</th><th>보정 전</th><th>보정 후</th></tr>${axisRows}</table>`);
    if (s.themes.length) {
      const themeRows = s.themes.map((t) => `<tr><td>${t.id}</td><td>${t.raw.key} ${fmt(t.raw.share * 100, 0)}%</td><td>${t.fixed.key} ${fmt(t.fixed.share * 100, 0)}%</td></tr>`).join("");
      parts.push(`<table><tr><th>주제 결과 일관성</th><th>보정 전</th><th>보정 후</th></tr>${themeRows}</table>`);
    }
  }
  controlEl.innerHTML = parts.join("");
  controlEl.querySelector("#dbgRec").onclick = toggleRecording;
  controlEl.querySelector("#dbgClear").onclick = () => { state.frames = []; state.summary = null; state.recording = false; render(); };
  controlEl.querySelector("#dbgCsv").onclick = downloadCsv;
  controlEl.querySelector("#dbgCopy").onclick = copySummary;
}

function render() {
  renderLive();
  renderControls();
}

function toggleRecording() {
  if (!state.recording) {
    state.frames = [];
    state.summary = null;
    state.recording = true;
  } else {
    state.recording = false;
    if (state.frames.length >= 20) state.summary = summarize(state.frames);
  }
  render();
}

function downloadCsv() {
  const keys = Object.keys(state.frames[0].rawValues).filter((k) => !["faceHeightPx", "captureQuality"].includes(k));
  const header = ["t_ms", "yaw", "pitch", "roll", "m_yaw", "m_pitch", "m_roll", ...keys.map((k) => `raw_${k}`), ...keys.map((k) => `fix_${k}`)];
  const lines = [header.join(",")];
  for (const f of state.frames) {
    lines.push([
      Math.round(f.t), f.pose.yaw, f.pose.pitch, f.pose.roll,
      f.matrixPose?.yaw ?? "", f.matrixPose?.pitch ?? "", f.matrixPose?.roll ?? "",
      ...keys.map((k) => f.rawValues[k]), ...keys.map((k) => f.correctedValues[k]),
    ].map((v) => (typeof v === "number" ? Number(v.toFixed(4)) : v)).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sang-pose-sweep-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function copySummary() {
  const s = state.summary;
  if (!s) return;
  const lines = [
    `frames ${s.n}, ${fmt(s.seconds, 1)}s, yaw ${fmt(s.yawRange[0], 0)}..${fmt(s.yawRange[1], 0)}, pitch ${fmt(s.pitchRange[0], 0)}..${fmt(s.pitchRange[1], 0)}`,
    "metric | mean raw | mean fixed | std raw | std fixed | per10deg yaw raw/fixed | per10deg pitch raw/fixed",
    ...s.metrics.map((m) => `${m.key} | ${fmt(m.rawMean)} | ${fmt(m.fixMean)} | ${fmt(m.rawStd)} | ${fmt(m.fixStd)} | ${sgn(m.rawYaw)}/${sgn(m.fixYaw)} | ${sgn(m.rawPitch)}/${sgn(m.fixPitch)}`),
    ...s.axes.map((a) => `frame ${a.axis}: raw ${a.raw.key} ${fmt(a.raw.share * 100, 0)}% / fixed ${a.fixed.key} ${fmt(a.fixed.share * 100, 0)}%`),
    ...s.themes.map((t) => `theme ${t.id}: raw ${t.raw.key} ${fmt(t.raw.share * 100, 0)}% / fixed ${t.fixed.key} ${fmt(t.fixed.share * 100, 0)}%`),
    `all axes same result: raw ${fmt(s.wholeRaw.share * 100, 0)}% / fixed ${fmt(s.wholeFix.share * 100, 0)}%`,
  ];
  navigator.clipboard?.writeText(lines.join("\n"));
}

let lastPaint = 0;
window.__sangDebug = {
  frame(data) {
    state.last = data;
    if (state.recording) state.frames.push(data);
    const now = performance.now();
    if (now - lastPaint > 200) {
      lastPaint = now;
      renderLive();
    }
  },
};
render();
