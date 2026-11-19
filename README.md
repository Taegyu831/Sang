# 상(相) 역학원 · 관상측정

카메라로 얼굴의 비율을 재고, 대중 관상 해설로 부위마다 풀어 주는 졸업 전시용 웹 프로토타입입니다.

**바로 열기: https://taegyu831.github.io/Sang/**

## 관람객이 보는 흐름

1. **시작**: 버튼을 누르면 카메라가 켜집니다.
2. **측정**: 고개를 조금 움직여도 됩니다. 자세를 보정하며 여러 프레임을 모으고, 다 재면 자동으로 넘어갑니다.
3. **풀이**: 한 번에 아래로 내려 읽습니다.
   - 맨 위: 얼굴 사진, 부위별 한눈에 보기, 종합 풀이
   - 얼굴형: 계란형, 둥근형, 각진형, 긴형, 역삼각형 중 하나
   - 기본 부위 5장: 눈, 코, 입, 이마, 턱. 한 장에 한 문단으로 정리 (접거나 열 것 없음)

## 주소 옵션

| 주소 | 용도 |
| --- | --- |
| `?debug=1` | 팀용 측정 패널. 모든 비율, 각도별 기록, CSV 저장 |
| `?preview=1` | 카메라 없이 평균 얼굴로 결과 화면 보기 (로컬 `127.0.0.1`에서만) |
| `?preview=1&v=noseWidth:26,jawCheek:84` | 특정 값을 넣어 결과 화면 보기 (로컬에서만) |

## 프로젝트 구성

- `dist/`: 실제 앱. 이 폴더가 그대로 공개 주소에 올라갑니다.
  - `index.html`, `styles.css`, `app-v3.js`: 화면과 흐름
  - `pose.js`: 고개 각도 추정과 정면 환산 (자세 보정)
  - `features.js`: 정면 좌표에서 계산하는 비율 (눈썹, 눈, 코, 입, 턱 등)
  - `capture.js`: 쓸 수 있는 프레임만 모으는 연속 측정
  - `calibration.js`: 비율마다 보통 얼굴의 기준값 (아직 표준 얼굴 기준의 임시값)
  - `parts.js`, `parts.json`: 부위 카드 규칙, 대중 관상 풀이, 정리 문장, 종합 문구
  - `debug.js`: `?debug=1` 측정 패널
  - `fonts/`: IBM Plex Sans KR, IBM Plex Mono, 도장 글자 일부 (모두 SIL Open Font License)
- `tools/`
  - `merge_readings.py`: 조사한 풀이를 `parts.json`에 넣는 스크립트 (조사 원본과 출처는 저장소 밖에 보관)
  - `summaries.json`: 부위별 정리 문장 원본
- `tests/`: 자세 보정, 규칙, 전체 흐름 검증 페이지와 화면 캡처 도우미
- `docs/`, `archives/`: 배포 안내와 이전 버전 기록

## 로컬에서 실행

```sh
python3 -m http.server 8000 --directory dist --bind 127.0.0.1
```

브라우저에서 http://127.0.0.1:8000 을 엽니다. 테스트는 저장소 최상위에서 서버를 띄운 뒤 `tests/*.test.html`을 엽니다.

## 배포

`main`에 올리면 GitHub Actions가 `dist`를 GitHub Pages에 배포합니다. 1~2분 뒤 공개 주소에 반영됩니다. 진행 상황은 저장소의 Actions 탭에서 볼 수 있습니다.

## 디자인 협업

