-- BINTIN FA registration schema
create extension if not exists pgcrypto;

create table if not exists public.player_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_number text unique not null,
  created_at timestamptz not null default now(),
  full_name text not null,
  date_of_birth date not null,
  age integer not null check (age between 1 and 120),
  home_address text not null,
  phone_number text not null,
  guardian_name text,
  guardian_phone text,
  school_occupation text not null,
  preferred_position text not null,
  secondary_position text,
  preferred_foot text not null check (preferred_foot in ('Right','Left','Both')),
  previous_club text,
  competition_experience text,
  jersey_number_preference text,
  date_joined date,
  emergency_contact_name text not null,
  emergency_relationship text not null,
  emergency_contact_phone text not null,
  medical_notes text,
  commitment_agreed boolean not null default false check (commitment_agreed = true),
  player_declaration_name text not null,
  player_signature_typed text,
  player_declaration_date date not null,
  guardian_declaration_name text,
  guardian_signature_typed text,
  guardian_declaration_date date,
  team_category text check (team_category in ('Under 10','Under 12','Under 14','Under 16','Under 18','Senior Team')),
  registration_fee text,
  date_registered date not null default current_date,
  coach_name text,
  pdf_path text,
  updated_at timestamptz not null default now()
);

create index if not exists player_registrations_created_at_idx
  on public.player_registrations (created_at desc);
create index if not exists player_registrations_full_name_idx
  on public.player_registrations (lower(full_name));
create index if not exists player_registrations_registration_number_idx
  on public.player_registrations (registration_number);

alter table public.player_registrations enable row level security;
-- No public/authenticated table policies are intentionally created.
-- Only Netlify server functions using the service-role key may access rows.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registration-pdfs', 'registration-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

-- No storage policies are created: private files are accessed via server-generated signed URLs.
