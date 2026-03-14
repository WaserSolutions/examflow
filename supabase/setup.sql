-- Payments table
create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  email text not null,
  mollie_payment_id text unique not null,
  amount numeric not null default 19.00,
  currency text not null default 'CHF',
  status text not null default 'paid',
  created_at timestamptz default now()
);

alter table payments enable row level security;

create policy "Users can view own payments" on payments
  for select using (auth.uid() = user_id);

-- Sessions table (single-session enforcement)
create table if not exists sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) unique,
  session_token text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sessions enable row level security;

create policy "Users can view own session" on sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own session" on sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own session" on sessions
  for update using (auth.uid() = user_id);
