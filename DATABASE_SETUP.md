# Database Setup Guide

This guide will help you set up the database when cloning the repository for the first time.

## Prerequisites

- **PostgreSQL 17** installed and running locally
- **Node.js ≥ 18** and **npm ≥ 9**

## Step-by-Step Setup

### 1. Create Database and User

First, connect to PostgreSQL as a superuser and create the database and user:

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# In the PostgreSQL prompt, run:
CREATE DATABASE sam;
CREATE USER sam_user WITH PASSWORD 'sam';
GRANT ALL PRIVILEGES ON DATABASE sam TO sam_user;
\q
```

### 2. Restore Base Database

From the project root directory, restore the base database from `SAMFinalDB.sql`:

**If `SAMFinalDB.sql` is a PostgreSQL custom-format dump (binary):**
```bash
pg_restore -d sam -U sam_user SAMFinalDB.sql
```

**If `SAMFinalDB.sql` is a plain SQL text file:**
```bash
psql -d sam -U sam_user -f SAMFinalDB.sql
```

If prompted for a password, enter: `sam`

### 3. Run Database Migrations

After restoring the base database, run all migrations to apply any schema changes:

```bash
cd server
npm run migrate
```

This will automatically apply all pending migrations in order. The migration system tracks which migrations have been applied, so it's safe to run multiple times.

### 4. Configure Environment Variables

Create a `.env` file in the `server/` directory:

```bash
cd server
touch .env
```

Add the following content to `server/.env`:

```env
# Local Postgres connection string
DATABASE_URL=postgresql://sam_user:sam@localhost:5432/sam

# Express
PORT=4000
NODE_ENV=development

# If you connect to a cloud Postgres that requires TLS:
# PGSSL=1
```

### 5. Verify Setup

Check that everything is working:

```bash
# Check migration status
cd server
npm run migrate:status

# Start the server to test database connection
npm run dev
```

You should see:
```
[dotenv] injecting env (...) from .env
[Server] SAM backend running on port 4000 (development)
```

You can also verify the API is working:
- Health check: http://localhost:4000/api/health
- DB check: http://localhost:4000/api/db-check

## Daily Workflow

When you pull changes from git that include new database migrations:

```bash
cd server
npm run migrate
```

This will automatically apply only the new migrations that haven't been run yet.

## Troubleshooting

### Migration Already Applied Error

If you get an error that a migration was already applied:

```bash
npm run migrate:status
```

This shows which migrations have been applied and which are pending.

### Database Connection Issues

1. Make sure PostgreSQL is running:
   ```bash
   # On macOS
   brew services list
   
   # On Linux
   sudo systemctl status postgresql
   ```

2. Verify your `.env` file has the correct `DATABASE_URL`

3. Test the connection manually:
   ```bash
   psql -d sam -U sam_user
   ```

### Migration Fails

If a migration fails:
1. Check the error message
2. The migration won't be marked as applied, so you can fix and re-run
3. Each migration runs in a transaction, so your database will be rolled back to its previous state

## Additional Resources

- **Migration System Documentation**: See `server/database/migrations/README.md` for detailed migration documentation
- **Database README**: See `server/database/README.md` for more database setup information
- **Installation Manual**: See `plan/installation_manual.txt` for full project setup instructions

## Quick Reference

**Database Details:**
- Database Name: `sam`
- Database User: `sam_user`
- Password: `sam`
- Port: `5432` (default PostgreSQL port)

**Useful Commands:**
```bash
# Run migrations
cd server && npm run migrate

# Check migration status
cd server && npm run migrate:status

# Connect to database
psql -d sam -U sam_user
```

