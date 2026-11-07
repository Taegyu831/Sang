# 상(相) — FACE / MEASURE

카메라에서 얼굴 기준점과 상대 비율을 측정하고, 연속으로 측정한 비율을 관찰·자원·표현·지속·구조 다섯 주제로 읽고, 삼정·오안·오악 전통 틀을 근거로 보여주는 전시용 웹 프로토타입입니다.

## 프로젝트 구성

- `dist/index.html`: 화면 구조
- `dist/styles.css`: 데스크톱·모바일 스타일
- `dist/app-v3.js`: 카메라, 연속 측정 진행, 결과 화면
- `dist/pose.js`: 고개 각도 추정과 정면 환산 (자세 보정)
- `dist/features.js`: 정면 좌표에서 계산하는 비율
- `dist/capture.js`: 쓸 수 있는 프레임만 모으는 연속 측정
- `dist/calibration.js`: 평균 얼굴 기준값
- `dist/reading.js`: 삼정·오안·오악 전통 틀 분류
- `dist/interpret.js`, `dist/content.json`: 다섯 주제 읽기 규칙과 문구
- `dist/frames.js`: 전통 틀 아홉 결과의 이름과 설명
- `dist/debug.js`: `?debug=1` 각도별 지표 기록 화면
- `tests/`: 자세 보정, 규칙, 전체 흐름 검증 페이지
- 이전 구현은 Git 변경 이력과 `archives/` 백업에 보관
- `archives/`: 원본 Git 이력을 복구할 수 있는 백업과 이전 기록
- `docs/`: 배포·개발·Figma 협업 안내, `READING_ENGINE.md`에 측정과 읽기 구조

## 실행

```sh
python3 -m http.server 8000 --directory dist --bind 127.0.0.1
```

브라우저에서 http://127.0.0.1:8000 을 엽니다. 파일을 직접 여는 `file://` 방식 대신 로컬 서버 또는 HTTPS 배포 주소를 사용합니다.

얼굴 인식 모듈과 모델은 현재 원본과 동일한 외부 주소에서 불러옵니다. 카메라 사용에는 브라우저 권한이 필요합니다.

## 디자인 협업

[Figma 작업 파일](https://www.figma.com/design/zzQuyeeS0rzyvR8pGNAG61?node-id=8-6601)

Figma에서 디자인을 수정한 뒤 코드에 반영하고, 실행 화면에서 확인합니다. Figma와 코드가 자동으로 동기화되지는 않습니다.

## 배포

현재 앱은 HTML·CSS·JavaScript만으로 이루어져 있으며 배포 대상 디렉터리는 `dist`입니다. GitHub Pages의 Actions 배포를 사용합니다. 배포 설정은 [배포 안내](docs/DEPLOYMENT.md)를 참고하세요.

## 원본과 이력

기존 Sites 배포 v11의 원본 소스를 가져왔습니다. 원래의 11개 버전을 순서대로 보관하고, 원본 커밋과 날짜를 기록했습니다. GitHub 가져오기 과정의 커밋 SHA는 원본과 다를 수 있습니다. 원본 Git 객체와 SHA를 복구할 수 있는 bundle도 `archives`에 함께 보관합니다.

이 결과는 얼굴의 상대 비율을 전시적 언어로 번역한 것이며, 성격·능력·미래에 대한 과학적 진단이 아닙니다.
