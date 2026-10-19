# 공식 수집 정원 종료 · 2026-10-19

공식 수집 정원 화면·플레이 코드·스타일·계정 메뉴 링크를 제거했습니다. 기존 `official.html` 주소는 일반 정원으로 이동합니다.

일반 정원의 15종 펫·진행상황·Google 로그인·자동 저장은 유지합니다. 공식 서버 기록과 SQL 마이그레이션 이력은 데이터 손실을 피하기 위해 보존하며, 현재 게임 화면에서는 사용하지 않습니다. 이전 구현과 테스트 기록은 Git 이력에서 확인할 수 있습니다.

`tests/official-server.test.cjs`, `tests/official-public.test.cjs`는 보존된 서버의 권한 검사입니다. `tests/pet-expansion-server.test.cjs`는 일반 저장의 신규 펫 보호도 검사하므로 유지합니다. `tests/official-redirect.test.cjs`는 예전 주소 이동과 일반 정원 저장 보존을 검사합니다.
