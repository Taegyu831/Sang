// Look 2: an AI chat. It asks, thinks aloud and types the answers; the photo sits in a panel on the right.
import { h, button, rich, plain, photoCard, focusPart, countUp, firstSentence, replay, type } from "./engine.js";

const IDEAS = [["돈복", "내 얼굴에 돈복이 있어?"], ["연애", "나랑 잘 맞는 사람은?"], ["성격", "첫인상 말고 진짜 내 성격"], ["전성기", "내 전성기는 언제야?"]];

export function chat(stage) {
  const history = h("div", "c-history");
  const thread = h("div", "c-thread");
  const input = h("span", "c-typed");
  const send = h("b", "c-send", "↑");
  const composer = h("div", "c-composer", input, send);
  const panel = h("aside", "c-panel");
  const main = h("main", "c-main", thread, composer, h("p", "c-foot", "관상챗은 재미로 보는 풀이를 알려 드려요. 얼굴 사진은 저장되지 않아요."));
  stage.replaceChildren(h("div", "c-app", h("nav", "c-nav", h("div", "c-logo", h("b", "", "상"), "관상챗"), history, h("p", "c-keys", "SPACE 멈춤 · ← → 이동 · ESC 처음")), main, panel));
  const toBottom = () => requestAnimationFrame(() => thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" }));
  const bot = (...content) => { const body = h("div", "c-body", ...content); thread.append(h("div", "c-msg is-bot up", h("b", "c-avatar", "상"), body)); toBottom(); return body; };
  const me = (...content) => { thread.append(h("div", "c-msg is-me up", h("div", "c-bubble", ...content))); toBottom(); };
  const wide = (on) => stage.querySelector(".c-app").classList.toggle("is-wide", on);
  const showPanel = (title, ...content) => { wide(false); panel.replaceChildren(h("div", "c-panel-head", title), ...content); };
  const nav = (items) => history.replaceChildren(h("p", "", "오늘"), ...items);

  return {
    picked(label) { me(label); },
    attract(ctx, start) {
      thread.replaceChildren(); panel.replaceChildren(); wide(true);
      const typed = input; typed.textContent = "";
      thread.append(h("div", "c-welcome", h("div", "toon", h("i"), h("i"), h("i")), h("h1", "", "무엇이 궁금하세요?"),
        h("div", "c-ideas", ...IDEAS.map(([k, q], i) => { const b = button("c-idea up", start, h("b", "", k), h("span", "", q)); b.style.animationDelay = `${i * 0.1}s`; return b; }))));
      nav(IDEAS.map(([, q]) => h("div", "c-item", q)));
      composer.onclick = start;
      (async () => { let i = 0; while (ctx.alive()) { send.classList.remove("is-ready"); if (!(await type(typed, IDEAS[i % IDEAS.length][1], ctx, 70))) return; send.classList.add("is-ready"); typed.textContent += "  (눌러서 시작)"; if (!(await ctx.wait(2200))) return; i += 1; } })();
    },
    pick(ctx, question, labels, choose) {
      wide(true);
      if (!thread.querySelector(".c-msg")) { thread.replaceChildren(); me("내 얼굴 관상 봐 줘"); }
      input.textContent = "숫자 키를 누르거나 골라 주세요"; composer.onclick = null; send.classList.remove("is-ready");
      nav([h("div", "c-item is-now", "내 관상 보기")]);
      bot(h("p", "", question), h("div", "c-options", ...labels.map((l, i) => { const b = button("c-option in", () => choose(i), h("kbd", "", String(i + 1)), l); b.style.animationDelay = `${0.2 + i * 0.08}s`; return b; })));
    },
    camera(ctx) {
      const cam = h("video", ""); cam.muted = true; cam.playsInline = true;
      const count = h("div", "count");
      const box = h("div", "camera c-camera", cam, h("div", "ring"), count);
      showPanel("카메라", box, button("c-ghost", ctx.sample, "카메라 없이 예시로 보기 (S)"));
      const body = bot(h("p", "", "좋아요! 이제 오른쪽 화면을 보고 정면을 봐 주세요. 자동으로 찍어 드릴게요."), h("p", "c-live", "카메라를 켜는 중"));
      const live = body.querySelector(".c-live");
      return { video: cam, say: (t) => { live.textContent = t; }, found: (f) => box.classList.toggle("is-found", f), count: (n) => { count.textContent = n ?? ""; replay(count); }, flash: () => box.append(h("div", "flash")) };
    },
    analysis(ctx, face, data) {
      const photo = photoCard(face, "scanning c-photo");
      const number = h("div", "c-reading");
      showPanel("분석 화면", photo.box, number);
      if (!thread.querySelector(".c-msg")) me("내 얼굴 관상 봐 줘");
      me(h("img", "c-attach"), "사진 보냈어");
      thread.querySelector(".c-msg:last-child img").src = face.src;
      const log = h("div", "c-log");
      const head = h("p", "c-thinking", "생각하는 중");
      bot(head, log);
      let current = null;
      const add = (text) => { current?.classList.add("is-done"); current = h("div", "c-step up", h("i"), h("span", "", text)); log.append(current); toBottom(); };
      nav([h("div", "c-item is-now", "내 관상 보기")]);
      return {
        photo,
        step(n, total, text) { add(text); },
        dots(count) { number.replaceChildren(h("b", "", String(count)), h("span", "", "개의 점을 읽는 중")); },
        part(part) { const b = h("b", "", "0"); number.replaceChildren(b, h("div", "", h("strong", "", part.name), h("span", "", firstSentence(part.mine)))); replay(number); countUp(b, part, ctx); current.querySelector("span").textContent = `${part.part} 확인: ${part.name}`; },
        collect(words) { head.textContent = "분석 완료"; head.classList.add("is-done"); number.replaceChildren(h("div", "c-words", ...words.map((w, i) => { const s = h("span", "in", w); s.style.animationDelay = `${i * 0.2}s`; return s; }))); },
      };
    },
    topic(ctx, data, index, face) {
      const t = data.topics[index];
      if (!thread.querySelector(".c-msg")) me("내 얼굴 관상 봐 줘");
      const photo = photoCard(face, "c-photo");
      const words = h("div", "c-words");
      showPanel(t.title, photo.box, words);
      focusPart(photo, face, data.shown[index % data.shown.length], 1.18);
      me(t.ask);
      const text = h("div", "c-answer");
      const chips = h("div", "c-chips");
      bot(text, chips);
      input.textContent = data.topics[index + 1] ? `다음 질문: ${data.topics[index + 1].ask}` : "마지막으로 정리해 줘"; send.classList.add("is-ready");
      composer.onclick = () => ctx.jump(index + 1);
      nav(data.topics.map((x, i) => button(`c-item ${i === index ? "is-now" : i < index ? "is-done" : ""}`, () => ctx.jump(i), x.ask)));
      return {
        units: t.lines.map((text) => ({ text })),
        show(i) {
          const p = rich("p", "up", t.lines[i]); text.append(p);
          const word = t.words[i]; if (word) words.append(h("span", "in", word));
          if (i === t.lines.length - 1) { t.words.slice(t.lines.length).forEach((w) => words.append(h("span", "in", w))); chips.replaceChildren(...data.topics.map((x, j) => (j > index ? button("c-chip in", () => ctx.jump(j), x.ask) : null)).filter(Boolean)); }
          toBottom();
        },
        progress(f) { composer.style.setProperty("--p", `${f * 100}%`); },
      };
    },
    final(ctx, data, face, summary, again) {
      const photo = photoCard(face, "c-photo");
      showPanel("나의 관상 카드", h("div", "c-card in", photo.box, rich("h3", "", data.story.headline), h("div", "c-words", ...data.words.slice(0, 5).map((w) => h("span", "", w))), h("p", "", `찰떡 ${data.fit}`), h("p", "", `조심 ${data.clash}`)), h("p", "c-snap", "휴대폰으로 찍어 가세요!"));
      me("마지막으로 정리해 줘");
      const text = h("div", "c-answer", h("p", "c-thinking", "정리하는 중"));
      const chips = h("div", "c-chips");
      bot(text, chips);
      input.textContent = "처음으로 돌아가기"; send.classList.add("is-ready"); composer.onclick = again; composer.style.setProperty("--p", "0%");
      summary.then(async (s) => {
        if (!ctx.alive()) return;
        text.replaceChildren();
        for (const p of s.paragraphs) { const node = h("p", ""); text.append(node); toBottom(); if (!(await type(node, plain(p), ctx, 12))) return; }
        if (s.ai) text.append(h("small", "", "AI가 풀이 항목을 엮어 쓴 글입니다."));
        chips.replaceChildren(button("c-chip in", again, "처음으로")); toBottom();
      });
    },
  };
}
