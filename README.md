# Eve Choice API

The backend service for Eve Choice. It provides property discovery, authentication, listing management, saved listings, inquiries, viewing requests, and staff moderation for the Yangon and Mandalay marketplace.

## What is included

- Express REST API under `/api/v1`.
- Prisma 7 data model with SQLite development storage.
- Seeded users, roles, locations, categories, amenities, listings, leads, notifications, reports, and audit records.
- OpenAPI contract in [`openapi.yaml`](openapi.yaml).
- JWT authentication and role-aware moderation routes.

## Run locally

```bash
npm install
copy .env.example .env
npm run db:generate
npm run db:bootstrap
npm run db:seed
npm run dev
```

The API runs at `http://localhost:4000`. Check `GET /api/v1/health` to verify it is running.

`db:bootstrap` is the verified local setup command for this Windows workspace. It initializes the SQLite file from the Prisma schema. `db:push` is also available for environments where Prisma’s schema engine runs normally.

Development demo accounts all use the password `demo1234`:

- `demo@fairwayproperty.com` — buyer/renter + owner
- `agent@fairwayproperty.com` — buyer/renter + agent
- `staff@fairwayproperty.com` — staff + admin

These credentials are development-only.

