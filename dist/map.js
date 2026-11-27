// The two-step result screen (?layout=map, 2026-11-27).
//   step 1  everything at a glance: one tile per region of the face and per topic
//   step 2  only what was picked, in detail; the face picture lights the part
// The last step is the whole-reading summary (summary.js), with the rule-made closing
// sentence when the call fails.
import { facetsOf, entryKey } from "./facets.js";
import { sanjeongParts } from "./sanjeong.js";
import { MAX_KEYS, summaryEndpoint, requestSummary } from "./summary.js";

// ARTIFICIAL: how many key words a tile shows.
const TILE_WORDS = 3;
// Region -> the measured point its pin sits on (the face picture's coordinates, percent).
const PINS = { forehead: "foreheadRight", face: "faceLeft", eyes: "eyeLeftOuter", nose: "noseTip", mouth: "mouthRight", jaw: "chin" };
const WORD_ROWS = [
  ["성격", ["traits"]], ["일과 재물", ["work", "workMinus"]], ["사람과 사랑", ["people", "peopleMinus"]],
  ["시기", ["early", "earlyMinus", "mid", "midMinus", "late", "lateMinus"]], ["조심할 점", ["caution"]],
];

/** The marked key words of some lines, in order, each once. */
const marksOf = (lines) => [...new Set([...lines.join(" ").matchAll(/⟦(.+?)⟧/g)].map((m) => m[1]))];

/** What the summary is asked about: the readings that lean away from the average, strongest first. */
export function summarySpecOf(parts, stop, poles, age) {
  const keys = [...parts, ...sanjeongParts(stop)]
    .filter((p) => p.dir !== "middle" && p.id !== "faceShape" && facetsOf(p))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map(entryKey);
  return { keys: [...new Set(keys)].slice(0, MAX_KEYS), poles: poles.slice(0, 2), age: age ?? 20 };
}

const wordsOfCards = (cards, fields) => {
  const out = [];
  for (const card of cards) {
    if (card.dir === "middle") continue;
    for (const field of fields) for (const word of facetsOf(card)?.[field] ?? []) if (!out.includes(word)) out.push(word);
  }
  return out;
};

const TILE_FIELDS = ["traits", "work", "workMinus", "people", "peopleMinus", "late", "early", "mid"];

/**
 * @param ui  { el, marked, storyPage, highlight(id), pin(list), fortune(), home() }
 */
