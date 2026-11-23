-- Refrigeración 360 · Migración inicial multiusuario
-- Ejecutar una sola vez en Supabase SQL Editor. Configurar SMS en Auth > Providers.
create extension if not exists pgcrypto;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
 check (role in ('owner','admin','secretary','technician','customer','partner_technician'));

alter table public.service_orders add column if not exists equipment_type text;
alter table public.customers add column if not exists phone text;

create table if not exists public.staff_invites(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 code_hash text not null unique,
 role text not null check(role in ('admin','technician')),
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null default now()+interval '7 days',
 redeemed_by uuid references auth.users(id),
 redeemed_at timestamptz,
 created_at timestamptz not null default now()
);

create or replace function public.my_org_id() returns uuid
language sql stable security definer set search_path=public
as $$ select organization_id from public.profiles where id=auth.uid() $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;

create or replace function public.bootstrap_owner(company_name text)
returns uuid language plpgsql security definer set search_path=public,auth
as $$
declare org_id uuid; uid uuid:=auth.uid(); phone_value text;
begin
 if uid is null then raise exception 'Debes iniciar sesión'; end if;
 if exists(select 1 from public.profiles where id=uid) then raise exception 'Este usuario ya tiene un perfil'; end if;
 perform pg_advisory_xact_lock(hashtext('refrigeracion360_first_owner'));
 if exists(select 1 from public.organizations) then raise exception 'La empresa ya tiene propietario. Solicita un código de invitación.'; end if;
 select phone into phone_value from auth.users where id=uid;
 insert into public.organizations(name) values(coalesce(nullif(trim(company_name),''),'Refrigeración 360')) returning id into org_id;
 insert into public.profiles(id,organization_id,full_name,phone,role)
 values(uid,org_id,coalesce(phone_value,'Propietario'),phone_value,'owner');
 return org_id;
end $$;

create or replace function public.create_staff_invite(p_role text default 'technician')
returns text language plpgsql security definer set search_path=public
as $$
declare raw_code text; org_id uuid;
begin
 if public.my_role() <> 'owner' then raise exception 'Solo el propietario puede crear invitaciones'; end if;
 if p_role not in ('admin','technician') then raise exception 'Rol no permitido'; end if;
 org_id:=public.my_org_id();
 raw_code:=lpad((floor(random()*1000000))::int::text,6,'0');
 insert into public.staff_invites(organization_id,code_hash,role,created_by)
 values(org_id,encode(digest(raw_code,'sha256'),'hex'),p_role,auth.uid());
 return raw_code;
end $$;

create or replace function public.redeem_staff_invite(p_code text)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare inv public.staff_invites%rowtype; uid uuid:=auth.uid(); phone_value text;
begin
 if uid is null then raise exception 'Debes iniciar sesión'; end if;
 if exists(select 1 from public.profiles where id=uid) then raise exception 'Esta cuenta ya está vinculada'; end if;
 select * into inv from public.staff_invites
 where code_hash=encode(digest(p_code,'sha256'),'hex') and redeemed_at is null and expires_at>now()
 for update;
 if not found then raise exception 'Código inválido, vencido o ya utilizado'; end if;
 select phone into phone_value from auth.users where id=uid;
 insert into public.profiles(id,organization_id,full_name,phone,role)
 values(uid,inv.organization_id,coalesce(phone_value,'Usuario'),phone_value,inv.role);
 update public.staff_invites set redeemed_by=uid,redeemed_at=now() where id=inv.id;
end $$;

