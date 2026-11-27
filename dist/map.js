// The two-step result screen (?layout=map, 2026-11-27).
//   step 1  everything at a glance: one tile per topic (the frame of the face is one of them)
//   step 2  only what was picked, in detail; pointing at a part name lights it on the picture
// The last step is the whole-reading summary (summary.js), with the rule-made closing
// sentence when the call fails.
import { facetsOf, entryKey } from "./facets.js";
import { sanjeongParts } from "./sanjeong.js";
import { MAX_KEYS, summaryEndpoint, requestSummary } from "./summary.js";

// ARTIFICIAL: how many key words a tile shows.
const TILE_WORDS = 3;
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

/**
 * @param ui  { el, marked, storyPage, highlight(id), fortune(), home() }
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

  function topics() {
    const pages = data.story.pages;
    const find = (title) => pages.find((p) => p.title === title);
    return [
      ["얼굴의 틀", [find("얼굴의 틀")]],
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
      el("p", "map-hint", "궁금한 칸을 눌러 보세요."));

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
    show(head, themes, foot);
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
      overview();
    },
    overview,
  };
}
