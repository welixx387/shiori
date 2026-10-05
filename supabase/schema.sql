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
--    • хранилища для обложек и аватаров;
--    • друзья, комментарии, титулы, карточки, кейсы, обмены и покупки кейсов.
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

-- Роль через API меняет только администратор (из SQL Editor — кто угодно),
-- титул можно надеть только из полученных.
create or replace function public.protect_profile()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not public.is_admin() then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.title_id is distinct from old.title_id and new.title_id is not null
       and not exists (select 1 from public.user_titles t where t.user_id = new.id and t.title_id = new.title_id) then
      new.title_id := old.title_id;
    end if;
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
  char_offset int not null default 0,
  excerpt text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
-- Точное место закладки внутри абзаца (для баз, созданных до этого обновления)
alter table public.bookmarks add column if not exists char_offset int not null default 0;

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

-- ═══════════════════════════ Сообщество и коллекции ═══════════════════════════
--  Друзья, комментарии, титулы, карточки, кейсы, обмены и покупки кейсов.
--  Все изменения, где важна честность (открытие кейса, обмен, выдача наград),
--  проходят через функции на сервере: подменить результат из браузера нельзя.

-- ───────────────────────────── Титулы ─────────────────────────────

create table if not exists public.titles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '',
  tone text not null default 'ember',
  novel_id uuid references public.novels (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_titles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

-- Титул, который показывается рядом с ником
alter table public.profiles add column if not exists title_id uuid references public.titles (id) on delete set null;

alter table public.titles enable row level security;
alter table public.user_titles enable row level security;

drop policy if exists "Titles are public" on public.titles;
create policy "Titles are public" on public.titles for select using (true);
drop policy if exists "Admins manage titles" on public.titles;
create policy "Admins manage titles" on public.titles
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "User titles are public" on public.user_titles;
create policy "User titles are public" on public.user_titles for select using (true);
drop policy if exists "Admins grant titles" on public.user_titles;
create policy "Admins grant titles" on public.user_titles
  for insert with check ((select public.is_admin()));
drop policy if exists "Admins revoke titles" on public.user_titles;
create policy "Admins revoke titles" on public.user_titles
  for delete using ((select public.is_admin()));

-- Отозванный титул снимается и с профиля
create or replace function public.user_titles_after_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set title_id = null where id = old.user_id and title_id = old.title_id;
  return null;
end;
$$;

drop trigger if exists user_titles_unset on public.user_titles;
create trigger user_titles_unset
  after delete on public.user_titles
  for each row execute function public.user_titles_after_delete();

-- Администратор может править чужие профили (ник, описание, аватар, титул).
drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles" on public.profiles
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

-- ───────────────────────────── Друзья ─────────────────────────────

create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

create unique index if not exists friendships_pair_key
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;

drop policy if exists "Friendships visible to both" on public.friendships;
create policy "Friendships visible to both" on public.friendships
  for select using (auth.uid() in (requester, addressee));

-- Возвращает новое состояние: 'outgoing' (заявка отправлена) или 'friends'.
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.friendships;
begin
  if me is null then raise exception 'Войдите в аккаунт, чтобы продолжить'; end if;
  if target = me then raise exception 'Нельзя добавить в друзья самого себя'; end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'Пользователь не найден';
  end if;
  select * into row from public.friendships
  where least(requester, addressee) = least(me, target) and greatest(requester, addressee) = greatest(me, target)
  for update;
  if found then
    if row.status = 'accepted' then return 'friends'; end if;
    if row.requester = target then
      update public.friendships set status = 'accepted', created_at = now()
      where requester = target and addressee = me;
      return 'friends';
    end if;
    return 'outgoing';
  end if;
  insert into public.friendships (requester, addressee) values (me, target);
  return 'outgoing';
end;
$$;

create or replace function public.respond_friend_request(other uuid, accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Войдите в аккаунт, чтобы продолжить'; end if;
  if accept then
    update public.friendships set status = 'accepted', created_at = now()
    where requester = other and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where requester = other and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Удалить из друзей, отменить свою заявку или отклонить чужую
create or replace function public.remove_friend(other uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Войдите в аккаунт, чтобы продолжить'; end if;
  delete from public.friendships
  where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
end;
$$;

create or replace function public.search_profiles(q text, lim int default 30)
returns setof public.profiles
language sql stable security definer set search_path = public
as $$
  select p.* from public.profiles p
  where q is not null and char_length(trim(q)) > 0
    and (p.username ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by (lower(p.username) = lower(trim(q))) desc, char_length(p.username), p.created_at
  limit least(greatest(coalesce(lim, 30), 1), 50);
$$;

-- ───────────────────────────── Комментарии ─────────────────────────────

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references public.novels (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_target_idx on public.comments (novel_id, chapter_id, created_at);

alter table public.comments enable row level security;

drop policy if exists "Comments are public" on public.comments;
create policy "Comments are public" on public.comments
  for select using (
    (select public.is_admin()) or exists (select 1 from public.novels n where n.id = novel_id and n.published)
  );

drop policy if exists "Users write own comments" on public.comments;
create policy "Users write own comments" on public.comments
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Authors and admins delete comments" on public.comments;
create policy "Authors and admins delete comments" on public.comments
  for delete using (user_id = auth.uid() or (select public.is_admin()));

-- Ответ всегда крепится к корневому комментарию той же страницы.
create or replace function public.comments_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  parent public.comments;
begin
  new.body := trim(new.body);
  new.created_at := now();
  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if not found then raise exception 'Комментарий, на который вы отвечаете, удалён'; end if;
    new.parent_id := coalesce(parent.parent_id, parent.id);
    new.novel_id := parent.novel_id;
    new.chapter_id := parent.chapter_id;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_before on public.comments;
create trigger comments_before
  before insert on public.comments
  for each row execute function public.comments_before_insert();

-- ───────────────────────────── Карточки и кейсы ─────────────────────────────

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary', 'mythic')),
  image_url text,
  style jsonb not null default '{"palette": 2, "kanji": "札"}',
  novel_id uuid references public.novels (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency text not null default 'USDT',
  weights jsonb not null default '{"common": 60, "rare": 25, "epic": 10, "legendary": 4, "mythic": 1}',
  novel_id uuid references public.novels (id) on delete set null,
  weekly boolean not null default false,
  active boolean not null default true,
  image_url text,
  style jsonb not null default '{"palette": 8, "kanji": "運"}',
  created_at timestamptz not null default now()
);

create table if not exists public.user_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  source text not null default 'admin' check (source in ('weekly', 'purchase', 'admin')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  card_id uuid references public.cards (id) on delete set null
);

create index if not exists user_cases_user_idx on public.user_cases (user_id, created_at desc);

create table if not exists public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  source text not null default 'case' check (source in ('case', 'admin', 'trade')),
  obtained_at timestamptz not null default now()
);

create index if not exists user_cards_user_idx on public.user_cards (user_id, obtained_at desc);

alter table public.cards enable row level security;
alter table public.cases enable row level security;
alter table public.user_cases enable row level security;
alter table public.user_cards enable row level security;

drop policy if exists "Cards are public" on public.cards;
create policy "Cards are public" on public.cards for select using (true);
drop policy if exists "Admins manage cards" on public.cards;
create policy "Admins manage cards" on public.cards
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Cases are public" on public.cases;
create policy "Cases are public" on public.cases for select using (active or (select public.is_admin()));
drop policy if exists "Admins manage cases" on public.cases;
create policy "Admins manage cases" on public.cases
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Own cases" on public.user_cases;
create policy "Own cases" on public.user_cases
  for select using (user_id = auth.uid() or (select public.is_admin()));
drop policy if exists "Admins remove cases" on public.user_cases;
create policy "Admins remove cases" on public.user_cases for delete using ((select public.is_admin()));

-- Коллекции открыты всем: их видно в профилях и при обмене.
drop policy if exists "Collections are public" on public.user_cards;
create policy "Collections are public" on public.user_cards for select using (true);
drop policy if exists "Admins remove cards" on public.user_cards;
create policy "Admins remove cards" on public.user_cards for delete using ((select public.is_admin()));

-- Бесплатный кейс раз в 7 дней
create or replace function public.claim_weekly_case()
returns public.user_cases
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  weekly_case uuid;
  last_claim timestamptz;
  result public.user_cases;
begin
  if me is null then raise exception 'Войдите в аккаунт, чтобы продолжить'; end if;
  perform pg_advisory_xact_lock(hashtext('weekly:' || me::text));
  select id into weekly_case from public.cases where weekly and active order by created_at limit 1;
  if weekly_case is null then raise exception 'Еженедельный кейс пока не настроен'; end if;
  select max(created_at) into last_claim from public.user_cases where user_id = me and source = 'weekly';
  if last_claim is not null and last_claim > now() - interval '7 days' then
    raise exception 'Следующий бесплатный кейс будет доступен %',
      to_char((last_claim + interval '7 days') at time zone 'Europe/Moscow', 'DD.MM в HH24:MI по Москве');
  end if;
  insert into public.user_cases (user_id, case_id, source) values (me, weekly_case, 'weekly') returning * into result;
  return result;
end;
$$;

-- Открыть кейс: редкость выбирается по весам кейса, затем случайная карточка этой редкости.
create or replace function public.open_case(p_id uuid)
returns public.user_cards
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  owned public.user_cases;
  box public.cases;
  rarities text[] := array['common', 'rare', 'epic', 'legendary', 'mythic'];
  r text;
  total numeric := 0;
  roll numeric;
  picked_rarity text;
  picked_card uuid;
  result public.user_cards;
begin
  if me is null then raise exception 'Войдите в аккаунт, чтобы продолжить'; end if;
  select * into owned from public.user_cases where id = p_id and user_id = me for update;
  if not found then raise exception 'Кейс не найден'; end if;
  if owned.opened_at is not null then raise exception 'Этот кейс уже открыт'; end if;
  select * into box from public.cases where id = owned.case_id;

  foreach r in array rarities loop
    if exists (select 1 from public.cards c
               where c.active and c.rarity = r and (box.novel_id is null or c.novel_id = box.novel_id)) then
      total := total + greatest(coalesce((box.weights ->> r)::numeric, 0), 0);
    end if;
  end loop;
  if total <= 0 then raise exception 'В этом кейсе пока нет карточек'; end if;

  roll := random() * total;
  foreach r in array rarities loop
    if exists (select 1 from public.cards c
               where c.active and c.rarity = r and (box.novel_id is null or c.novel_id = box.novel_id)) then
      roll := roll - greatest(coalesce((box.weights ->> r)::numeric, 0), 0);
      if roll < 0 then picked_rarity := r; exit; end if;
    end if;
  end loop;
  if picked_rarity is null then
    -- Защита от погрешности округления: берём самую редкую из доступных.
    select c.rarity into picked_rarity from public.cards c
    where c.active and (box.novel_id is null or c.novel_id = box.novel_id)
      and greatest(coalesce((box.weights ->> c.rarity)::numeric, 0), 0) > 0
    order by array_position(rarities, c.rarity) desc limit 1;
  end if;

  select c.id into picked_card from public.cards c
  where c.active and c.rarity = picked_rarity and (box.novel_id is null or c.novel_id = box.novel_id)
  order by random() limit 1;

  insert into public.user_cards (user_id, card_id, source) values (me, picked_card, 'case') returning * into result;
  update public.user_cases set opened_at = now(), card_id = picked_card where id = p_id;
  return result;
end;
$$;

create or replace function public.grant_case(p_user uuid, p_case uuid, p_quantity int default 1)
returns int
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if p_quantity < 1 or p_quantity > 100 then raise exception 'Можно выдать от 1 до 100 кейсов за раз'; end if;
  insert into public.user_cases (user_id, case_id, source)
  select p_user, p_case, 'admin' from generate_series(1, p_quantity);
  return p_quantity;
end;
$$;

create or replace function public.grant_card(p_user uuid, p_card uuid)
returns public.user_cards
language plpgsql security definer set search_path = public
as $$
declare
  result public.user_cards;
begin
  if not public.is_admin() then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  insert into public.user_cards (user_id, card_id, source) values (p_user, p_card, 'admin') returning * into result;
  return result;
end;
$$;

-- ───────────────────────────── Обмены ─────────────────────────────

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  offer uuid[] not null default '{}',
  request uuid[] not null default '{}',
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_user <> to_user)
);

create index if not exists trades_users_idx on public.trades (to_user, status);

alter table public.trades enable row level security;

drop policy if exists "Trades visible to participants" on public.trades;
create policy "Trades visible to participants" on public.trades
  for select using (auth.uid() in (from_user, to_user) or (select public.is_admin()));

create or replace function public.create_trade(p_to uuid, p_offer uuid[], p_request uuid[], p_message text default '')
returns public.trades
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  offer uuid[] := coalesce(p_offer, '{}');
  request uuid[] := coalesce(p_request, '{}');
  result public.trades;
begin
  if me is null then raise exception 'Войдите в аккаунт, чтобы продолжить'; end if;
  if p_to = me then raise exception 'Нельзя обменяться с самим собой'; end if;
  if cardinality(offer) + cardinality(request) = 0 then raise exception 'Выберите хотя бы одну карточку'; end if;
  if cardinality(offer) > 10 or cardinality(request) > 10 then raise exception 'Не больше 10 карточек с каждой стороны'; end if;
  if (select count(distinct x) from unnest(offer) x) <> cardinality(offer)
     or (select count(distinct x) from unnest(request) x) <> cardinality(request) then
    raise exception 'Карточка указана дважды';
  end if;
  if (select count(*) from public.user_cards where id = any(offer) and user_id = me) <> cardinality(offer) then
    raise exception 'Часть ваших карточек уже не у вас';
  end if;
  if (select count(*) from public.user_cards where id = any(request) and user_id = p_to) <> cardinality(request) then
    raise exception 'Часть карточек собеседника уже не у него';
  end if;
  insert into public.trades (from_user, to_user, offer, request, message)
  values (me, p_to, offer, request, left(coalesce(p_message, ''), 300))
  returning * into result;
  return result;
end;
$$;

create or replace function public.respond_trade(p_id uuid, p_accept boolean)
returns public.trades
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  t public.trades;
begin
  if me is null then raise exception 'Войдите в аккаунт, чтобы продолжить'; end if;
  select * into t from public.trades where id = p_id and to_user = me and status = 'pending' for update;
  if not found then raise exception 'Предложение обмена не найдено или уже закрыто'; end if;
  if not p_accept then
    update public.trades set status = 'declined', resolved_at = now() where id = p_id returning * into t;
    return t;
  end if;
  perform 1 from public.user_cards where id = any(t.offer || t.request) for update;
  if (select count(*) from public.user_cards where id = any(t.offer) and user_id = t.from_user) <> cardinality(t.offer)
     or (select count(*) from public.user_cards where id = any(t.request) and user_id = t.to_user) <> cardinality(t.request) then
    update public.trades set status = 'cancelled', resolved_at = now() where id = p_id;
    raise exception 'Обмен невозможен: часть карточек уже сменила владельца';
  end if;
  update public.user_cards set user_id = t.to_user, source = 'trade', obtained_at = now() where id = any(t.offer);
  update public.user_cards set user_id = t.from_user, source = 'trade', obtained_at = now() where id = any(t.request);
  update public.trades set status = 'accepted', resolved_at = now() where id = p_id returning * into t;
  return t;
end;
$$;

create or replace function public.cancel_trade(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Войдите в аккаунт, чтобы продолжить'; end if;
  update public.trades set status = 'cancelled', resolved_at = now()
  where id = p_id and from_user = auth.uid() and status = 'pending';
end;
$$;

-- ───────────────────────────── Покупки кейсов ─────────────────────────────
--  Счета выставляет серверная функция api/cryptobot.ts (Vercel) от имени сервиса:
--  из браузера записи о покупках создать или изменить нельзя.

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  case_id uuid references public.cases (id) on delete set null,
  quantity int not null default 1 check (quantity between 1 and 50),
  amount numeric(18, 8) not null,
  currency text not null,
  invoice_id bigint unique,
  pay_url text,
  status text not null default 'active' check (status in ('active', 'credited', 'expired', 'failed')),
  created_at timestamptz not null default now(),
  credited_at timestamptz
);

create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);

alter table public.purchases enable row level security;

drop policy if exists "Own purchases" on public.purchases;
create policy "Own purchases" on public.purchases
  for select using (user_id = auth.uid() or (select public.is_admin()));

-- Зачислить оплаченную покупку. Повторный вызов ничего не делает.
create or replace function public.credit_purchase(p_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  p public.purchases;
begin
  update public.purchases set status = 'credited', credited_at = now()
  where id = p_id and status = 'active' and case_id is not null
  returning * into p;
  if not found then return 0; end if;
  insert into public.user_cases (user_id, case_id, source)
  select p.user_id, p.case_id, 'purchase' from generate_series(1, p.quantity);
  return p.quantity;
end;
$$;

-- ───────────────────────────── Для администратора ─────────────────────────────

-- Сколько глав каждого тайтла прочитал пользователь — чтобы выдавать титулы за прочтение.
create or replace function public.admin_user_reading(p_user uuid)
returns table (novel_id uuid, chapters_read int, chapters_total int, last_read_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  return query
    select r.novel_id, count(*)::int, max(n.chapters_count)::int, max(r.read_at)
    from public.chapter_reads r
    join public.novels n on n.id = r.novel_id
    where r.user_id = p_user
    group by r.novel_id
    order by max(r.read_at) desc;
end;
$$;

-- Права на функции: по умолчанию Supabase открывает их всем ролям — закрываем лишнее.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.send_friend_request(uuid)', 'public.respond_friend_request(uuid, boolean)', 'public.remove_friend(uuid)',
    'public.claim_weekly_case()', 'public.open_case(uuid)', 'public.grant_case(uuid, uuid, int)',
    'public.grant_card(uuid, uuid)', 'public.create_trade(uuid, uuid[], uuid[], text)',
    'public.respond_trade(uuid, boolean)', 'public.cancel_trade(uuid)', 'public.admin_user_reading(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  execute 'grant execute on function public.search_profiles(text, int) to anon, authenticated';
  execute 'revoke all on function public.credit_purchase(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.credit_purchase(uuid) to service_role';
end;
$$;

-- ───────────────────────────── Полезное ─────────────────────────────
-- Выдать права администратора вручную (подставьте email):
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
