-- =============================================================================================
-- KAIZEN · plataforma de licencias
--
-- Proyecto Supabase dedicado (kaizen-licencias). El prefijo kz_ se conserva para que el esquema
-- pueda convivir con otras aplicaciones si algún día se comparte el proyecto.
--
-- Escrituras sensibles (crear licencias, aprobar pagos, vincular equipos, firmar versiones) NO
-- se hacen desde el navegador: pasan por la Edge Function `kaizen` con la service role. El
-- navegador solo lee lo suyo (RLS) y el administrador edita planes, ajustes y versiones.
-- =============================================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------------------------
create table if not exists public.kz_profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    email       text not null default '',
    full_name   text not null default '',
    phone       text not null default '',
    company     text not null default '',
    role        text not null default 'customer' check (role in ('customer', 'admin')),
    blocked     boolean not null default false,
    created_at  timestamptz not null default now()
);

-- Correos que reciben rol de administrador al registrarse. Sin políticas: solo service role.
create table if not exists public.kz_admin_allowlist (
    email text primary key
);

create or replace function public.kz_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.kz_profiles p
        where p.id = auth.uid() and p.role = 'admin' and not p.blocked
    );
$$;

create or replace function public.kz_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Un fallo aquí nunca debe impedir el alta del usuario.
    begin
        insert into public.kz_profiles (id, email, full_name, phone, role)
        values (
            new.id,
            coalesce(new.email, ''),
            coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'nombre', ''),
            coalesce(new.raw_user_meta_data ->> 'phone', ''),
            case when exists (
                select 1 from public.kz_admin_allowlist a where lower(a.email) = lower(new.email)
            ) then 'admin' else 'customer' end
        )
        on conflict (id) do nothing;
    exception when others then
        raise warning 'kz_handle_new_user: %', sqlerrm;
    end;
    return new;
end;
$$;

drop trigger if exists kz_on_auth_user_created on auth.users;
create trigger kz_on_auth_user_created
    after insert on auth.users
    for each row execute function public.kz_handle_new_user();

-- Confirmación automática del correo.
--
-- El SMTP incluido en Supabase solo envía a los miembros del equipo del proyecto, así que sin un
-- SMTP propio los clientes nunca recibirían el correo de confirmación y no podrían entrar. La
-- licencia queda atada a la placa base, de modo que un correo falso no regala nada. Cuando se
-- configure un SMTP (Resend, Brevo…) en Auth → SMTP, basta con borrar este trigger.
create or replace function public.kz_autoconfirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.email_confirmed_at is null then
        new.email_confirmed_at := now();
    end if;
    return new;
end;
$$;
revoke all on function public.kz_autoconfirm() from public, anon, authenticated;

drop trigger if exists kz_autoconfirm_user on auth.users;
create trigger kz_autoconfirm_user
    before insert on auth.users
    for each row execute function public.kz_autoconfirm();

-- ---------------------------------------------------------------------------------------------
-- Planes (editables por el administrador)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.kz_plans (
    id              text primary key,
    name            text not null,
    tagline         text not null default '',
    months          integer not null default 0 check (months >= 0),
    days            integer not null default 0 check (days >= 0),
    price_pen       numeric(10, 2) not null check (price_pen >= 0),
    list_price_pen  numeric(10, 2),
    devices         integer not null default 1 check (devices between 1 and 100),
    badge           text,
    highlight       boolean not null default false,
    features        jsonb not null default '[]'::jsonb,
    sort            integer not null default 0,
    active          boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint kz_plans_duration check (months > 0 or days > 0)
);

