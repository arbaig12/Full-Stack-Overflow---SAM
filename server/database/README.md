# Database Setup Instructions

## 🎯 New: Database Migration System

**We now use a migration system instead of sharing dump files!**

See **[migrations/README.md](migrations/README.md)** for full documentation.

### Quick Start

1. **Restore base database** (one-time setup):
   ```bash
   pg_restore -d sam -U sam_user SAMFinalDB.sql
   ```

2. **Run migrations:**
   ```bash
   cd server
   npm run migrate
   ```

3. **When you pull new changes:**
   ```bash
   npm run migrate  # Automatically applies only new migrations
   ```

### Migration Commands

- `npm run migrate` - Apply pending migrations
- `npm run migrate:status` - Check migration status

---

## Legacy Setup (Deprecated)

The following methods are deprecated in favor of the migration system above.

### Initial Database Setup

1. Restore the main database from `SAMFinalDB.sql`:
   
   **Note:** If `SAMFinalDB.sql` is a PostgreSQL custom-format dump (binary), use:
   ```bash
   pg_restore -d sam -U sam_user SAMFinalDB.sql
   ```
   
   If it's a plain SQL text file, use:
   ```bash
   psql -d sam -U sam_user -f SAMFinalDB.sql
   ```
   
   If you get a password prompt, enter: `sam`

### Add Registration System Tables (Legacy)

**Note:** This is now handled by migration `002_registration_tables.sql`. Use `npm run migrate` instead.

<details>
<summary>Legacy methods (click to expand)</summary>

### Option 1: Using npm script

From the `server/` directory:
```bash
cd server
npm run setup:registration-tables
```

### Option 2: Using psql directly

```bash
psql -d sam -U sam_user -f server/database/add_missing_registration_tables.sql
```

</details>

## Database Tables

The registration system includes these tables:

1. **registration_holds** - Stores registration holds (academic advising, financial, etc.)
2. **time_conflict_waivers** - Time conflict waiver requests and approvals
3. **prerequisite_waivers** - Prerequisite waiver grants
4. **department_permissions** - Department permission grants
5. **registration_schedules** - Registration window definitions by class standing
6. **capacity_overrides** - Registrar capacity overrides for full classes

For creating new database changes, see the [migrations documentation](migrations/README.md).

