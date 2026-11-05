# 배포와 복구

## GitHub Pages

- 저장소: https://github.com/Taegyu831/Sang
- 기본 배포 주소: https://taegyu831.github.io/Sang/
- 배포할 파일: `dist`
- 저장소 Settings → Pages → Source: GitHub Actions
- 배포 실행 내역: https://github.com/Taegyu831/Sang/actions

`main`에 변경을 반영하면 배포 워크플로가 실행됩니다. 위 주소는 워크플로의 배포 단계가 성공한 뒤 사용할 수 있습니다.

워크플로는 JavaScript 문법을 검사하고, `dist`만 Pages에 배포합니다. `archives`와 개발 문서는 웹 앱 배포 파일에 포함하지 않습니다.

## 배포 후 확인

HTTPS 주소에서 화면과 스타일, 모델 준비 상태를 확인하고, 사용할 전시 기기에서 카메라 권한·정면/양측면 측정·귀 지정·결과·모바일 화면을 확인합니다. 측정 모델과 실행 모듈은 현재 원본과 같은 외부 CDN을 사용합니다.

## 되돌리기

문제가 있는 변경의 이전 코드로 되돌리는 커밋을 만들어 `main`에 반영하면 다시 배포됩니다. 공개 주소를 확인한 뒤 후속 작업을 진행합니다.

원래 Sites 프로젝트의 Git 이력은 `archives/face-measure-original-history.bundle`에 있습니다. 원본 커밋과 GitHub 가져오기 커밋의 대응은 `archives/source-history.json`에 기록했습니다.

## 다른 호스팅으로 이전

별도 빌드 없이 `dist`를 정적 사이트 배포 경로로 사용합니다. 호스팅 주소를 바꾸면 `dist/app-v3.js`의 `PUBLIC_SITE_URL`과 `dist/index.html`의 로컬 파일 안내 링크도 새 주소로 변경합니다.

원래 Sites 연결 정보는 `archives/original-hosting.json`에 기록했습니다.
