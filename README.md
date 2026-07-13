# toratrain-backend

Backend API for text hierarchy, gamification, authentication, and assignment routes.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables:
   - `DATABASE_URL=postgres://...`
   - `JWT_SECRET=...`
   - `JWT_EXPIRES_IN=1h` (optional)
   - `PORT=3000` (optional)
3. Create database schema:
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```
4. Run server:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run lint`
- `npm run build`
- `npm test`
- `npm run dev`

## API docs

Run the server and open `/api/docs`.
