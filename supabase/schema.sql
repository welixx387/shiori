-- ═══════════════════════════════════════════════════════════════════════
--  Shiori — схема базы данных для облачного режима (Supabase)
--
--  Как применить:
--    1. supabase.com → ваш проект → SQL Editor → New query
--    2. Вставьте этот файл целиком и нажмите Run
--  Скрипт можно безопасно запускать повторно (например, после обновлений).
--
--  Что внутри:
--    • профили читателей; первый зарегистрированный — администратор;
--    • тайтлы и главы: читать могут все, менять — только администраторы;
--    • личные данные (полки, прогресс, история, оценки, закладки) —
--      видит и меняет только их владелец (Row Level Security);
--    • счётчики глав, оценок и добавлений в библиотеку считаются триггерами;
--    • хранилища для обложек и аватаров.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────────────────────── Профили ─────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  aura text not null default 'ember',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles for select using (true);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Новый пользователь → профиль. Первый аккаунт в проекте получает роль администратора.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  base := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
  base := left(regexp_replace(coalesce(base, ''), '[^[:alnum:]_.-]', '', 'g'), 24);
  if char_length(base) < 3 then
    base := 'reader' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    n := n + 1;
    candidate := left(base, 20) || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    candidate,
    candidate,
    case when exists (select 1 from public.profiles where role = 'admin') then 'user' else 'admin' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Роль через API может поменять только администратор (из SQL Editor — кто угодно).
create or replace function public.protect_profile()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

-- ───────────────────────────── Тайтлы ─────────────────────────────

create table if not exists public.novels (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  alt_titles text[] not null default '{}',
  author text not null default '',
  illustrator text not null default '',
  description text not null default '',
  cover_url text,
  cover_style jsonb not null default '{"palette": 0, "pattern": "seigaiha", "kanji": "夜"}',
  genres text[] not null default '{}',
  tags text[] not null default '{}',
  status text not null default 'ongoing' check (status in ('ongoing', 'completed', 'hiatus', 'announced')),
  country text not null default 'Япония',
  year int,
  age_rating text not null default '16+',
  featured boolean not null default false,
  published boolean not null default false,
  views bigint not null default 0,
  rating_sum int not null default 0,
  rating_count int not null default 0,
  chapters_count int not null default 0,
  library_count int not null default 0,
  last_chapter_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint novels_slug_key unique (slug)
);

create index if not exists novels_published_idx on public.novels (published, created_at desc);

alter table public.novels enable row level security;

drop policy if exists "Published novels are public" on public.novels;
create policy "Published novels are public" on public.novels
  for select using (published or (select public.is_admin()));

drop policy if exists "Admins insert novels" on public.novels;
create policy "Admins insert novels" on public.novels
  for insert with check ((select public.is_admin()));

drop policy if exists "Admins update novels" on public.novels;
create policy "Admins update novels" on public.novels
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admins delete novels" on public.novels;
create policy "Admins delete novels" on public.novels
  for delete using ((select public.is_admin()));

-- «Обновлён» меняется только при правке содержимого, а не при росте счётчиков.
create or replace function public.novels_before_update()
returns trigger
language plpgsql
as $$
begin
  if (new.title, new.slug, new.alt_titles, new.author, new.illustrator, new.description, new.cover_url,
      new.cover_style, new.genres, new.tags, new.status, new.country, new.year, new.age_rating,
      new.featured, new.published)
     is distinct from
     (old.title, old.slug, old.alt_titles, old.author, old.illustrator, old.description, old.cover_url,
      old.cover_style, old.genres, old.tags, old.status, old.country, old.year, old.age_rating,
      old.featured, old.published) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists novels_touch on public.novels;
create trigger novels_touch
  before update on public.novels
  for each row execute function public.novels_before_update();

-- ───────────────────────────── Главы ─────────────────────────────

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references public.novels (id) on delete cascade,
  volume int not null default 1,
  number numeric(8, 2) not null default 1,
  title text not null default '',
  content text not null default '',
  word_count int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chapters_novel_idx on public.chapters (novel_id, volume, number);
create index if not exists chapters_fresh_idx on public.chapters (created_at desc) where published;

alter table public.chapters enable row level security;

drop policy if exists "Published chapters are public" on public.chapters;
create policy "Published chapters are public" on public.chapters
  for select using (
    (select public.is_admin())
    or (published and exists (select 1 from public.novels n where n.id = novel_id and n.published))
  );

drop policy if exists "Admins insert chapters" on public.chapters;
create policy "Admins insert chapters" on public.chapters
  for insert with check ((select public.is_admin()));

drop policy if exists "Admins update chapters" on public.chapters;
create policy "Admins update chapters" on public.chapters
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admins delete chapters" on public.chapters;
create policy "Admins delete chapters" on public.chapters
  for delete using ((select public.is_admin()));