-- ---------------------------------------------------------------------------------------------
-- Licencias, equipos y pruebas
-- ---------------------------------------------------------------------------------------------
create table if not exists public.kz_licenses (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references public.kz_profiles (id) on delete cascade,
    license_key    text not null unique,
    plan_id        text references public.kz_plans (id) on delete set null,
    is_trial       boolean not null default false,
    status         text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
    duration_days  integer not null default 0,
    starts_at      timestamptz,
    expires_at     timestamptz,
    max_devices    integer not null default 1 check (max_devices between 1 and 100),
    notes          text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index if not exists kz_licenses_user_idx on public.kz_licenses (user_id);

-- Equipo vinculado. machine_hash es la huella de la placa base (SMBIOS) calculada en el add-in.
create table if not exists public.kz_devices (
    id             uuid primary key default gen_random_uuid(),
    license_id     uuid not null references public.kz_licenses (id) on delete cascade,
    machine_hash   text not null,
    machine_id     text not null default '',
    label          text not null default '',
    os             text not null default '',
    revit_version  text not null default '',
    addin_version  text not null default '',
    active         boolean not null default true,
    first_seen     timestamptz not null default now(),
    last_seen      timestamptz not null default now(),
    unique (license_id, machine_hash)
);
create index if not exists kz_devices_machine_idx on public.kz_devices (machine_hash);

-- Una prueba gratuita por placa base, para siempre (reinstalar Windows o el add-in no la reinicia).
create table if not exists public.kz_trials (
    machine_hash  text primary key,
    user_id       uuid references public.kz_profiles (id) on delete set null,
    license_id    uuid references public.kz_licenses (id) on delete set null,
    created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Pedidos / pagos
-- ---------------------------------------------------------------------------------------------
create table if not exists public.kz_orders (
    id                uuid primary key default gen_random_uuid(),
    code              text not null unique default ('KZ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
    user_id           uuid not null references public.kz_profiles (id) on delete cascade,
    plan_id           text not null references public.kz_plans (id),
    plan_name         text not null default '',
    amount_pen        numeric(10, 2) not null,
    -- id de kz_payment_methods, o 'mercadopago' / 'manual' (licencia creada por el admin).
    method            text not null,
    method_name       text not null default '',
    status            text not null default 'pending' check (status in ('pending', 'review', 'paid', 'rejected', 'cancelled')),
    provider_ref      text,
    provider_status   text,
    operation_code    text,
    voucher_path      text,
    customer_note     text,
    admin_note        text,
    renew_license_id  uuid references public.kz_licenses (id) on delete set null,
    license_id        uuid references public.kz_licenses (id) on delete set null,
    reviewed_by       uuid references public.kz_profiles (id) on delete set null,
    created_at        timestamptz not null default now(),
    paid_at           timestamptz
);
create index if not exists kz_orders_user_idx on public.kz_orders (user_id);
create index if not exists kz_orders_status_idx on public.kz_orders (status);

-- ---------------------------------------------------------------------------------------------
-- Auditoría de activaciones / verificaciones
-- ---------------------------------------------------------------------------------------------
create table if not exists public.kz_events (
    id            bigint generated always as identity primary key,
    license_id    uuid references public.kz_licenses (id) on delete set null,
    user_id       uuid references public.kz_profiles (id) on delete set null,
    machine_hash  text,
    action        text not null,
    ok            boolean not null default true,
    detail        text,
    ip            text,
    created_at    timestamptz not null default now()
);
create index if not exists kz_events_created_idx on public.kz_events (created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Versiones del add-in (actualizaciones automáticas)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.kz_releases (
    id              uuid primary key default gen_random_uuid(),
    version         text not null unique,
    channel         text not null default 'stable' check (channel in ('stable', 'beta')),
    revit_versions  text[] not null default array['2025', '2026', '2027'],
    notes           text not null default '',
    download_url    text not null default '',
    sha256          text not null default '',
    size_bytes      bigint not null default 0,
    signature       text,
    mandatory       boolean not null default false,
    published       boolean not null default false,
    published_at    timestamptz,
    created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Ajustes del sitio (datos de pago manual, contacto). `public` = legible sin sesión.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.kz_settings (
    key         text primary key,
    value       jsonb not null default '{}'::jsonb,
    public      boolean not null default true,
    updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Métodos de pago manuales (Yape, Plin, transferencia, …). El admin agrega, edita y ordena.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.kz_payment_methods (
    id            text primary key,
    name          text not null,
    kind          text not null default 'wallet' check (kind in ('wallet', 'bank', 'cash', 'other')),
    holder        text not null default '',
    account       text not null default '',
    account_alt   text not null default '',
    instructions  text not null default '',
    qr_url        text not null default '',
    requires_voucher boolean not null default true,
    active        boolean not null default true,
    sort          integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- updated_at automático
create or replace function public.kz_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists kz_plans_touch on public.kz_plans;
create trigger kz_plans_touch before update on public.kz_plans for each row execute function public.kz_touch();
drop trigger if exists kz_licenses_touch on public.kz_licenses;
create trigger kz_licenses_touch before update on public.kz_licenses for each row execute function public.kz_touch();
drop trigger if exists kz_payment_methods_touch on public.kz_payment_methods;
create trigger kz_payment_methods_touch before update on public.kz_payment_methods for each row execute function public.kz_touch();
drop trigger if exists kz_settings_touch on public.kz_settings;
create trigger kz_settings_touch before update on public.kz_settings for each row execute function public.kz_touch();

-- =============================================================================================
-- RLS
-- =============================================================================================
alter table public.kz_profiles        enable row level security;
alter table public.kz_admin_allowlist enable row level security;
alter table public.kz_plans           enable row level security;
alter table public.kz_licenses        enable row level security;
alter table public.kz_devices         enable row level security;
alter table public.kz_trials          enable row level security;
alter table public.kz_orders          enable row level security;
alter table public.kz_events          enable row level security;
alter table public.kz_releases        enable row level security;
alter table public.kz_settings        enable row level security;
alter table public.kz_payment_methods enable row level security;

-- Perfiles: cada uno ve el suyo; el admin ve todos. El cliente solo puede cambiar sus datos de
-- contacto: el rol y el bloqueo quedan fuera por permisos de columna (no hay escalada a admin).
create policy kz_profiles_select on public.kz_profiles
    for select to authenticated using (id = (select auth.uid()) or (select public.kz_is_admin()));
create policy kz_profiles_update on public.kz_profiles
    for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.kz_profiles from anon, authenticated;
grant update (full_name, phone, company) on public.kz_profiles to authenticated;

-- Planes: los activos son públicos; el admin los gestiona.
create policy kz_plans_select on public.kz_plans
    for select to anon, authenticated using (active or (select public.kz_is_admin()));
create policy kz_plans_admin_insert on public.kz_plans
    for insert to authenticated with check ((select public.kz_is_admin()));
create policy kz_plans_admin_update on public.kz_plans
    for update to authenticated using ((select public.kz_is_admin())) with check ((select public.kz_is_admin()));
create policy kz_plans_admin_delete on public.kz_plans
    for delete to authenticated using ((select public.kz_is_admin()));

-- Licencias / pedidos: lectura propia o admin. Escritura solo vía Edge Function.
create policy kz_licenses_select on public.kz_licenses
    for select to authenticated using (user_id = (select auth.uid()) or (select public.kz_is_admin()));
create policy kz_orders_select on public.kz_orders
    for select to authenticated using (user_id = (select auth.uid()) or (select public.kz_is_admin()));
create policy kz_devices_select on public.kz_devices
    for select to authenticated using (
        (select public.kz_is_admin())
        or exists (select 1 from public.kz_licenses l where l.id = license_id and l.user_id = (select auth.uid()))
    );
revoke insert, update, delete on public.kz_licenses, public.kz_orders, public.kz_devices from anon, authenticated;

-- Solo admin
create policy kz_trials_admin on public.kz_trials
    for select to authenticated using ((select public.kz_is_admin()));
create policy kz_events_admin on public.kz_events
    for select to authenticated using ((select public.kz_is_admin()));
revoke insert, update, delete on public.kz_trials, public.kz_events, public.kz_admin_allowlist from anon, authenticated;
revoke select on public.kz_admin_allowlist from anon, authenticated;

-- Versiones: las publicadas son públicas; el admin las gestiona (la firma la pone la función).
create policy kz_releases_select on public.kz_releases
    for select to anon, authenticated using (published or (select public.kz_is_admin()));
create policy kz_releases_admin_insert on public.kz_releases
    for insert to authenticated with check ((select public.kz_is_admin()));
create policy kz_releases_admin_update on public.kz_releases
    for update to authenticated using ((select public.kz_is_admin())) with check ((select public.kz_is_admin()));
create policy kz_releases_admin_delete on public.kz_releases
    for delete to authenticated using ((select public.kz_is_admin()));
-- La firma solo la escribe la Edge Function (service role). Un permiso de columna no basta si
-- queda el de tabla, así que se retira el de tabla y se conceden las columnas editables.
revoke insert, update on public.kz_releases from anon, authenticated;
grant insert (version, channel, revit_versions, notes, download_url, sha256, size_bytes, mandatory)
    on public.kz_releases to authenticated;
grant update (version, channel, revit_versions, notes, download_url, sha256, size_bytes, mandatory)
    on public.kz_releases to authenticated;

-- Métodos de pago: los activos son públicos; el admin los gestiona.
create policy kz_payment_methods_select on public.kz_payment_methods
    for select to anon, authenticated using (active or (select public.kz_is_admin()));
create policy kz_payment_methods_admin_insert on public.kz_payment_methods
    for insert to authenticated with check ((select public.kz_is_admin()));
create policy kz_payment_methods_admin_update on public.kz_payment_methods
    for update to authenticated using ((select public.kz_is_admin())) with check ((select public.kz_is_admin()));
create policy kz_payment_methods_admin_delete on public.kz_payment_methods
    for delete to authenticated using ((select public.kz_is_admin()));

-- Ajustes
create policy kz_settings_select on public.kz_settings
    for select to anon, authenticated using (public or (select public.kz_is_admin()));
create policy kz_settings_admin_insert on public.kz_settings
    for insert to authenticated with check ((select public.kz_is_admin()));
create policy kz_settings_admin_update on public.kz_settings
    for update to authenticated using ((select public.kz_is_admin())) with check ((select public.kz_is_admin()));

-- =============================================================================================
-- Clave de firma (ECDSA P-256) en Vault. Solo la service role la puede leer.
-- =============================================================================================
create or replace function public.kz_signing_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select decrypted_secret from vault.decrypted_secrets where name = 'kz_signing_jwk' limit 1;
$$;
revoke all on function public.kz_signing_key() from public, anon, authenticated;
grant execute on function public.kz_signing_key() to service_role;

revoke all on function public.kz_handle_new_user() from public, anon, authenticated;

-- =============================================================================================
-- Storage
-- =============================================================================================
insert into storage.buckets (id, name, public)
values ('kz-releases', 'kz-releases', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('kz-vouchers', 'kz-vouchers', false)
on conflict (id) do nothing;

create policy kz_releases_upload on storage.objects
    for insert to authenticated with check (bucket_id = 'kz-releases' and (select public.kz_is_admin()));
create policy kz_releases_modify on storage.objects
    for update to authenticated using (bucket_id = 'kz-releases' and (select public.kz_is_admin()));
create policy kz_releases_remove on storage.objects
    for delete to authenticated using (bucket_id = 'kz-releases' and (select public.kz_is_admin()));

create policy kz_vouchers_upload on storage.objects
    for insert to authenticated with check (
        bucket_id = 'kz-vouchers' and (storage.foldername(name))[1] = (select auth.uid())::text
    );
create policy kz_vouchers_read on storage.objects
    for select to authenticated using (
        bucket_id = 'kz-vouchers'
        and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.kz_is_admin()))
    );

-- =============================================================================================
-- Datos iniciales
-- =============================================================================================
insert into public.kz_plans (id, name, tagline, months, days, price_pen, list_price_pen, devices, badge, highlight, features, sort) values
    ('mensual',    'Mensual',     'Para un proyecto puntual',            1,  0,  40.00,  null, 1, null,           false,
        '["Las 31 herramientas de KAIZEN","1 equipo (PC)","Actualizaciones incluidas","Soporte por WhatsApp"]', 10),
    ('trimestral', 'Trimestral',  'Un trimestre de producción',          3,  0, 110.00, 120.00, 1, 'Ahorra 8 %',   false,
        '["Las 31 herramientas de KAIZEN","1 equipo (PC)","Actualizaciones incluidas","Soporte por WhatsApp"]', 20),
    ('semestral',  'Semestral',   'Medio año sin preocuparte',           6,  0, 200.00, 240.00, 1, 'Ahorra 17 %',  false,
        '["Las 31 herramientas de KAIZEN","1 equipo (PC)","Actualizaciones incluidas","Soporte prioritario"]', 30),
    ('anual',      'Anual',       'La opción de los profesionales',     12,  0, 300.00, 480.00, 1, 'Más elegido',  true,
        '["Las 31 herramientas de KAIZEN","1 equipo (PC)","Actualizaciones incluidas","Soporte prioritario","Equivale a S/ 25 al mes"]', 40),
    ('bianual',    '2 años',      'Máximo ahorro a largo plazo',        24,  0, 540.00, 960.00, 1, 'Ahorra 44 %',  false,
        '["Las 31 herramientas de KAIZEN","1 equipo (PC)","Actualizaciones incluidas","Soporte prioritario","Equivale a S/ 22.50 al mes"]', 50),
    ('equipo3',    'Equipo x3',   'Tres equipos para tu oficina, 1 año', 12,  0, 810.00, 1440.00, 3, 'Combo oficina', false,
        '["Las 31 herramientas de KAIZEN","3 equipos (PC)","Actualizaciones incluidas","Soporte prioritario","S/ 270 por equipo al año"]', 60)
on conflict (id) do nothing;

insert into public.kz_settings (key, value, public) values
    ('contact', jsonb_build_object(
        'whatsapp', '51951230463',
        'whatsapp_display', '951 230 463',
        'email', '',
        'hours', 'Lun–Sáb, 9:00–19:00',
        'whatsapp_message', 'Hola, quiero información sobre KAIZEN para Revit.'
    ), true),
    ('mercadopago', jsonb_build_object('enabled', false), true),
    ('licensing', jsonb_build_object('trial_days', 3, 'check_interval_days', 5), true)
on conflict (key) do nothing;

insert into public.kz_payment_methods (id, name, kind, holder, account, instructions, requires_voucher, sort) values
    ('yape', 'Yape', 'wallet', '', '951230463',
     'Yapea el monto exacto al número indicado, escribe en el mensaje tu código de pedido y sube la captura del pago. Te activamos en minutos (horario de atención).',
     true, 10)
on conflict (id) do nothing;

-- Administrador inicial: el dueño de la cuenta Supabase/Netlify.
insert into public.kz_admin_allowlist (email) values ('mgl.xdmgl1@gmail.com') on conflict do nothing;

-- Usuarios que ya existían antes de KAIZEN.
insert into public.kz_profiles (id, email, full_name, role)
select u.id, coalesce(u.email, ''), coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'nombre', ''),
       case when exists (select 1 from public.kz_admin_allowlist a where lower(a.email) = lower(u.email)) then 'admin' else 'customer' end
from auth.users u
on conflict (id) do nothing;
