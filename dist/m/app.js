// The phone version (opened from a QR code): the same reading as the exhibition page, as one page
// that is scrolled. start -> three questions -> camera -> everything at once, revealed on the way
// down. No couple picture here (it costs money per picture and anyone with the address could ask).
// The picture and the name stay in the phone; the ratios are collected as on the big screen, marked
// "m-" because a phone held close measures differently.
// ARTIFICIAL: layout, words and the limits below. For development: ?collect=off, ?sample=1.
import { h, button, sampleFace, photoCard } from "../talk/kit.js";
import { createCharacter } from "../talk/character.js";
import { captureFace, stopCamera, prepare, ASKS, TROUBLE } from "../talk/capture-room.js";
import { TOPICS, answer, readingFor, profileOf } from "../talk/spoken.js";
import { CLOSING_QUOTE, CLOSING_SPOKEN } from "../closing.js";
import { DEFAULT_COLLECT_ENDPOINT, buildRecord, submitMeasurement } from "../collect.js";

// A phone is held upright and at arm's length: the face is smaller in the picture than at the desk.
const LIMITS = { minFaceFill: 0.2, maxFaceFill: 0.85, maxCenterOffset: 0.25 };
// A phone cuts its picture down to give the 16:9 size the desk camera is asked for, which looks
// zoomed in. The 4:3 size keeps the whole view of the front camera (not yet checked on every phone).
const CAMERA = { facingMode: "user", width: { ideal: 1440 }, height: { ideal: 1080 }, resizeMode: { ideal: "none" } };
const params = new URLSearchParams(location.search);
const collect = params.get("collect") === "off" ? "" : params.get("collect") || DEFAULT_COLLECT_ENDPOINT;
const page = document.querySelector("#page");
const master = createCharacter();
let content = null;
let visitor = { age: null, gender: null, name: "", face: null };
let run = 0;
let watcher = null;

const marked = (tag, className, text) => {
  const node = h(tag, className);
  text.split(/⟦|⟧/).forEach((chunk, i) => { if (chunk) node.append(i % 2 ? h("em", "", chunk) : chunk); });
  return node;
};
/** The character in his round sticker, behind his desk. */
const stageOf = (className) => h("div", `stage ${className}`, h("div", "dot"), h("div", "desk"), h("div", "actor", master.el));
function show(...nodes) {
  run += 1;
  watcher?.disconnect();
  stopCamera();
  page.replaceChildren(...nodes);
  master.desk(727);
  scrollTo(0, 0);
}

function start() {
  visitor = { age: null, gender: null, name: "", face: null };
  show(h("section", "cover",
    h("p", "team", "이음 | IUM"),
    h("h1", "", h("span", "", "내 얼굴"), " ", h("span", "mark", "읽어 보기")),
    stageOf("big"),
    button("cta", ask, "내 관상 보기"),
    h("ul", "notes", ...["약 3분이면 돼요", "얼굴 사진은 저장되지 않아요", "얼굴 비율 숫자는 이름 없이 통계로 모아요"].map((t) => h("li", "", t)))));
  master.pose("hello");
}

function ask() {
  prepare().catch(() => {}); // the measuring model starts loading while the questions are answered
  const bubble = h("p", "bubble", "먼저 몇 가지만 여쭐게요.");
  const go = h("button", "cta", "얼굴 보여 주기");
  go.type = "submit";
  go.disabled = true;
  const ready = () => { go.disabled = !(visitor.age && visitor.gender && input.value.trim()); };
  const pick = (title, key, options) => {
    const row = h("div", "chips");
    for (const [label, value] of options) {
      const chip = button("chip", () => { visitor[key] = value; [...row.children].forEach((c) => c.classList.toggle("is-on", c === chip)); master.pose("write"); ready(); }, label);
      row.append(chip);
    }
    return h("div", "field", h("h2", "", title), row);
  };
  const input = h("input", "name");
  Object.assign(input, { type: "text", maxLength: 10, placeholder: "이름", autocomplete: "off", spellcheck: false, enterKeyHint: "done" });
  input.setAttribute("aria-label", "이름");
  const tail = h("span", "", "라고 합니다.");
  input.addEventListener("input", () => {
    const text = input.value.trim(); const last = text.charCodeAt(text.length - 1) - 0xac00;
    tail.textContent = last >= 0 && last < 11172 && last % 28 ? "이라고 합니다." : "라고 합니다.";
    ready();
  });
  const form = h("form", "ask",
    pick("나이대", "age", [["20대", 20], ["30대", 30], ["40대", 40], ["50대", 50]]),
    pick("성별", "gender", [["여성", "female"], ["남성", "male"]]),
    h("div", "field", h("h2", "", "이름"), h("label", "sentence", h("span", "", "저는"), input, tail), h("p", "small", "이름은 저장하지 않아요")),
    go,
    h("p", "small", "카메라 허용을 눌러 주세요. 처음에는 준비에 시간이 걸릴 수 있어요(약 17MB)."));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    visitor.name = input.value.replace(/[⟦⟧]/g, "").trim().slice(0, 10).replace(/(?<=..)님$/, "");
    if (visitor.age && visitor.gender && visitor.name) shoot();
  });
  show(stageOf("mid"), bubble, form);
  master.pose("listen");
}

