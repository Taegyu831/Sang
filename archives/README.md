# 원본 이력 보관

`face-measure-original-history.bundle`에는 원래 Sites 소스의 11개 커밋과 Git 객체가 들어 있습니다.

- 원본 마지막 커밋: `4223ddb770a662dad2a01664d8f1e0a5393035ac`
- bundle SHA-256: `5f7bcf2a4af8422d642785180451dc75e10f8a7d9cabef543b1be2c2160e7801`

원본과 동일한 Git 객체와 커밋 SHA가 필요한 경우 bundle을 다운로드한 뒤 별도 폴더로 복구합니다.

```sh
git clone face-measure-original-history.bundle Sang-original-history
```

GitHub로 가져온 11개 버전의 각 파일 트리는 원본과 같은 Git tree SHA로 검증했습니다. 가져오기 커밋의 SHA와 시각은 원본과 다르며, 대응 관계는 `source-history.json`에 기록했습니다.
