import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALIBRATION } from "../dist/calibration.js";
import { sayingsOf, POLE_IDS } from "../dist/story.js";
import { TOPICS, answer, readingFor, soften, josa, FRAMES } from "../dist/talk/spoken.js";

const content = JSON.parse(readFileSync(new URL("../dist/parts.json", import.meta.url)));

test("every sentence about a kind of person is turned into speech", () => {
  for (const poles of [[], ...POLE_IDS.map((p) => [p])]) {
    const s = sayingsOf(poles);
    for (const text of [s.work, s.love, s.stage, s.fit.why, s.clash.why]) assert.doesNotMatch(soften(text), /니다/, soften(text));
  }
});

test("particles follow the last syllable", () => {
  assert.equal(josa("코", "을", "를"), "코를");
  assert.equal(josa("⟦꽤 큰 입⟧", "을", "를"), "⟦꽤 큰 입⟧을");
});

test("answers for many faces are complete spoken sentences", () => {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 400; i += 1) {
    const values = Object.fromEntries(Object.entries(CALIBRATION).map(([k, c]) => [k, c.center + (random() - 0.5) * (i % 2 ? 6 : 1) * c.scale]));
    const reading = readingFor(values, 20, content);
    for (const t of TOPICS) {
      const { lines } = answer(reading, t.id, "새벽빛 고래", random);
      assert.ok(lines.length >= 2, t.id);
      for (const line of lines) {
        assert.doesNotMatch(line, /undefined|니다|⟦⟧/, line);
        assert.match(line, /요\.$/, line);
      }
    }
  }
});

test("only the wording changes: the kept words are the same whichever wording is drawn", () => {
  for (let i = 0; i < 200; i += 1) {
    let seed = i + 1;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const values = Object.fromEntries(Object.entries(CALIBRATION).map(([k, c]) => [k, c.center + (random() - 0.5) * 6 * c.scale]));
    for (const t of TOPICS) {
      const marks = (pick) => { const { lines, memo } = answer(readingFor(values, 20, content), t.id, "가", pick); return JSON.stringify([memo, lines.join(" ").match(/⟦[^⟧]+⟧/g), lines.length]); };
      const first = marks(() => 0);
      assert.equal(marks(() => 0.999999), first);
      assert.equal(marks(random), first);
    }
  }
});

test("one visitor hears each wording once before any comes again", () => {
  const reading = readingFor(Object.fromEntries(Object.entries(CALIBRATION).map(([k, c]) => [k, c.center + c.scale * 2])), 20, content);
  const said = [0, 1, 2, 3].map(() => answer(reading, "work", "가").lines[0]);
  assert.equal(new Set(said).size, FRAMES.work.length);
  assert.ok(FRAMES.watch.every((f) => /^(그래서|그러니)/.test(f("x"))));
});
