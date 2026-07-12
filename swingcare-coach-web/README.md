# SwingCare Coach Web

코치 전용 Next.js 앱. Express API를 거치지 않고 Supabase 클라이언트로 직접 인증·조회합니다.

## 실행

```bash
cp .env.example .env.local
# NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 설정
npm install
npm run dev
```

기본: http://localhost:3000 → `/coach/login`

## Vercel 배포 (중요)

모노레포이므로 **Root Directory** 를 반드시 지정해야 합니다.
미설정 시 Expo 루트가 배포되어 `404: NOT_FOUND` 가 납니다.

1. Vercel 프로젝트 → **Settings → General → Root Directory**
2. **Edit** → `swingcare-coach-web` 입력 → Save
3. Framework Preset: **Next.js** (자동 감지)
4. Install / Build / Output: 기본값 유지 (Override 끄기)
5. **Settings → Environment Variables**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. **Deployments → Redeploy** (또는 main에 푸시)

## 코치 계정

- 아이디: `swingmaster` (도메인 자동 부착)
- Auth 이메일: `swingmaster@swingcare.app`
- `users.role = coach` + `coaches.auth_user_id` 연결 필요

## 라우트

| 경로 | 설명 |
|------|------|
| `/coach/login` | 로그인 |
| `/coach/requests` | 인박스 |
| `/coach/requests/[id]` | 클립 + 회신 |
