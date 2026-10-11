# 계정 서버 연결

현재 코드에는 Google 로그인과 Supabase 계정 저장이 구현되어 있습니다. GitHub Pages 주소는 유지합니다.

2026-10-11: `wakppu-pet-world` 프로젝트 연결 설정과 저장 스키마 적용 완료. 실제 DB 권한·저장 충돌 검사를 통과했습니다. Site URL과 Redirect URL도 실제 게임 주소로 설정했습니다. Google OAuth 클라이언트 생성과 제공자 활성화 완료. 배포된 게임에서 실제 Google 로그인, 첫 펫 서버 저장, 새로고침 후 서버 기록 복원을 확인했습니다. 실제 서로 다른 브라우저 간 로그인은 아직 별도 검증이 필요합니다.

현재 프로젝트 콜백 URL: `https://ojjcqjgqddaunhnhbflj.supabase.co/auth/v1/callback`

Google OAuth의 승인된 JavaScript 원본은 `https://gamjadough.github.io`입니다(경로 없이 입력). 테스트 모드에서는 Audience → Test users에 실제 사용할 Google 계정을 추가합니다. Google 클라이언트 시크릿은 Supabase Google 제공자 설정에 직접 입력하고 게임 파일이나 채팅에 넣지 않습니다.

## 1. Supabase 프로젝트 생성

1. https://supabase.com/dashboard 에서 로그인하고 **New project**를 선택합니다.
2. 본인 조직과 프로젝트 이름을 지정하고 데이터베이스 비밀번호를 설정합니다. 비밀번호는 본인이 보관하며 게임 코드에 넣지 않습니다.
3. 프로젝트가 준비되면 **SQL Editor**에서 이 저장소의 `supabase/schema.sql` 전체를 실행합니다.

SQL은 사용자별 저장 테이블, 본인 기록만 읽는 권한, 저장 버전을 검사하는 함수를 만듭니다. 사용자 계정 삭제 시 저장도 삭제됩니다. 다른 사용자 기록과 관리자 권한은 브라우저에 공개되지 않습니다.

## 2. Google 로그인 설정

1. Google Cloud Console에서 OAuth 동의 화면과 **웹 애플리케이션용 OAuth 클라이언트**를 생성합니다. 테스트 모드라면 테스트 사용자도 등록합니다.
2. Google OAuth의 승인된 리디렉션 URI에 Supabase Google 제공자 화면에서 안내하는 콜백 URL을 입력합니다: `https://프로젝트ID.supabase.co/auth/v1/callback`.
3. Supabase **Authentication → Sign In / Providers → Google**에서 Google 클라이언트 ID와 시크릿을 설정하고 활성화합니다. Google 시크릿은 Supabase 설정에만 넣습니다.
4. Supabase **Authentication → URL Configuration**에서 Site URL과 허용 Redirect URLs에 실제 게임 주소 `https://gamjadough.github.io/wakppu-pet-world/`를 등록합니다.
5. 로컬 HTTP 테스트를 할 경우 해당 주소도 별도로 허용합니다. 파일 더블클릭(`file://`)은 게스트 플레이만 지원합니다.

공식 안내: https://supabase.com/docs/guides/auth/social-login/auth-google

## 3. 공개 연결 설정

프로젝트의 Connect 또는 API 설정에서 Project URL과 **publishable key**(기존 프로젝트는 anon key)를 확인합니다. `server-config.js`에 넣습니다.

```js
window.WAKPPU_SERVER = {
  url: "https://프로젝트ID.supabase.co",
  publishableKey: "공개 키"
};
```

이 값은 브라우저에서 보이는 공개 설정입니다. secret, service_role 키, 데이터베이스 비밀번호는 사용하지 않습니다. 새 `account.js`, `server-config.js`도 게임 파일들과 함께 GitHub Pages에 배포합니다.

## 사용과 충돌 처리

- 로그인 전에는 기존 `wakppu-v01` 게스트 저장을 유지합니다.
- 최초 로그인에서 서버 저장이 없으면 게스트 기록 연결 여부를 묻습니다. 기존 계정 저장이 있으면 서버 기록으로 시작합니다.
- 계정 저장은 10초마다, 탭을 숨길 때, 수동 저장 버튼으로 전송합니다. 골드는 브라우저에서 계속 계산합니다. 이동하기 전 **서버에 지금 저장**을 누르고 완료 상태를 확인합니다.
- 계정 백업은 `wakppu-v01:account:사용자ID`에 보관합니다. 게스트 저장과 분리되며 로그아웃하면 게스트로 돌아갑니다.
- 두 기기가 같은 버전으로 플레이하면 먼저 성공한 저장을 유지합니다. 나중 저장은 충돌 안내와 함께 진행을 멈춥니다. 서버 기록을 다시 불러오면 미저장 진행은 대체됩니다. 자동 병합은 하지 않습니다.
- 인터넷 장애 때 현재 플레이는 브라우저 백업에 남고 서버 저장을 재시도합니다. 새로고침 또는 재로그인 때는 서버 기록을 기준으로 시작합니다. 브라우저 백업의 미전송 기록을 자동 복구하지 않습니다.
- 브라우저 종료 시 마지막 서버 요청의 성공은 보장되지 않으므로 종료 직전 요청에만 의존하지 않습니다.
- 오프라인 수익과 공식 랭킹은 포함하지 않습니다. 클라이언트 상태를 저장하는 방식이라 부정 기록을 판별할 수 없습니다. 공식 랭킹에는 서버에서 구매·부화·수익을 검증하는 별도 단계가 필요합니다.

## 실제 서버 검증

1. 브라우저 A에서 게스트 펫을 얻고 로그인하여 기록을 연결합니다.
2. 저장 완료 후 브라우저 B에서 동일 계정으로 로그인합니다. 펫·골드·볼·장착·도감·싸움 상태를 확인합니다.
3. 두 브라우저에서 플레이하고 저장 충돌이 덮어쓰기를 차단하는지 확인합니다.
4. 다른 계정으로 로그인하여 이전 계정의 기록이 표시되거나 연결되지 않는지 확인합니다.
5. 네트워크를 끊어 실패 상태와 재연결 저장을 확인합니다.
6. SQL 권한을 검증합니다: 비로그인 접근 차단, 다른 사용자 행 조회 차단, 직접 쓰기 차단, 본인 `save_game` 호출 허용.
