// The 역학원 master: a small pixel character (dist/master.js) that blinks,
// talks while a speech bubble types out, and raises a finger to point.

import { MASTER } from "./master.js";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function paint(canvas, frameName) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  MASTER.frames[frameName].forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch === ".") continue;
      ctx.fillStyle = MASTER.palette[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

/**
 * Creates one character. scale = screen pixels per sprite pixel.
 * animate: false draws a still picture (used on the many part cards).
 */
export function createMaster({ scale = 4, pose = "idle", animate = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = MASTER.w;
  canvas.height = MASTER.h;
  canvas.className = "master";
  canvas.style.width = `${MASTER.w * scale}px`;
  canvas.setAttribute("aria-hidden", "true");

  let base = pose;
  let mouthOpen = false;
  let eyesShut = false;
  let talkUntil = 0;
  let talkTimer = 0;
  let blinkTimer = 0;

  const frameName = () => {
    if (mouthOpen) return base === "point" ? "pointTalk" : "talk";
    if (eyesShut && base === "idle") return "blink";
    return base;
  };
  const render = () => paint(canvas, frameName());

  const scheduleBlink = () => {
    blinkTimer = window.setTimeout(() => {
      eyesShut = true;
      render();
      window.setTimeout(() => { eyesShut = false; render(); scheduleBlink(); }, 140);
    }, 2200 + Math.random() * 2800);
  };

  const api = {
    node: canvas,
    setPose(next) { base = next; render(); },
    // Flap the mouth for a while (the bubble's typing calls this).
    talk(ms = 700) {
      if (reducedMotion()) return;
      talkUntil = performance.now() + ms;
      if (talkTimer) return;
      talkTimer = window.setInterval(() => {
        if (performance.now() > talkUntil) {
          window.clearInterval(talkTimer);
          talkTimer = 0;
          mouthOpen = false;
        } else {
          mouthOpen = !mouthOpen;
        }
        render();
      }, 130);
    },
    stop() { window.clearTimeout(blinkTimer); window.clearInterval(talkTimer); },
  };

  render();
  if (animate && !reducedMotion()) scheduleBlink();
  return api;
}

/**
 * Types text into a bubble one character at a time while the master talks,
 * like an old game. A new call cancels the one still typing.
 */
export function say(master, textNode, text, { speed = 32 } = {}) {
  const token = Symbol("say");
  textNode.dataset.sayToken = String(token.description);
  textNode._sayToken = token;
  if (reducedMotion() || !text) {
    textNode.textContent = text;
    return;
  }
  const chars = [...text];
  textNode.textContent = "";
  master.talk(chars.length * speed + 200);
  chars.forEach((_, i) => {
    window.setTimeout(() => {
      if (textNode._sayToken !== token) return;
      textNode.textContent = chars.slice(0, i + 1).join("");
    }, i * speed);
  });
}

/** Puts a master in front of an existing bubble element. */
export function mountMaster(row, options) {
  const master = createMaster(options);
  row.prepend(master.node);
  return master;
}
