# Serve Sweetly Engine Setup

## 1. Copy environment variables

1. Copy `.env.example` to `.env`.
2. Update `DATABASE_URL` with your Postgres connection string.
3. Set `JWT_SECRET` to a secure random value.
4. If using Supabase, set `SUPABASE_ANON_KEY`.

## 2. Install dependencies

```bash
npm install
```

## 3. Run database migrations

```bash
npm run migrate
```

## 4. Seed initial data

```bash
npm run seed:tables
npm run seed:menu
```

## 5. Start the app locally

```bash
npm run dev
```

## Quick setup command

```bash
npm run setup
```

This file documents the create/configuration flow for the project.