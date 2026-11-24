import { db } from "./db.js";

let schemaReady;

export async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const sql = db();
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(36020261123)`;

      await tx`
        create table if not exists organizations (
          id uuid primary key default gen_random_uuid(),
          name text not null,
          created_at timestamptz not null default now()
        )
      `;

      await tx`
        create table if not exists users (
          id uuid primary key default gen_random_uuid(),
          organization_id uuid not null references organizations(id) on delete cascade,
          username text not null unique,
          password_hash text not null,
          full_name text not null,
          role text not null check (role in ('owner','admin','technician','customer')),
          active boolean not null default true,
          created_at timestamptz not null default now()
        )
      `;

      await tx`
        create unique index if not exists one_owner_per_organization
        on users(organization_id) where role = 'owner'
      `;

      await tx`
        create table if not exists service_orders (
          id uuid primary key default gen_random_uuid(),
          organization_id uuid not null references organizations(id) on delete cascade,
          customer_name text not null,
          phone text not null,
          address text not null,
          equipment text not null,
          service_type text not null default 'Reparación',
          description text not null,
          scheduled_at timestamptz,
          quoted_amount numeric(14,2) not null default 0,
          status text not null default 'Pendiente',
          created_by uuid references users(id),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;

      await tx`
        create table if not exists order_history (
          id bigserial primary key,
          order_id uuid not null references service_orders(id) on delete cascade,
          changed_by uuid references users(id),
          status text not null,
          event_type text not null default 'status',
          details jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        )
      `;

      await tx`
        alter table service_orders
        add column if not exists tracking_token_hash text
      `;

      await tx`
        alter table service_orders
        add column if not exists service_type text not null default 'Reparación'
      `;

      await tx`
        alter table service_orders
        add column if not exists assigned_to uuid references users(id) on delete set null
      `;

      await tx`
        alter table service_orders
        add column if not exists assigned_at timestamptz
      `;

      await tx`
        alter table order_history
        add column if not exists event_type text not null default 'status'
      `;

      await tx`
        alter table order_history
        add column if not exists details jsonb not null default '{}'::jsonb
      `;

      await tx`
        create index if not exists orders_assigned_to
        on service_orders(assigned_to, status)
      `;

      await tx`
        create index if not exists orders_org_created
        on service_orders(organization_id, created_at desc)
      `;
    });
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}