[Figma 작업 파일](https://www.figma.com/design/zzQuyeeS0rzyvR8pGNAG61?node-id=8-6601)

이 결과는 관상에서 이렇게들 풀이해 왔다는 이야기를 얼굴의 상대 비율에 연결한 것이며, 성격, 능력, 미래에 대한 과학적 진단이 아닙니다.

## Measurement extras (2026-11-17)

- The relaxed capture counts the right, front and left head turns equally (`StableCapture.estimate`).
- After it, two short posed shots follow: jaw clenched, then a small smile (`dist/capture.js`, `PoseCompare`). Their difference from the relaxed face gives `jawFlex` and `smileLift`, told in `dist/extras.js`. The thresholds there are guesses until visitors are recorded with `?debug=1`.
- The iris is used as a ruler (`faceWidthMm` and the other `*Mm` values in `dist/features.js`).
- One frame of the clench shot goes through MediaPipe's hair segmenter (`dist/hair.js`); the top third then starts at the hairline (`upperThirdHair`, centre 33 is a guess). If the model does not load, or a fringe covers the forehead, the mesh based top third stays.

## Portraits of the imagined 인연 (2026-11-19)

- The first screen asks the visitor's gender. The imagined 인연 is the opposite (fixed for now, `partnerOf` in `dist/portrait.js`).
- Only the two bonds in the reading are drawn: 잘 맞는 인연 and 조심할 인연, one picture each.
- `portraitPrompt({ pole, kind, gender })` builds the prompt from the kind of person (`MOOD` per pole), the face features (`featureWords`, same parameters as `avatar.js`) and the role (`ROLE`: fit is warm, clash is cooler). `LOOK` and `AGE` at the top of `portrait.js` change every picture.
- The browser never holds the API key. It posts `{prompt}` to a relay, which adds the key:
  - local: `export OPENAI_API_KEY=sk-...` then `python3 tools/portrait-proxy.py`, open the app (served from 127.0.0.1:8001) with `?portrait=http://127.0.0.1:8787`
  - public: `tools/portrait-worker.js` as a Cloudflare Worker with secret `OPENAI_API_KEY`, then `?portrait=https://<worker>.workers.dev`
  - Since 2026-11-19 the default is the Vercel function (`DEFAULT_ENDPOINT` in `portrait.js`), so a plain link makes photos. `?portrait=off` turns photos off (remembered), `?portrait=default` goes back to the default.
- Model (tries gpt-image-2, then 1.5, then 1), size and quality are fixed on the relay side (`IMAGE_MODEL`, comma list, `IMAGE_SIZE`, `IMAGE_QUALITY`), so the page cannot ask for more.

### Vercel function for the portraits (2026-11-19)

- `api/portrait.mjs` + `vercel.json`: the page posts `{spec: {pole, kind, gender, age}}` and the function builds the prompt itself from `dist/portrait.js` (so the address cannot be used to draw anything else). It checks the origin, allows 40 requests per 10 minutes per address, tries gpt-image-2, then 1.5, then 1, and returns `{image}`.
- The site stays on GitHub Pages. The Vercel project is made from this repository and only serves `/api/portrait`. `OPENAI_API_KEY` goes in the Vercel project settings, never in the repo.
- `dist/package.json` (`{"type": "module"}`) lets the function import the browser modules.
- The function logic is tested with a fake OpenAI (`/tmp/fn.test.mjs` during development); it has not been called on Vercel yet.

### Engine served from the site (2026-11-19)

- `dist/vendor/mediapipe/` holds MediaPipe tasks-vision 1.1.1 (`vision_bundle.mjs`, `wasm/vision_wasm_internal.{js,wasm}`) and `face_landmarker.task` (about 17.8 MB in total). `app-v3.js` loads them from the site, so measuring no longer needs a public CDN. The files are unchanged copies and should not be changed often: every change adds the full size to the git history.
- Only the SIMD wasm build is included. Browsers without WebAssembly SIMD (before Chrome 91, Safari 16.4) would need `vision_wasm_nosimd_internal.*` as well.
- The hair model (`?hair=1`, off by default) is still fetched from Google's storage.
- `.vercelignore` keeps `dist/vendor` out of the Vercel upload.

### Spare portraits (2026-11-19)

- `dist/fallback/` holds 32 portraits made ahead of time (20s only: 16 per gender, `<fit|clash>-<pole or even>-<female|male>.jpg`, 640 px, about 70 KB each). `tools/make-fallback.py` makes the missing ones through the Vercel function.
- If the live picture takes longer than 30 s or fails (offline, rate limit, API error), the page shows the matching spare portrait, whatever age the visitor chose. If no file matches, the line drawing stays.
