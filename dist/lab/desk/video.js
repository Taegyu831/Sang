// Look 1: a video platform. The reading plays in a player, the next topic is queued on the right.
import { h, button, rich, photoCard, focusPart, countUp, firstSentence, replay } from "./engine.js";

const TEASERS = [["내가 돈복이 있는 얼굴일까?", "일과 재물"], ["첫인상이 말해 주는 내 성격", "성격"], ["나랑 찰떡인 사람의 얼굴", "인연"], ["내 전성기는 언제?", "시기"], ["연애할 때 나는 어떤 상?", "사람과 사랑"]];
const toon = () => h("div", "toon", h("i"), h("i"), h("i"));

export function video(stage) {
  const search = h("div", "v-search", "내 얼굴 관상");
  const player = h("div", "v-player");
  const bar = h("div", "v-progress");
  const title = h("h1", "v-title");
  const meta = h("p", "v-meta");
  const side = h("aside", "v-side");
  stage.replaceChildren(h("div", "v-app",
    h("header", "v-top", h("div", "v-logo", h("b", "", "▶"), "관상TV"), search, h("div", "v-me", "AI")),
    h("main", "v-main", h("div", "v-frame", player, bar), title, meta), side));

  const set = (name, sub, ...content) => {
    title.textContent = name; meta.textContent = sub;
    player.replaceChildren(...content);
    bar.replaceChildren(); bar.classList.remove("is-one");
  };
  const thumb = (face, part) => {
    if (!face) return h("div", "v-thumb is-empty", "▶");
    const photo = photoCard(face);
    if (part) { focusPart(photo, face, part, 1.35); photo.over.replaceChildren(); }
    return h("div", "v-thumb", photo.box);
  };
  const queue = (items, head) => {
    side.replaceChildren(h("div", "v-side-head", h("b", "", head), h("span", "v-auto", "자동재생", h("i"))), ...items);
  };
  const row = (face, part, name, sub, state = "", onClick = () => {}) =>
    button(`v-row ${state}`, onClick, thumb(face, part), h("div", "", h("strong", "", name), h("span", "", sub)));
  const topicList = (ctx, data, face, index) => queue(data.topics.map((t, i) =>
    row(face, data.shown[i % data.shown.length], t.ask, i === index ? "지금 재생 중" : i < index ? "시청함" : i === index + 1 ? "다음 재생" : t.title, i === index ? "is-now" : i < index ? "is-done" : "", () => ctx.jump(i))), "내 관상 재생목록");

  return {
    attract(ctx, start) {
      const word = h("em", "", "재물");
      set("눌러서 내 관상 영상 만들기", "AI 관상 · 약 3분 · SPACE 또는 ENTER",
        h("div", "v-hero", h("div", "", h("p", "v-badge", "지금 만들 수 있어요"), h("h2", "", "내 얼굴의 ", word, "운,", h("br"), "영상으로 알려 드림"),
          button("v-play", start, h("b", "", "▶"), "시작하기")), toon()));
      queue(TEASERS.map(([t, s], i) => { const r = row(null, null, t, s, "up", start); r.style.animationDelay = `${i * 0.12}s`; return r; }), "추천 영상");
      (async () => { const words = ["재물", "연애", "성공", "인기", "전성기"]; let i = 0; while (await ctx.wait(1600)) { i = (i + 1) % words.length; word.textContent = words[i]; replay(word); side.append(side.children[1]); replay(side.lastChild, "up"); } })();
    },
    pick(ctx, question, labels, choose) {
      set(question, "숫자 키를 누르거나 클릭",
        h("div", "v-pick", h("h2", "", question), h("div", "v-options", ...labels.map((l, i) => { const b = button("v-option up", () => choose(i), h("kbd", "", String(i + 1)), h("b", "", l)); b.style.animationDelay = `${i * 0.08}s`; return b; }))));
    },
    camera(ctx) {
      const cam = h("video", ""); cam.muted = true; cam.playsInline = true;
      const count = h("div", "count");
      const box = h("div", "camera v-fill", cam, h("div", "ring"), count, h("span", "v-live", "● LIVE"));
      set("카메라를 켜는 중", "정면을 보면 자동으로 찍혀요", box);
      queue([h("p", "v-tip", "눈썹이 보이게 머리를 살짝 넘기고, 화면을 똑바로 봐 주세요."), button("v-ghost", ctx.sample, "카메라 없이 예시로 보기 (S)")], "촬영 안내");
      return { video: cam, say: (t) => { title.textContent = t; }, found: (f) => box.classList.toggle("is-found", f), count: (n) => { count.textContent = n ?? ""; replay(count); }, flash: () => box.append(h("div", "flash")) };
    },
    analysis(ctx, face, data) {
      const photo = photoCard(face, "scanning");
      const info = h("div", "v-info");
      set("[분석] 내 얼굴 측정하는 중", "실제로 잰 값이에요", h("div", "v-analyze", photo.box, info));
      const chapters = ["점 찍기", ...data.shown.map((p) => p.part), "모으기"];
      const rows = chapters.map((c, i) => h("div", "v-chapter", h("b", "", String(i + 1)), c));
      queue(rows, "분석 챕터");
      bar.replaceChildren(...chapters.map(() => h("i")));
      return {
        photo,
        step(n, total, text) { rows.forEach((r, i) => { r.classList.toggle("is-now", i === n - 1); r.classList.toggle("is-done", i < n - 1); }); [...bar.children].forEach((c, i) => c.classList.toggle("is-on", i < n)); title.textContent = `[분석] ${text}`; },
        dots(count) { info.replaceChildren(h("b", "v-number", String(count)), h("p", "v-caption", "개의 점으로 얼굴을 읽어요")); },
        part(part) { const number = h("b", "v-number", "0"); info.replaceChildren(h("p", "v-part up", part.part), number, h("h2", "v-name up", part.name), h("p", "v-caption up", firstSentence(part.mine))); countUp(number, part, ctx); },
        collect(words) { info.replaceChildren(h("h2", "v-name", "찾았다!"), h("div", "v-words", ...words.map((w, i) => { const s = h("span", "in", w); s.style.animationDelay = `${i * 0.2}s`; return s; }))); },
      };
    },
    topic(ctx, data, index, face) {
      const t = data.topics[index];
      const photo = photoCard(face);
      const keys = h("div", "v-keys");
      const caption = h("div", "v-sub");
      const next = h("div", "v-next");
      const pauseMark = h("div", "v-paused", "❚❚");
      set(`${t.ask}`, `${index + 1}번째 영상 · ${t.title} · SPACE 멈춤, ← → 넘기기`,
        h("div", "v-topic", photo.box, h("div", "v-text", h("p", "v-badge", t.title), keys, caption)), next, pauseMark);
      player.querySelector(".v-topic").addEventListener("click", ctx.togglePause);
      const fill = h("i", "is-fill"); bar.replaceChildren(fill); bar.classList.add("is-one");
      topicList(ctx, data, face, index);
      focusPart(photo, face, data.shown[index % data.shown.length], 1.18);
      const units = [...t.words.map((text) => ({ word: true, text })), ...t.lines.map((text) => ({ text }))];
      const upcoming = data.topics[index + 1]?.ask ?? "마지막 정리";
      return {
        units,
        show(i) {
          if (i < t.words.length) keys.append(h("strong", "in", t.words[i]));
          else caption.replaceChildren(rich("p", "up", t.lines[i - t.words.length]));
        },
        progress(f, left) { fill.style.width = `${f * 100}%`; const soon = left <= 4000; next.textContent = soon ? `${Math.ceil(left / 1000)}초 뒤 다음 영상: ${upcoming}` : ""; next.classList.toggle("is-on", soon); },
      };
    },
    final(ctx, data, face, summary, again) {
      const photo = photoCard(face);
      const text = h("div", "v-summary", h("p", "v-wait", "AI가 전체 정리를 쓰는 중"));
      set("내 관상 총정리", "휴대폰으로 찍어 가세요 · 얼굴 사진은 저장되지 않아요",
        h("div", "v-end", h("div", "v-card up", photo.box, h("div", "v-words", ...data.words.slice(0, 5).map((w) => h("span", "", w))), h("p", "v-bond", `찰떡 ${data.fit}`), h("p", "v-bond is-clash", `조심 ${data.clash}`)),
          h("div", "v-endtext", rich("h2", "up", data.story.headline), text, button("v-play", again, h("b", "", "↻"), "처음으로"))));
      topicList(ctx, data, face, data.topics.length);
      summary.then((s) => { if (ctx.alive()) text.replaceChildren(...s.paragraphs.map((p, i) => { const n = h("p", "up", p); n.style.animationDelay = `${i * 0.5}s`; return n; }), s.ai ? h("small", "", "AI가 풀이 항목을 엮어 쓴 글입니다.") : h("span")); });
    },
  };
}
