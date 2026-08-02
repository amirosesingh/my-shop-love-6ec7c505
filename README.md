# Northwind POS

A self-hosted, multi-store point-of-sale system built with TanStack Start, React, and Tailwind CSS. It runs on Node.js and connects to Supabase for the backend.

## Features

- Register, sales, exchanges, refunds and split payments
- Open/close shifts and cash drawer controls
- Inventory management, stock adjustments, transfers, and receiving
- Central membership system with tiered discounts
- Promotions, coupons, taxes and receipt customization
- Purchase order engine and supplier management
- Real-time dashboard and reports
- Staff authentication with permission matrix
- Receipt printing, QR code generation and customer display
- Offline-first Windows desktop client (Electron + MSSQL)

## Development

You need Node.js 22+ and npm.

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
npm run dev
```

The dev server will run on `http://localhost:8080` by default.

## Environment variables

Copy `.env.example` to `.env` and fill in your Supabase project details.

```sh
cp .env.example .env
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (server side) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (server side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server side only) |
| `VITE_SUPABASE_URL` | Supabase project URL (client side) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (client side) |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID (client side) |

Keep `SUPABASE_SERVICE_ROLE_KEY` secret and never expose it to the browser.

## Self-hosting

This project is configured to build a standalone Node.js server with Nitro.

### Build

```sh
npm install
npm run build
```

The build output is placed in `dist/`.

### Run locally

```sh
npm start
```

The server listens on port `3000` by default. Override it with `NITRO_PORT`:

```sh
NITRO_PORT=8080 npm start
```

### Docker

A `Dockerfile` and `docker-compose.yml` are included.

```sh
# Build and run with docker-compose
docker-compose up --build
```

For production, create a `.env` file next to `docker-compose.yml` with the required variables. `docker-compose.yml` reads them automatically.

### Manual Docker build

```sh
docker build -t northwind-pos .
docker run -p 3000:3000 --env-file .env northwind-pos
```

### Deploying to any Node.js host

1. Build the project (`npm run build`).
2. Copy `dist/` to the server.
3. Set the environment variables.
4. Run `node dist/server/index.mjs`.

The app is now fully independent of Lovable hosting and branding.

## Backend

The app uses Supabase for authentication, database, and storage. You can keep your existing Supabase project or migrate to a self-hosted Postgres instance later.

## Windows desktop client

See `docs/windows-desktop.md` for the Electron + MSSQL offline-first build instructions.

## Built with

- TanStack Start
- React 19
- TypeScript
- Tailwind CSS v4
- Nitro
- Supabase
