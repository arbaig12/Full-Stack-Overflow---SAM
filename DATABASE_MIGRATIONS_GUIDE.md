# Database Migration System - Quick Guide

## 🎉 No More Sharing Dump Files!

We've implemented a database migration system. Instead of sharing large `SAMFinalDB.sql` files, we now use version-controlled migration files.

## For Everyone: Daily Workflow

### When you pull changes from git:

```bash
cd server
npm run migrate
```

That's it! The system automatically applies only the new migrations you don't have yet.

### Check what migrations you have:

```bash
npm run migrate:status
```

## For Developers: Creating New Migrations

### Step 1: Create the migration file

Create a file in `server/database/migrations/` named:
```
XXX_description.sql
```

Where `XXX` is the next available number (check existing files to see the highest number).

Example: `003_add_user_preferences.sql`

### Step 2: Write your SQL

Copy from `TEMPLATE.sql` and write your changes:

```sql
-- Migration 003: Add User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    preference_key VARCHAR(100),
    preference_value TEXT
);
```

### Step 3: Test and commit

```bash
# Test it works
npm run migrate

# Commit to git
git add server/database/migrations/003_add_user_preferences.sql
git commit -m "Add migration: user preferences table"
git push
```

## First Time Setup (New Team Members)

1. **Restore base database:**
   ```bash
   pg_restore -d sam -U sam_user SAMFinalDB.sql
   ```

2. **Run all migrations:**
   ```bash
   cd server
   npm run migrate
   ```

## Benefits

✅ **No more large dump files** - migrations are small SQL files  
✅ **Version controlled** - all changes tracked in git  
✅ **Automatic** - only runs new migrations  
✅ **Safe** - each migration runs in a transaction  
✅ **Fast** - team members sync in seconds, not minutes  

## Full Documentation

See `server/database/migrations/README.md` for complete documentation.

## Questions?

Ask the team or check the migration README!

