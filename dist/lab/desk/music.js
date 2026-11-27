// Look 3: a music player. Each topic is a track, the reading lights up line by line like lyrics,
// and the end is a wrap-up card.
import { h, button, rich, photoCard, focusPart, countUp, firstSentence, replay } from "./engine.js";

const COLORS = ["#7a3cff", "#ff5a36", "#00a86b", "#e8338f", "#1e6bff"];
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const TRACKS = ["나는 어떤 사람", "돈이 들어오는 얼굴", "사랑은 이렇게", "전성기", "찰떡 인연"];

export function music(stage) {
  const list = h("div", "m-list");
  const main = h("main", "m-main");
  const now = h("div", "m-now");
  const fill = h("i");
  const play = h("button", "m-play", "▶"); play.type = "button";
  const prev = h("button", "", "⏮"); const next = h("button", "", "⏭");
  prev.type = next.type = "button";
  const time = h("span", "m-time", "0:00");
  const total = h("span", "m-time", "0:00");
  stage.replaceChildren(h("div", "m-app",
    h("nav", "m-nav", h("div", "m-logo", h("b", ""), "관상 플레이"), h("p", "m-label", "내 라이브러리"), list, h("p", "m-keys", "SPACE 멈춤 · ← → 곡 넘기기 · ESC 처음")),
    main, h("footer", "m-bar", now, h("div", "m-controls", h("div", "", prev, play, next), h("div", "m-track", time, h("div", "m-line", fill), total)), h("div", "m-eq", ...Array.from({ length: 14 }, (_, i) => { const b = h("i"); b.style.animationDelay = `${(i % 5) * -0.19}s`; return b; })))));
  const color = (c) => stage.querySelector(".m-app").style.setProperty("--tone", c);
  const set = (...content) => { main.replaceChildren(...content); main.scrollTop = 0; };
  const bar = (face, title, sub) => {
    const art = h("div", "m-art");
    if (face) art.append(photoCard(face).box);
    now.replaceChildren(art, h("div", "", h("strong", "", title), h("span", "", sub)));
  };
  const controls = (actions) => { prev.onclick = actions.prev ?? null; next.onclick = actions.next ?? null; play.onclick = actions.play ?? null; play.textContent = actions.icon ?? "▶"; };
  const tracks = (names, index, onClick) => list.replaceChildren(...names.map((n, i) => button(`m-item ${i === index ? "is-now" : ""}`, () => onClick(i), h("b", "", i === index ? "♪" : String(i + 1)), h("span", "", n))));
  const reset = () => { fill.style.width = "0%"; time.textContent = "0:00"; total.textContent = "0:00"; };

  return {
    attract(ctx, start) {
      color(COLORS[0]); reset(); tracks(TRACKS, -1, start);
      bar(null, "내 얼굴 플레이리스트", "아직 재생 전"); controls({ play: start, next: start });
      const word = h("em", "", TRACKS[1]);
      set(h("div", "m-hero", h("div", "m-disc", h("div", "toon", h("i"), h("i"), h("i"))),
        h("div", "", h("p", "m-kicker", "약 3분 플레이리스트"), h("h1", "", "당신의 얼굴을", h("br"), "재생해 보세요"), h("p", "m-rolling", "다음 곡: ", word), button("m-cta", start, "▶  재생하기"), h("p", "m-hint", "SPACE 또는 ENTER"))));
      (async () => { let i = 1; while (await ctx.wait(1500)) { i = (i + 1) % TRACKS.length; word.textContent = TRACKS[i]; replay(word); color(COLORS[i]); } })();
    },
    pick(ctx, question, labels, choose) {
      color(COLORS[1]); controls({}); bar(null, "취향 설정 중", question);
      set(h("div", "m-pick", h("p", "m-kicker", "맞춤 설정"), h("h2", "", question), h("div", "m-options", ...labels.map((l, i) => { const b = button("m-option up", () => choose(i), h("b", "", l), h("kbd", "", String(i + 1))); b.style.setProperty("--c", COLORS[i]); b.style.animationDelay = `${i * 0.08}s`; return b; }))));
    },
    camera(ctx) {
      color(COLORS[4]);
      const cam = h("video", ""); cam.muted = true; cam.playsInline = true;
      const count = h("div", "count");
      const box = h("div", "camera m-camera", cam, h("div", "ring"), count);
      const say = h("h2", "", "카메라를 켜는 중");
      set(h("div", "m-shoot", box, h("div", "", h("p", "m-kicker", "앨범 커버 촬영"), say, h("p", "m-hint", "정면을 보면 자동으로 찍혀요"), button("m-ghost", ctx.sample, "카메라 없이 예시로 보기 (S)"))));
      bar(null, "앨범 커버 촬영", "녹화 대기");
      return { video: cam, say: (t) => { say.textContent = t; }, found: (f) => box.classList.toggle("is-found", f), count: (n) => { count.textContent = n ?? ""; replay(count); }, flash: () => box.append(h("div", "flash")) };
    },
    analysis(ctx, face, data) {
      color(COLORS[0]); controls({ next: () => ctx.jump(0), icon: "❚❚", play: ctx.togglePause });
      const photo = photoCard(face, "scanning m-photo");
      const info = h("div", "m-info");
      const status = h("p", "m-kicker", "믹싱 중");
      set(h("div", "m-analyze", photo.box, h("div", "m-side", status, info)));
      bar(face, "믹싱 중", "내 얼굴을 곡으로 만드는 중");
      tracks(TRACKS, -1, (i) => ctx.jump(i));
      return {
        photo,
        step(n, total, text) { status.textContent = text; fill.style.width = `${(n / total) * 100}%`; time.textContent = `${n}/${total}`; },
        dots(count) { info.replaceChildren(h("b", "m-number", String(count)), h("h3", "", "개의 점을 샘플링")); },
        part(part, i) { color(COLORS[i % COLORS.length]); const b = h("b", "m-number", "0"); info.replaceChildren(b, h("h3", "up", part.name), h("p", "up", firstSentence(part.mine))); countUp(b, part, ctx); },
        collect(words) { info.replaceChildren(h("h3", "", "믹스 완성!"), h("div", "m-words", ...words.map((w, i) => { const s = h("span", "in", w); s.style.background = COLORS[i % COLORS.length]; s.style.animationDelay = `${i * 0.2}s`; return s; }))); },
      };
    },
    topic(ctx, data, index, face) {
      const t = data.topics[index];
      color(COLORS[index % COLORS.length]); reset();
      const photo = photoCard(face, "m-photo");
      const words = h("div", "m-words");
      const lyrics = h("div", "m-lyrics");
      const lines = t.lines.map((l) => rich("p", "", l));
      lyrics.append(...lines);
      set(h("div", "m-topic", h("div", "m-cover", photo.box, h("p", "m-kicker", `TRACK ${index + 1} · ${t.title}`), h("h2", "", TRACKS[index] ?? t.title), words), lyrics));
      focusPart(photo, face, data.shown[index % data.shown.length], 1.18);
      bar(face, TRACKS[index] ?? t.title, t.title);
      tracks(data.topics.map((x, i) => TRACKS[i] ?? x.title), index, (i) => ctx.jump(i));
      controls({ prev: () => ctx.jump(index - 1), next: () => ctx.jump(index + 1), play: ctx.togglePause, icon: "❚❚" });
      lyrics.onclick = ctx.togglePause;
      return {
        units: t.lines.map((text) => ({ text })),
        show(i) {
          lines.forEach((p, j) => { p.className = j === i ? "is-on" : j < i ? "is-past" : ""; });
          if (t.words[i]) words.append(h("span", "in", t.words[i]));
          if (i === lines.length - 1) t.words.slice(lines.length).forEach((w) => words.append(h("span", "in", w)));
          const target = lines[i].offsetTop - lyrics.offsetHeight * 0.36;
          lyrics.style.setProperty("--shift", `${-Math.max(0, target)}px`);
        },
        progress(f, left, length) { fill.style.width = `${f * 100}%`; time.textContent = clock(length - left); total.textContent = clock(length); },
        paused(p) { play.textContent = p ? "▶" : "❚❚"; },
      };
    },
    final(ctx, data, face, summary, again) {
      color(COLORS[3]); fill.style.width = "100%"; time.textContent = total.textContent;
      const photo = photoCard(face, "m-photo");
      const text = h("div", "m-summary", h("p", "m-wait", "해설을 쓰는 중"));
      set(h("div", "m-wrap", h("div", "m-card in", h("p", "m-kicker", "나의 관상 결산"), photo.box, h("ol", "", ...data.words.slice(0, 5).map((w, i) => { const li = h("li", "up", h("b", "", String(i + 1)), w); li.style.animationDelay = `${0.4 + i * 0.25}s`; return li; })), h("div", "m-bonds", h("p", "", h("span", "", "찰떡"), data.fit), h("p", "", h("span", "", "조심"), data.clash))),
        h("div", "m-side", rich("h2", "up", data.story.headline), text, h("p", "m-snap", "왼쪽 카드를 휴대폰으로 찍어 가세요!"), button("m-cta", again, "↻  처음부터"))));
      bar(face, "나의 관상 결산", "플레이리스트 끝");
      controls({ play: again, prev: () => ctx.jump(data.topics.length - 1) });
      summary.then((s) => { if (ctx.alive()) text.replaceChildren(...s.paragraphs.map((p, i) => { const n = h("p", "up", p); n.style.animationDelay = `${i * 0.5}s`; return n; }), s.ai ? h("small", "", "AI가 풀이 항목을 엮어 쓴 글입니다.") : h("span")); });
    },
  };
}
