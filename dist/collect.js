// Anonymous measurements for the visitor statistics (only with the visitor's consent).
//
// What is sent: gender and age group the visitor chose, the face-ratio numbers
// the measurement produced, how reliable it was. Never a picture, never a name,
// never anything that identifies a person. Nothing is sent unless the visitor
// ticked the box on the start screen (it is unticked for every new visitor).
//
// If the network is down the record waits in this browser (also only with
// consent) and is sent the next time the page is open with internet.

export const DEFAULT_COLLECT_ENDPOINT = "https://project-zek4t.vercel.app/api/measure";
const QUEUE_KEY = "sang.pending";
const QUEUE_MAX = 200;
export const APP_VERSION = "2026-11-19";

/** The record for one finished measurement, numbers only. Returns null if it is not usable. */
export function buildRecord({ gender, age, measurement }) {
  if (!["female", "male"].includes(gender) || ![20, 30, 40, 50].includes(Number(age)) || !measurement) return null;
  const values = {};
  for (const [key, value] of Object.entries(measurement)) {
    if (typeof value === "number" && Number.isFinite(value) && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) {
      values[key] = Math.round(value * 10000) / 10000;
    }
  }
  if (Object.keys(values).length < 5) return null;
  const { confidence = 0, frames = 0 } = measurement;
  return { gender, age: Number(age), values, confidence: Math.round(confidence), frames: Math.round(frames), appVersion: APP_VERSION };
}

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function writeQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-QUEUE_MAX))); } catch { /* storage may be blocked */ }
}

async function post(endpoint, record) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record }),
    keepalive: true,
  });
  return response.ok;
}

/** Sends the record, keeping it in the queue until the server has taken it. */
export async function submitMeasurement(endpoint, record) {
  if (!endpoint || !record) return false;
  writeQueue([...readQueue(), record]);
  return flushQueue(endpoint);
}

/** Tries to send everything that is waiting. Stops at the first failure. */
export async function flushQueue(endpoint) {
  if (!endpoint) return false;
  let queue = readQueue();
  while (queue.length) {
    let sent = false;
    try { sent = await post(endpoint, queue[0]); } catch { sent = false; }
    if (!sent) return false;
    queue = readQueue().slice(1);
    writeQueue(queue);
  }
  return true;
}

export const queueLength = () => readQueue().length;
