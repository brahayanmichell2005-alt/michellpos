-- =====================================================================
-- michellpos — Migración FASE 1
-- Ejecutar en: Supabase → SQL Editor → Nueva consulta → pegar todo → Run
-- Se puede volver a ejecutar sin romper nada (operaciones idempotentes).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ========================== 1. TABLAS ================================

-- Negocios (cada cliente que alquila el POS)
create table if not exists public.negocios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  ruc         text,
  correo      text,
  telefono    text,
  creado_en   timestamptz not null default now()
);

-- Perfiles: conecta cada usuario con su negocio y su rol
create table if not exists public.perfiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  rol         text not null check (rol in ('dueño','administrador','cajero')),
  nombre      text not null,
  creado_en   timestamptz not null default now()
);

-- Superadmins: dueño del SaaS (tú). Se agrega aquí por SQL, no desde la app.
create table if not exists public.superadmins (
  user_id     uuid primary key references auth.users (id) on delete cascade
);

-- Planes del servicio
create table if not exists public.planes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null unique,
  precio_mensual numeric(10, 2) not null default 0,
  max_usuarios   integer not null default 1 check (max_usuarios >= 1),
  max_sucursales integer not null default 1 check (max_sucursales >= 1),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);

-- Suscripciones: estado de cada negocio (prueba/activo/vencido/suspendido)
create table if not exists public.suscripciones (
  id                 uuid primary key default gen_random_uuid(),
  negocio_id         uuid not null references public.negocios (id) on delete cascade,
  plan_id            uuid references public.planes (id),
  estado             text not null default 'en_prueba'
                       check (estado in ('en_prueba','activo','vencido','suspendido')),
  inicio_prueba      date,
  fin_prueba         date,
  fecha_vencimiento  date,
  creado_en          timestamptz not null default now()
);

-- Pagos del servicio (el superadmin los confirma desde /admin, Fase 4)
create table if not exists public.pagos (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      uuid not null references public.negocios (id) on delete cascade,
  monto           numeric(10, 2) not null check (monto >= 0),
  metodo          text not null, -- efectivo / yape / plin / transferencia
  referencia      text,
  fecha           date not null default current_date,
  confirmado_por  uuid references auth.users (id),
  creado_en       timestamptz not null default now()
);

-- Registro de accesos y acciones del superadmin en cuentas de clientes
create table if not exists public.auditoria_admin (
  id             uuid primary key default gen_random_uuid(),
  superadmin_id  uuid not null references auth.users (id),
  negocio_id     uuid references public.negocios (id) on delete cascade,
  accion         text not null,
  fecha          timestamptz not null default now()
);

-- Índices para las consultas más comunes
create index if not exists idx_perfiles_negocio      on public.perfiles      (negocio_id);
create index if not exists idx_suscripciones_negocio on public.suscripciones (negocio_id);
create index if not exists idx_pagos_negocio         on public.pagos         (negocio_id);

-- ================= 2. FUNCIONES AUXILIARES ===========================
-- security definer: se ejecutan con permisos de la función para poder
-- leer perfiles/superadmins dentro de las políticas sin recursión.

-- ¿El usuario autenticado pertenece al negocio indicado?
create or replace function public.pertenece_al_negocio(neg uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = auth.uid() and p.negocio_id = neg
  );
$$;

-- ¿El usuario autenticado es superadmin (dueño del SaaS)?
create or replace function public.es_superadmin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.superadmins s where s.user_id = auth.uid()
  );
$$;

-- ========================== 3. RLS ===================================
-- Regla de oro: TODAS las tablas con datos de clientes llevan RLS.

alter table public.negocios       enable row level security;
alter table public.perfiles       enable row level security;
alter table public.superadmins    enable row level security;
alter table public.planes         enable row level security;
alter table public.suscripciones  enable row level security;
alter table public.pagos          enable row level security;
alter table public.auditoria_admin enable row level security;

-- ========================= 4. POLÍTICAS ==============================
-- drop policy if exists ... para poder re-ejecutar la migración.

-- ----- negocios -----
drop policy if exists negocios_lectura on public.negocios;
create policy negocios_lectura on public.negocios
  for select
  using (pertenece_al_negocio(id) or es_superadmin());

drop policy if exists negocios_actualizar on public.negocios;
create policy negocios_actualizar on public.negocios
  for update
  using (pertenece_al_negocio(id))
  with check (pertenece_al_negocio(id));

drop policy if exists negocios_insertar on public.negocios;
create policy negocios_insertar on public.negocios
  for insert with check (es_superadmin());

-- ----- perfiles -----
drop policy if exists perfiles_lectura on public.perfiles;
create policy perfiles_lectura on public.perfiles
  for select
  using (
    user_id = auth.uid()
    or pertenece_al_negocio(negocio_id)
    or es_superadmin()
  );

drop policy if exists perfiles_insertar on public.perfiles;
create policy perfiles_insertar on public.perfiles
  for insert with check (es_superadmin());

drop policy if exists perfiles_actualizar on public.perfiles;
create policy perfiles_actualizar on public.perfiles
  for update
  using (user_id = auth.uid() or es_superadmin())
  with check (user_id = auth.uid() or es_superadmin());

-- ----- superadmins -----
drop policy if exists superadmins_lectura on public.superadmins;
create policy superadmins_lectura on public.superadmins
  for select
  using (user_id = auth.uid());

-- ----- planes -----
drop policy if exists planes_lectura on public.planes;
create policy planes_lectura on public.planes
  for select
  using (true); -- catálogo público: la página de inicio lo muestra

drop policy if exists planes_administrar on public.planes;
create policy planes_administrar on public.planes
  for all
  using (es_superadmin())
  with check (es_superadmin());

-- ----- suscripciones -----
drop policy if exists suscripciones_lectura on public.suscripciones;
create policy suscripciones_lectura on public.suscripciones
  for select
  using (pertenece_al_negocio(negocio_id) or es_superadmin());

drop policy if exists suscripciones_administrar on public.suscripciones;
create policy suscripciones_administrar on public.suscripciones
  for all
  using (es_superadmin())
  with check (es_superadmin());

-- ----- pagos -----
drop policy if exists pagos_lectura on public.pagos;
create policy pagos_lectura on public.pagos
  for select    
  using (pertenece_al_negocio(negocio_id) or es_superadmin());

drop policy if exists pagos_administrar on public.pagos;
create policy pagos_administrar on public.pagos
  for all
  using (es_superadmin())
  with check (es_superadmin());

-- ----- auditoria_admin -----
drop policy if exists auditoria_lectura on public.auditoria_admin;
create policy auditoria_lectura on public.auditoria_admin
  for select
  using (es_superadmin());

drop policy if exists auditoria_insertar on public.auditoria_admin;
create policy auditoria_insertar on public.auditoria_admin
  for insert with check (es_superadmin());

-- ===================== 5. PLANES INICIALES ===========================
-- Precios y límites de ejemplo: editables desde Supabase o /admin (Fase 2).

insert into public.planes (nombre, precio_mensual, max_usuarios, max_sucursales, activo)
values
  ('Básico',    39.90,  2, 1, true),
  ('Medio',     69.90,  5, 2, true),
  ('Completo',  99.90, 10, 5, true)
on conflict (nombre) do nothing;