create or replace function public.create_service_order(
 p_customer_name text,p_customer_phone text,p_address text,p_equipment_type text,
 p_description text,p_scheduled_at timestamptz default null,p_quoted_amount numeric default 0
) returns uuid language plpgsql security definer set search_path=public
as $$
declare org_id uuid; cust_id uuid; addr_id uuid; order_id uuid; tech_id uuid;
begin
 org_id:=public.my_org_id();
 if org_id is null or public.my_role() not in ('owner','admin','secretary') then raise exception 'No tienes permiso para crear órdenes'; end if;
 if nullif(trim(p_customer_name),'') is null or nullif(trim(p_customer_phone),'') is null or nullif(trim(p_address),'') is null or nullif(trim(p_description),'') is null then raise exception 'Completa nombre, celular, dirección y descripción'; end if;
 insert into public.customers(organization_id,name,phone) values(org_id,trim(p_customer_name),trim(p_customer_phone))
 returning id into cust_id;
 insert into public.customer_addresses(customer_id,address) values(cust_id,trim(p_address)) returning id into addr_id;
 insert into public.service_orders(organization_id,customer_id,address_id,equipment_type,description,scheduled_at,quoted_amount,created_by)
 values(org_id,cust_id,addr_id,trim(p_equipment_type),trim(p_description),p_scheduled_at,greatest(coalesce(p_quoted_amount,0),0),auth.uid())
 returning id into order_id;
 select p.id into tech_id from public.profiles p
 where p.organization_id=org_id and p.role='technician'
 order by (select count(*) from public.service_assignments a join public.service_orders so on so.id=a.service_order_id where a.technician_id=p.id and so.status not in ('completed','paid','cancelled')),p.created_at
 limit 1;
 if tech_id is not null then
  insert into public.service_assignments(service_order_id,technician_id,assigned_by) values(order_id,tech_id,auth.uid());
  update public.service_orders set status='assigned' where id=order_id;
 end if;
 insert into public.service_status_events(service_order_id,actor_id,new_status,note)
 values(order_id,auth.uid(),case when tech_id is null then 'pending_assignment' else 'assigned' end,'Orden creada');
 return order_id;
end $$;

create or replace function public.update_order_status(p_order_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public
as $$
declare old_value text; org_id uuid; allowed text[]:=array['pending_assignment','assigned','accepted','on_the_way','in_progress','completed','paid','cancelled'];
begin
 if p_status<>all(allowed) then raise exception 'Estado no válido'; end if;
 select organization_id,status into org_id,old_value from public.service_orders where id=p_order_id for update;
 if org_id is null or org_id<>public.my_org_id() then raise exception 'Orden no encontrada'; end if;
 if public.my_role() not in ('owner','admin','secretary') and not exists(select 1 from public.service_assignments where service_order_id=p_order_id and technician_id=auth.uid()) then raise exception 'No tienes permiso sobre esta orden'; end if;
 update public.service_orders set status=p_status,updated_at=now() where id=p_order_id;
 insert into public.service_status_events(service_order_id,actor_id,old_status,new_status) values(p_order_id,auth.uid(),old_value,p_status);
end $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.service_orders enable row level security;
alter table public.service_assignments enable row level security;
alter table public.service_status_events enable row level security;
alter table public.staff_invites enable row level security;

drop policy if exists org_read_member on public.organizations;
create policy org_read_member on public.organizations for select using(id=public.my_org_id());
drop policy if exists profile_read_org on public.profiles;
create policy profile_read_org on public.profiles for select using(organization_id=public.my_org_id() and (public.my_role() in ('owner','admin','secretary') or id=auth.uid()));
drop policy if exists customer_read_org on public.customers;
create policy customer_read_org on public.customers for select using(organization_id=public.my_org_id());
drop policy if exists address_read_org on public.customer_addresses;
create policy address_read_org on public.customer_addresses for select using(exists(select 1 from public.customers c where c.id=customer_id and c.organization_id=public.my_org_id()));
drop policy if exists orders_read_org on public.service_orders;
create policy orders_read_org on public.service_orders for select using(organization_id=public.my_org_id() and (public.my_role() in ('owner','admin','secretary') or exists(select 1 from public.service_assignments a where a.service_order_id=id and a.technician_id=auth.uid())));
drop policy if exists assignments_read_org on public.service_assignments;
create policy assignments_read_org on public.service_assignments for select using(exists(select 1 from public.service_orders o where o.id=service_order_id and o.organization_id=public.my_org_id()));
drop policy if exists events_read_org on public.service_status_events;
create policy events_read_org on public.service_status_events for select using(exists(select 1 from public.service_orders o where o.id=service_order_id and o.organization_id=public.my_org_id()));

grant execute on function public.bootstrap_owner(text) to authenticated;
grant execute on function public.create_staff_invite(text) to authenticated;
grant execute on function public.redeem_staff_invite(text) to authenticated;
grant execute on function public.create_service_order(text,text,text,text,text,timestamptz,numeric) to authenticated;
grant execute on function public.update_order_status(uuid,text) to authenticated;
grant select on public.organizations,public.profiles,public.customers,public.customer_addresses,public.service_orders,public.service_assignments,public.service_status_events to authenticated;
