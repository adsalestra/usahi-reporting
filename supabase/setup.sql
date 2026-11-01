-- Run this once in Supabase > SQL Editor. App server uses service-role key.
-- RLS denies public/direct browser access; the API checks Supabase Auth on every request.
create extension if not exists pgcrypto;
create table if not exists public.reports (
 id uuid primary key default gen_random_uuid(),
 title text not null, report_date date not null, category text not null default 'SEO',
 summary text not null default '', body_html text not null default '',
 status text not null default 'draft' check (status in ('draft','published')),
 created_by text not null, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), published_at timestamptz
);
create table if not exists public.review_items (
 id uuid primary key default gen_random_uuid(),
 title text not null, target_url text not null, description text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','changes_requested')),
 created_by text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.review_events (
 id uuid primary key default gen_random_uuid(), review_id uuid not null references public.review_items(id) on delete cascade,
 action text not null check(action in ('comment','approved','changes_requested','resubmitted')),
 message text not null default '', actor text not null, created_at timestamptz not null default now()
);
create index if not exists idx_reports_status_date on public.reports(status,report_date desc);
create index if not exists idx_review_events_id on public.review_events(review_id,created_at);
alter table public.reports enable row level security;
alter table public.review_items enable row level security;
alter table public.review_events enable row level security;
-- No anon/authenticated RLS policies. Only server service-role calls can read/write.