async function shoot() {
  const video = h("video", ""); video.muted = true; video.playsInline = true;
  const words = h("p", "bubble", "자, 얼굴을 찬찬히 살펴볼게요.");
  const arrow = h("b", "arrow");
  const glass = h("div", "glass", video, h("div", "oval"), arrow);
  const out = h("div", "way-out");
  show(h("section", "camera", words, glass, stageOf("mid"), out));
  const mine = run;
  const alive = () => mine === run;
  master.pose("focus");
  const line = (id) => { const [pose, text, mark] = ASKS[id]; master.pose(pose); words.textContent = text; arrow.textContent = mark; arrow.dataset.side = mark === "▶" ? "right" : "left"; };
  const offer = (text) => { words.textContent = text; out.replaceChildren(button("cta", shoot, "다시 해 보기"), button("plain", start, "처음으로")); };
  const late = setTimeout(() => { if (alive() && !visitor.face) out.replaceChildren(button("plain", shoot, "다시 해 보기"), button("plain", start, "처음으로")); }, 60000);
  let current = null; let since = 0; let shown = null;
  try {
    const face = params.get("sample") === "1" ? sampleFace() : await captureFace(video, alive, {
      stage(id) { current = id; shown = null; line(id); },
      trouble(code) {
        if (!code) { since = 0; if (shown && current) { shown = null; line(current); } return; }
        since ||= performance.now();
        if (performance.now() - since > 1200 && shown !== code && TROUBLE[code]) { shown = code; words.textContent = TROUBLE[code]; }
      },
      progress(p) { glass.style.setProperty("--p", p); },
    }, { limits: LIMITS, camera: CAMERA, widest: true });
    if (!face || !alive()) return;
    visitor.face = face;
    share();
    result();
  } catch (error) {
    console.error(error);
    if (alive()) offer("카메라를 켤 수 없어요. 카메라를 허용했는지 확인해 주세요. 카카오톡 같은 앱 안에서 열었다면 Safari나 Chrome에서 열어 주세요.");
  } finally { clearTimeout(late); }
}

function share() {
  if (!collect || visitor.face.sample) return;
  const record = buildRecord({ gender: visitor.gender, age: visitor.age, measurement: visitor.face.values });
  if (record) submitMeasurement(collect, { ...record, appVersion: `m-${record.appVersion}`.slice(0, 20) }).catch(() => {});
}

function result() {
  const reading = readingFor(visitor.face.values, visitor.age, content);
  const me = profileOf(reading);
  const who = visitor.name;
  const said = h("p", "said");
  const top = h("header", "top", stageOf("mini"), said);
  /** A part of the page: what he says and how he sits while it is being read. */
  const part = (pose, line, className, ...children) => {
    const node = h("section", `part ${className}`, ...children);
    node.dataset.pose = pose; node.dataset.say = line;
    return node;
  };
  const parts = [
    part("peek", `찰칵! ${who}님, 다 봤어요.`, "hello",
      photoCard(visitor.face), h("h2", "", `${who}님은`), h("p", "headline", me.headline), h("div", "tags", ...me.traits.map((t) => h("span", "", t))), h("p", "down", "아래로 내려 보세요 ↓")),
    ...TOPICS.map((topic, i) => part(["think", "write", "listen", "sky", "push"][i], `${topic.note} 이야기예요.`, "topic",
      h("h2", "", topic.note), ...answer(reading, topic.id, who).lines.map((l) => marked("p", /^(그래서|그러니)/.test(l) ? "say advice" : "say", l)))),
    part("listen", CLOSING_SPOKEN[0], "closing",
      h("h2", "", "마지막 한마디"), h("p", "mean", CLOSING_QUOTE.meaning), h("p", "han", CLOSING_QUOTE.han), h("p", "reading", CLOSING_QUOTE.ko),
      ...CLOSING_SPOKEN.slice(1).map((l, i, all) => marked("p", i >= all.length - 2 ? "word key" : "word", l.replace("{name}", () => who)))),
    part("cheer", "또 놀러 오세요!", "last",
      h("div", "card", h("div", "card-top", photoCard(visitor.face), h("div", "", h("small", "", "오늘의 관상 노트"), h("h2", "", who), h("p", "headline", me.headline))),
        h("div", "tags", ...me.traits.map((t) => h("span", "", t))),
        h("dl", "", ...me.rows.map(([label, text]) => h("div", "", h("dt", "", label), h("dd", "", text)))),
        h("p", "small", "재미로 보는 관상 풀이예요 · 화면을 캡처해 간직하세요")),
      button("cta", start, "처음으로"), h("p", "small", "이 화면을 닫으면 사진과 풀이는 사라져요.")),
  ];
  show(top, ...parts);
  // each piece comes up as it enters the screen; the character follows the part being read
  watcher = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); watcher.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const node of page.querySelectorAll(".part > *")) watcher.observe(node);
  let at = null;
  const follow = () => {
    const line = innerHeight * 0.55;
    const end = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    const now = end ? parts.at(-1) : [...parts].reverse().find((p) => p.getBoundingClientRect().top < line) ?? parts[0];
    if (now === at) return;
    at = now; master.pose(now.dataset.pose); said.textContent = now.dataset.say;
  };
  const mine = run;
  const onScroll = () => { if (mine !== run) removeEventListener("scroll", onScroll); else follow(); };
  addEventListener("scroll", onScroll, { passive: true });
  follow();
}

content = await (await fetch(new URL("../parts.json", import.meta.url))).json();
start();