export function createMap(root, ui) {
  const { el, marked } = ui;
  const answers = new Map(); // spec -> promise of paragraphs
  let data = null;

  const button = (className, onClick) => {
    const node = el("button", className);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  };

  function regions() {
    const { parts } = data;
    return [...parts.groups, parts.face]
      .filter((g) => g.parts.length)
      .map((g) => ({ ...g, name: g.id === "face" ? "얼굴 전체" : g.name }))
      // The regions that stand out come first.
      .sort((a, b) => Number(b.leaning.length > 0) - Number(a.leaning.length > 0) || (b.lead?.score ?? 0) - (a.lead?.score ?? 0));
  }

  function topics() {
    const pages = data.story.pages;
    const find = (title) => pages.find((p) => p.title === title);
    return [
      ["성격", [find("성격")]],
      ["일과 재물", [find("일과 재물")]],
      ["사람과 사랑", [find("사람과 사랑")]],
      ["시기", [find("시기")]],
      ["인연", [find("잘 맞는 인연"), find("조심할 인연")]],
    ].filter(([, list]) => list.every(Boolean));
  }

  /** One short line for a topic tile: the marked words of its page. */
  function gistOfPages(name, list) {
    if (name === "인연") return list.map((p) => p.bond?.name).filter(Boolean).join(" / ");
    // The passages say more than the headings; the heading only stands in for an empty page.
    const told = marksOf(list.flatMap((p) => p.body));
    return (told.length ? told : marksOf(list.map((p) => p.lead))).slice(0, TILE_WORDS).join(" · ");
  }

  function show(...nodes) {
    root.replaceChildren(...nodes);
    root.scrollTop = 0;
  }

  function overview() {
    ui.highlight(null);
    const head = el("header", "map-head");
    head.append(el("span", "story-tag", "한눈에 보기"), marked("h2", "story-lead", `이 사람은 ${data.story.headline}`),
      el("p", "map-hint", "궁금한 칸이나 사진의 점을 눌러 보세요."));

    const parts = el("div", "map-grid is-parts");
    regions().forEach((g) => {
      // The whole face is told by its frame (형, 삼정, 짝 부위), so its tile reads from that page.
      const frame = g.id === "face" ? marksOf([data.story.pages[0].lead]) : [];
      const leaning = frame.length > 0 || g.leaning.length > 0;
      const tile = button(leaning ? "map-tile" : "map-tile is-even", () => region(g.id));
      tile.dataset.region = g.id;
      const words = frame.length > 1 ? [`${frame.slice(1, TILE_WORDS + 1).join(", ")} 얼굴`] : wordsOfCards(g.leaning, TILE_FIELDS).slice(0, TILE_WORDS);
      tile.append(el("small", "", g.name), el("strong", "", frame[0] ?? (leaning ? g.lead.name : "보통 범위")),
        el("span", "", words.join(" · ")));
      for (const type of ["pointerenter", "focus"]) tile.addEventListener(type, () => ui.highlight(g.lead?.id ?? null));
      for (const type of ["pointerleave", "blur"]) tile.addEventListener(type, () => ui.highlight(null));
      parts.append(tile);
    });

    const themes = el("div", "map-grid is-topics");
    for (const [name, list] of topics()) {
      const tile = button("map-tile is-topic", () => topic(name));
      tile.dataset.topic = name;
      tile.append(el("small", "", name), el("span", "", gistOfPages(name, list)));
      themes.append(tile);
    }
    const all = button("map-tile is-all", summary);
    all.append(el("strong", "", "전체 정리 보기 ▶"), el("span", "", "읽은 풀이를 한 번에 엮어 드립니다"));
    themes.append(all);

    const foot = el("div", "map-foot");
    const home = button("btn small", ui.home);
    home.textContent = "처음으로";
    foot.append(home);
    show(head, el("h3", "map-section", "부위"), parts, el("h3", "map-section", "주제"), themes, foot);
  }

  function detail(title, ...nodes) {
    const bar = el("div", "map-bar");
    const back = button("btn small map-back", overview);
    back.textContent = "◀ 한눈에 보기";
    const all = button("btn small primary", summary);
    all.textContent = "전체 정리";
    if (title === "전체 정리") all.style.visibility = "hidden"; // already there
    bar.append(back, el("span", "story-tag", title), all);
    const body = el("div", "map-detail");
    body.append(...nodes);
    show(bar, body);
    back.focus({ preventScroll: true });
  }

  function cardBlock(card) {
    const block = el("article", "map-card");
    block.dataset.card = card.id;
    const title = el("h3", "map-card-name", card.name);
    title.append(el("small", "", card.part));
    block.append(title);
    if (card.mine) block.append(el("p", "map-measure", card.mine));
    if (card.summary) block.append(el("p", "story-body", card.summary));
    for (const [label, fields] of WORD_ROWS) {
      const words = wordsOfCards([card], fields);
      if (!words.length) continue;
      const row = el("div", "map-words");
      row.append(el("b", "", label), ...words.map((w) => el("span", "", w)));
      block.append(row);
    }
    block.addEventListener("pointerenter", () => ui.highlight(card.id, true));
    block.addEventListener("click", () => ui.highlight(card.id, true));
    return block;
  }

  function region(id) {
    const g = regions().find((x) => x.id === id);
    if (!g) return;
    const nodes = [];
    if (g.parts[0]?.about && g.leaning.length <= 1) nodes.push(el("p", "map-about", (g.lead ?? g.parts[0]).about));
    // The frame of the face (형, 삼정, 짝 부위) is told with the whole face.
    if (id === "face") nodes.push(ui.storyPage(data.story.pages[0]));
    nodes.push(...g.leaning.map(cardBlock));
    const even = g.parts.filter((c) => c.dir === "middle");
    if (even.length) {
      const box = el("div", "map-even");
      box.append(el("h4", "", "보통 범위라 따로 치우친 풀이가 없는 곳"));
      for (const card of even) box.append(el("p", "", `${card.name}. ${card.mine}`));
      nodes.push(box);
    }
    detail(g.name, ...nodes);
    ui.highlight(g.lead?.id ?? null, true);
  }

  function topic(name) {
    const found = topics().find(([n]) => n === name);
    if (!found) return;
    ui.highlight(null);
    detail(name, ...found[1].map((page) => ui.storyPage(page)));
  }

  function summary() {
    ui.highlight(null);
    const box = el("div", "map-summary");
    box.setAttribute("aria-live", "polite");
    const next = button("btn primary big-btn", ui.fortune);
    next.textContent = "마지막 한마디 ▶";
    detail("전체 정리", box, next);

    const closing = (note) => {
      box.classList.remove("is-loading");
      box.replaceChildren(marked("p", "map-closing", data.story.closing));
      if (note) box.append(el("p", "map-note", note));
    };
    const endpoint = summaryEndpoint();
    if (!endpoint) return closing("");
    const key = JSON.stringify(data.spec);
    if (!answers.has(key)) {
      const asked = requestSummary(endpoint, data.spec);
      asked.catch(() => answers.delete(key));
      answers.set(key, asked);
    }
    box.classList.add("is-loading");
    box.replaceChildren(el("p", "map-wait", "읽은 풀이를 하나로 엮는 중입니다"));
    answers.get(key).then((paragraphs) => {
      box.classList.remove("is-loading");
      box.replaceChildren(...paragraphs.map((p) => el("p", "story-body", p)),
        el("p", "map-note", "위 풀이 항목을 AI가 엮어 쓴 글입니다. 항목의 이름만 보내며 사진은 보내지 않습니다."));
    }).catch((error) => {
      console.warn("summary failed, showing the rule-made closing", error);
      closing("지금은 AI 정리를 불러오지 못해 기본 정리를 보여 드립니다.");
    });
  }

  return {
    render(next) {
      data = next;
      ui.pin(regions().filter((g) => (g.id === "face" || g.leaning.length) && PINS[g.id])
        .map((g) => ({ point: PINS[g.id], name: g.name, open: () => region(g.id) })));
      overview();
    },
    overview,
  };
}
