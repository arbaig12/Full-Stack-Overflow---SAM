# Database Migrations

This directory contains database migration files that manage schema changes over time. Instead of sharing large database dump files, team members can run migrations to keep their databases in sync.

## Quick Start

### First Time Setup

1. **Restore the base database schema:**
   ```bash
   pg_restore -d sam -U sam_user SAMFinalDB.sql
   ```
   Or if it's a plain SQL file:
   ```bash
   psql -d sam -U sam_user -f SAMFinalDB.sql
   ```

2. **Run migrations:**
   ```bash
   cd server
   npm run migrate
   ```

### Daily Workflow

When you pull changes from git that include new migrations:

```bash
cd server
npm run migrate
```

This will automatically apply only the new migrations that haven't been run yet.

## Commands

### Run Pending Migrations

```bash
npm run migrate
```

Applies all pending migrations in order. Safe to run multiple times - it only runs migrations that haven't been applied yet.

### Check Migration Status

```bash
npm run migrate:status
```

Shows which migrations have been applied and which are pending.

## Creating New Migrations

### Step 1: Create Migration File

Create a new file in this directory with the naming pattern:

```
XXX_description.sql
```

Where:
- `XXX` is a 3-digit number (001, 002, 003, etc.)
- `description` is a short description in snake_case

**Important:** Use the next available number. Check existing migrations to see what the highest number is.

Example: `003_add_audit_log_indexes.sql`

### Step 2: Write the SQL

Write your SQL changes in the file. You can include:
- `CREATE TABLE` statements
- `ALTER TABLE` statements
- `CREATE INDEX` statements
- `INSERT` statements for seed data
- Any other SQL commands

**Best Practices:**
- Use `IF NOT EXISTS` for tables/indexes to make migrations idempotent
- Include comments explaining what the migration does
- Test your migration on a copy of the database first

### Step 3: Test Locally

```bash
npm run migrate
```

Verify the migration runs successfully.

### Step 4: Commit to Git

```bash
git add server/database/migrations/XXX_description.sql
git commit -m "Add migration: description"
git push
```

## Migration File Structure

Each migration file should be a valid SQL file. Example:

```sql
-- ============================================
-- Migration 003: Add Audit Log Indexes
-- ============================================
-- 
-- Adds indexes to improve query performance on audit_log_entries table.

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id 
    ON audit_log_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp 
    ON audit_log_entries(created_at);
```

## How It Works

1. **Migration Tracking:** The `schema_migrations` table tracks which migrations have been applied.

2. **Automatic Detection:** The migration runner:
   - Scans this directory for `.sql` files matching the pattern `XXX_*.sql`
   - Sorts them by number
   - Compares with `schema_migrations` table
   - Runs only pending migrations

3. **Transaction Safety:** Each migration runs in a transaction, so if it fails, the database is rolled back to its previous state.

## Troubleshooting

### Migration Already Applied Error

If you get an error that a migration was already applied, check:

```bash
npm run migrate:status
```

If the migration shows as applied but you want to re-run it, you can manually remove it from `schema_migrations`:

```sql
DELETE FROM schema_migrations WHERE migration_name = 'XXX_description.sql';
```

**Warning:** Only do this if you're sure the migration changes haven't been applied yet.

### Migration Fails

If a migration fails:
1. Check the error message
2. Fix the SQL in the migration file
3. The migration won't be marked as applied, so you can fix and re-run

### Database Out of Sync

If your database is out of sync with migrations:

1. Check what migrations you have:
   ```bash
   npm run migrate:status
   ```

2. If you're missing migrations, run:
   ```bash
   npm run migrate
   ```

3. If you have extra migrations applied that others don't, you may need to restore from a fresh dump and re-run migrations.

## Migration Naming Guidelines

- Use descriptive names: `003_add_user_preferences_table.sql` not `003_stuff.sql`
- Use snake_case for descriptions
- Keep descriptions concise but clear
- Include the migration number in the filename

## Examples

### Adding a New Table

```sql
-- Migration 003: Add User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
    preference_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    preference_key VARCHAR(100) NOT NULL,
    preference_value TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, preference_key)
);
```

### Adding an Index

```sql
-- Migration 004: Add Index to Enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_student_term 
    ON enrollments(student_id, term_id);
```

### Modifying a Table

```sql
-- Migration 005: Add Status Column to Courses
ALTER TABLE courses 
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
```

## Important Notes

- **Never edit existing migration files** after they've been committed and shared
- **Always test migrations** on a copy of the database first
- **Use IF NOT EXISTS** to make migrations safe to re-run
- **Document complex migrations** with comments
- **One logical change per migration** - don't combine unrelated changes

## Questions?

If you have questions about migrations, ask the team or check the main project README.