create or replace function public.chapters_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    select count(*) into new.word_count
    from regexp_matches(new.content, '[[:alnum:]]+([-''’][[:alnum:]]+)*', 'g');
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    -- Глава, впервые опубликованная из черновика, поднимается в «Свежих главах».
    if new.published and not old.published then
      new.created_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_before on public.chapters;
create trigger chapters_before
  before insert or update on public.chapters
  for each row execute function public.chapters_before_write();

create or replace function public.refresh_novel_chapters(p_novel uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.novels n
  set chapters_count = (select count(*) from public.chapters c where c.novel_id = p_novel and c.published),
      last_chapter_at = (select max(c.created_at) from public.chapters c where c.novel_id = p_novel and c.published)
  where n.id = p_novel;
$$;

create or replace function public.chapters_after_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_novel_chapters(new.novel_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.novel_id <> new.novel_id) then
    perform public.refresh_novel_chapters(old.novel_id);
  end if;
  return null;
end;
$$;

drop trigger if exists chapters_after on public.chapters;
create trigger chapters_after
  after insert or update or delete on public.chapters
  for each row execute function public.chapters_after_write();

-- ───────────────────────── Личные данные читателя ─────────────────────────

create table if not exists public.library (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  novel_id uuid not null references public.novels (id) on delete cascade,
  shelf text check (shelf in ('reading', 'planned', 'completed', 'onhold', 'dropped')),
  favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, novel_id)
);

create table if not exists public.progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  novel_id uuid not null references public.novels (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  position real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, novel_id)
);

create table if not exists public.chapter_reads (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  novel_id uuid not null references public.novels (id) on delete cascade,
  words int not null default 0,
  read_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create table if not exists public.ratings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  novel_id uuid not null references public.novels (id) on delete cascade,
  score smallint not null check (score between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, novel_id)
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  novel_id uuid not null references public.novels (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  paragraph int not null default 0,
  excerpt text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists bookmarks_user_idx on public.bookmarks (user_id, created_at desc);
create index if not exists reads_user_idx on public.chapter_reads (user_id, read_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['library', 'progress', 'chapter_reads', 'ratings', 'bookmarks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner only" on public.%I', t);
    execute format(
      'create policy "Owner only" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end;
$$;

-- Счётчик «в библиотеках»
create or replace function public.library_counter()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.novels set library_count = library_count + 1 where id = new.novel_id;
  elsif tg_op = 'DELETE' then
    update public.novels set library_count = greatest(0, library_count - 1) where id = old.novel_id;
  end if;
  return null;
end;
$$;

drop trigger if exists library_count on public.library;
create trigger library_count
  after insert or delete on public.library
  for each row execute function public.library_counter();

-- Сумма и число оценок
create or replace function public.ratings_counter()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.novels set rating_sum = rating_sum + new.score, rating_count = rating_count + 1 where id = new.novel_id;
  elsif tg_op = 'UPDATE' then
    update public.novels set rating_sum = rating_sum + new.score - old.score where id = new.novel_id;
  elsif tg_op = 'DELETE' then
    update public.novels
    set rating_sum = rating_sum - old.score, rating_count = greatest(0, rating_count - 1)
    where id = old.novel_id;
  end if;
  return null;
end;
$$;

drop trigger if exists ratings_count on public.ratings;
create trigger ratings_count
  after insert or update or delete on public.ratings
  for each row execute function public.ratings_counter();

-- ───────────────────────────── Функции API ─────────────────────────────

create or replace function public.increment_views(novel uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.novels set views = views + 1 where id = novel and published;
$$;

grant execute on function public.increment_views(uuid) to anon, authenticated;

create or replace function public.set_user_role(target uuid, new_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'Неизвестная роль: %', new_role;
  end if;
  if new_role = 'user'
     and exists (select 1 from public.profiles where id = target and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Нельзя снять права с последнего администратора';
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;

grant execute on function public.set_user_role(uuid, text) to authenticated;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  username text,
  display_name text,
  email text,
  avatar_url text,
  aura text,
  role text,
  created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  return query
    select p.id, p.username, p.display_name, u.email::text, p.avatar_url, p.aura, p.role, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужно войти в аккаунт';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1
     and (select count(*) from public.profiles) > 1 then
    raise exception 'Сначала назначьте другого администратора';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

-- ───────────────────────────── Картинки ─────────────────────────────

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Shiori images are public" on storage.objects;
create policy "Shiori images are public" on storage.objects
  for select using (bucket_id in ('covers', 'avatars'));

drop policy if exists "Admins upload covers" on storage.objects;
create policy "Admins upload covers" on storage.objects
  for insert to authenticated with check (bucket_id = 'covers' and public.is_admin());

drop policy if exists "Admins update covers" on storage.objects;
create policy "Admins update covers" on storage.objects
  for update to authenticated using (bucket_id = 'covers' and public.is_admin());

drop policy if exists "Admins delete covers" on storage.objects;
create policy "Admins delete covers" on storage.objects
  for delete to authenticated using (bucket_id = 'covers' and public.is_admin());

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────────── Полезное ─────────────────────────────
-- Выдать права администратора вручную (подставьте email):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
