-- SwingCare swing_sessions (5.4절 — 랜드마크 좌표만, 영상 미포함)
-- 프로젝트에 기존 연운/파나나 스키마가 없어 신규 설계. 컨벤션이 있으면 맞춰 수정.

create table if not exists public.swing_sessions (
  id uuid primary key,
  created_at timestamptz not null default now(),
  duration_ms integer not null,
  platform text not null check (platform in ('ios', 'android')),
  fps double precision not null,
  frames jsonb not null default '[]'::jsonb,
  phases jsonb not null default '[]'::jsonb
);

create index if not exists swing_sessions_created_at_idx
  on public.swing_sessions (created_at desc);

-- MVP: anon upsert/select (프로덕션에서는 auth.uid() RLS로 교체)
alter table public.swing_sessions enable row level security;

drop policy if exists "swing_sessions_anon_all" on public.swing_sessions;
create policy "swing_sessions_anon_all"
  on public.swing_sessions
  for all
  to anon
  using (true)
  with check (true);
