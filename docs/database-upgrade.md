# Online database installation and reset

The repository intentionally contains only two SQL files.

## Install or upgrade the central Supabase database

Run `supabase/schema.sql` in **Supabase Dashboard → SQL Editor → New Query**.
It is the single canonical, re-runnable online schema. It creates and repairs
all tables, constraints, indexes, functions, triggers, grants and row-level
security policies used by Retail. Do not look for or run historical migrations;
they have been consolidated into this file and removed.

Supabase selects the PostgreSQL database when you open a project, so neither
file asks for or hard-codes a database name. Open the intended project first;
do not add `CREATE DATABASE` or a local/desktop database name.

## Reset business data

Back up the database, then run `supabase/reset.sql` as the database owner.
The reset keeps authentication, staff access, branches, terminals, payment
methods and settings. It temporarily disables RLS inside one transaction,
clears trading and catalogue data, restores RLS, and verifies the final state.
If any step fails, PostgreSQL rolls back the entire transaction, including the
RLS changes.
