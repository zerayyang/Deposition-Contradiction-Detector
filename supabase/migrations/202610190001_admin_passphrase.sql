-- Admins: any signed-in account becomes an admin by entering the admin passphrase once.
-- Admins may review every owner's corrections (never their own). The passphrase is never
-- stored in the repository: set it in the SQL editor with
--   select feedback_private.set_admin_passphrase('your passphrase');
-- Only a salted SHA-256 hash is kept. Wrong guesses are limited to 5 per account per hour.

create table feedback_private.admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table feedback_private.admin_passphrase (
 id boolean primary key default true check(id),
 salt text not null,
 hash bytea not null,
 updated_at timestamptz not null default now()
);
create table feedback_private.admin_attempts (
 user_id uuid not null references auth.users(id) on delete cascade,
 attempted_at timestamptz not null default now()
);
create index admin_attempts_recent on feedback_private.admin_attempts(user_id,attempted_at);
alter table feedback_private.admins enable row level security;
alter table feedback_private.admin_passphrase enable row level security;
alter table feedback_private.admin_attempts enable row level security;
revoke all on feedback_private.admins, feedback_private.admin_passphrase, feedback_private.admin_attempts from public, anon, authenticated;

-- Database owner only (SQL editor). Not callable from the app.
create function feedback_private.set_admin_passphrase(p_passphrase text)
returns void language plpgsql security definer set search_path = '' as $$
declare s text := gen_random_uuid()::text;
begin
 if p_passphrase is null or length(p_passphrase) < 8 then raise exception 'Use a passphrase of at least 8 characters.'; end if;
 insert into feedback_private.admin_passphrase(id,salt,hash,updated_at) values(true,s,sha256(convert_to(s||p_passphrase,'UTF8')),now())
 on conflict(id) do update set salt=excluded.salt,hash=excluded.hash,updated_at=now();
end;
$$;
revoke all on function feedback_private.set_admin_passphrase(text) from public, anon, authenticated;

create function public.is_feedback_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and (
  exists(select 1 from feedback_private.admins a where a.user_id=auth.uid())
  or exists(select 1 from feedback_private.reviewer_assignments r where r.reviewer_id=auth.uid()));
$$;
revoke all on function public.is_feedback_admin() from public, anon, authenticated;
grant execute on function public.is_feedback_admin() to authenticated;

-- Returns true when the passphrase matches (the caller is now an admin), false otherwise.
create function public.become_feedback_admin(p_passphrase text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare caller uuid := auth.uid(); stored feedback_private.admin_passphrase;
begin
 if caller is null then raise exception 'Sign in before entering the admin passphrase.'; end if;
 if exists(select 1 from feedback_private.admins where user_id=caller) then return true; end if;
 if (select count(*) from feedback_private.admin_attempts where user_id=caller and attempted_at > now() - interval '1 hour') >= 5 then
  raise exception 'Too many passphrase attempts. Try again in an hour.';
 end if;
 select * into stored from feedback_private.admin_passphrase where id;
 if not found then raise exception 'The admin passphrase has not been set up yet.'; end if;
 if p_passphrase is null or sha256(convert_to(stored.salt||p_passphrase,'UTF8')) <> stored.hash then
  insert into feedback_private.admin_attempts(user_id) values(caller);
  return false;
 end if;
 insert into feedback_private.admins(user_id) values(caller) on conflict do nothing;
 return true;
end;
$$;
revoke all on function public.become_feedback_admin(text) from public, anon, authenticated;
grant execute on function public.become_feedback_admin(text) to authenticated;

-- Admins review every owner's corrections; assigned reviewers keep their access. Nobody reviews their own.
create or replace function public.can_review_finding_feedback(p_owner_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and auth.uid() <> p_owner_id and (
  exists(select 1 from feedback_private.reviewer_assignments r where r.owner_id=p_owner_id and r.reviewer_id=auth.uid())
  or exists(select 1 from feedback_private.admins a where a.user_id=auth.uid()));
$$;
