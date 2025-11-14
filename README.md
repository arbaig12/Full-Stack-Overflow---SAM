# SBU Academics Management (SAM)

## Overview

The SBU Academics Management (SAM) system is designed to streamline the academic lifecycle for students and staff at Stony Brook University. It provides functionalities for course planning, registration, degree requirement tracking, and administrative tasks, ensuring adherence to university policies. The system is built with a "concept-first" approach, emphasizing clear, independent, and user-facing concepts as the foundation of its design, as inspired by "The Essence of Software."

## Features

SAM aims to provide the following core functionalities:

*   **User Management:** Supports four roles (Student, Instructor, Academic Advisor, Registrar) with distinct permissions. Allows registrars to import, search, and export user data.
*   **Course Catalog & Class Schedule:** Provides searchable course catalogs and class schedules. Registrars can scrape course information from the SBU website and import class schedules from PDF files.
*   **Degree Requirements:** Manages degree requirements for majors and minors, including admission requirements for restricted programs.
*   **Student Profiles:** Displays comprehensive student profiles including GPA, credits, class schedules, degree requirement status, and an audit log of changes.
*   **Registration & Withdrawal:** Enables students to register for, drop, or withdraw from classes, with enforcement of prerequisites, corequisites, anti-requisites, and time conflicts.
*   **Registration Holds:** Supports academic and financial holds that block student registration until resolved. Functionality includes placing, removing, and resolving holds.
*   **Waitlists:** Automated waitlist management for full classes, ensuring fair, first-in-first-out enrollment. Students can be added to and removed from waitlists, and the system can identify the next student for promotion.
*   **Academic Planning:** Allows students to create, manage, and validate academic plans for future semesters, including adding/removing courses and setting preferences. Features an auto-planner to assist in meeting graduation requirements.
*   **Audit Log:** Tracks all significant actions and changes within the system, providing a comprehensive audit trail for security and accountability.
*   **Rosters & Grading:** Instructors can view class rosters and submit grades.
*   **Authentication:** Secure user authentication via Google OAuth.

## Technologies Used

SAM is a full-stack application utilizing the following technologies:

**Frontend:**
*   **React:** A JavaScript library for building user interfaces.
*   **React Router:** For declarative routing in React applications.
*   **Axios:** Promise-based HTTP client for making API requests.
*   **Google OAuth:** For secure user authentication.

**Backend:**
*   **Node.js:** JavaScript runtime environment.
*   **Express.js:** A fast, unopinionated, minimalist web framework for Node.js.
*   **PostgreSQL:** A powerful, open-source relational database system.
*   **`js-yaml`:** For parsing YAML configuration files.
*   **`multer`:** Middleware for handling `multipart/form-data`, primarily used for file uploads.
*   **`puppeteer` / `puppeteer-extra`:** Headless Chrome Node.js API, likely used for web scraping course catalog data.
*   **`cors`:** Middleware to enable Cross-Origin Resource Sharing.
*   **`dotenv`:** To load environment variables from a `.env` file, enhancing configuration management.
*   **`morgan`:** An HTTP request logger middleware for Node.js, used for development logging.

**Testing:**
*   **Jest:** JavaScript testing framework (for frontend).
*   **Vitest:** A blazing fast unit-test framework powered by Vite (for backend).
*   **Supertest:** A library for testing HTTP servers (for backend API testing).

## Getting Started

Follow these instructions to set up and run the SAM project locally.

### Prerequisites

*   **Node.js:** Version 18 or higher.
*   **npm (Node Package Manager):** Comes with Node.js.
*   **PostgreSQL:** A running PostgreSQL instance.
*   **Git:** For cloning the repository.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Full-Stack-Overflow/SAM.git
    cd SAM
    ```

2.  **Install frontend dependencies:**
    ```bash
    npm install
    ```

3.  **Install backend dependencies:**
    ```bash
    cd server
    npm install
    cd ..
    ```

### Environment Variables

Create `.env` files in both the root directory (for the frontend) and the `server/` directory (for the backend).

**Root `.env` (Frontend):**
```env
REACT_APP_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
# Add any other frontend-specific environment variables here
```
*   Obtain `YOUR_GOOGLE_CLIENT_ID` from the Google Cloud Console for your OAuth 2.0 client.

**`server/.env` (Backend):**
```env
PORT=4000
DATABASE_URL=postgresql://sam_user:sam@localhost:5432/sam
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
SESSION_SECRET=YOUR_SESSION_SECRET
# Add any other backend-specific environment variables here
```
*   Replace `YOUR_GOOGLE_CLIENT_ID` and `YOUR_GOOGLE_CLIENT_SECRET` with values from your Google Cloud Console.
*   `YOUR_SESSION_SECRET` should be a long, random string for Express session management.

### Database Setup

SAM utilizes PostgreSQL as its primary data store. The database schema and initial seed data are provided via a custom-format dump file (`SAM.sql`).

**Note:** The following commands should be executed in your terminal. For SQL commands, you will connect to your PostgreSQL server as a superuser. **IMPORTANT: You MUST replace `your_superuser_name` with the actual superuser name for your PostgreSQL installation. Do NOT use `your_superuser_name` literally.**

Common superuser names include:
*   `postgres` (most common default)
*   Your system username (if PostgreSQL was installed to use system accounts)

Try connecting with `psql -U postgres`. If that fails, try `psql -U $(whoami)`. If both fail, you may need to consult your PostgreSQL installation documentation or your system administrator to determine the correct superuser name and connection method.

Here's the recommended workflow for a clean database setup:

1.  **Drop the existing `sam` database (if any):**
    First, connect to your PostgreSQL server as your superuser (e.g., `psql -U your_superuser_name -d postgres`). The `-d postgres` ensures you connect to a default database to perform administrative tasks.
    ```bash
    psql -U your_superuser_name -d postgres

    # Inside psql, execute:
    DROP DATABASE IF EXISTS sam;
    ```
    Then exit `psql` by typing `\q` and pressing Enter.

2.  **Drop and Create the database user (`sam_user`) and grant `CREATEDB` privilege:**
    Connect to your PostgreSQL server as your superuser again.
    ```bash
    psql -U your_superuser_name -d postgres

    # Inside psql, execute:
    DROP ROLE IF EXISTS sam_user;
    CREATE USER sam_user WITH PASSWORD 'sam';
    ALTER ROLE sam_user SET client_encoding TO 'utf8';
    ALTER ROLE sam_user SET default_transaction_isolation TO 'read committed';
    ALTER ROLE sam_user SET timezone TO 'UTC';
    ALTER USER sam_user WITH CREATEDB; # Grant privilege to create databases
    ```
    Then exit `psql` by typing `\q` and pressing Enter.

3.  **Create a clean `sam` database:**
    Use the `createdb` command in your terminal. This command creates an empty database named `sam` owned by `sam_user`.
    ```bash
    createdb -U sam_user sam
    ```

4.  **Restore the database from `SAM.sql`:**
    Use `pg_restore` (not `psql`) to restore the custom-format dump. Ensure the `SAM.sql` file is located in the project root directory.
    ```bash
    pg_restore -U sam_user -d sam --no-owner --role=sam_user SAM.sql
    ```
    *   **Note on macOS:** Warnings about `role "postgres" does not exist` during `pg_restore` are expected and harmless if your superuser is not `postgres` (e.g., your macOS username). The `--no-owner` and `--role=sam_user` flags handle ownership correctly.

5.  **Verify the restored schema:**
    Connect to the `sam` database as `sam_user` and list tables.
    ```bash
    psql -U sam_user -d sam -c "\dt"
    ```
    You should see a list of tables, confirming successful restoration.

6.  **(Optional but Recommended) Revoke `CREATEDB` privilege:**
    For security best practices, it's recommended to revoke the `CREATEDB` privilege from `sam_user` after the database has been created.
    Connect to your PostgreSQL server as your superuser.
    ```bash
    psql -U your_superuser_name -d postgres

    # Inside psql, execute:
    ALTER USER sam_user WITH NOCREATEDB;
    ```
    Then exit `psql` by typing `\q` and pressing Enter.

### Option B: Managing Schema Changes with SQL Migrations

This section outlines how to manage and apply incremental database schema changes using SQL migration files. This approach is typically used in the following scenarios:

*   **Schema Evolution:** When developing new features that require modifications to the existing database schema (e.g., adding new tables, columns, or indexes).
*   **Incremental Updates:** To apply schema changes to an existing database that has already been set up (e.g., a development, staging, or production environment).
*   **Alternative Initial Setup:** If the `SAM.sql` dump (Option A) is unavailable, outdated, or if you prefer to build the schema incrementally from scratch.

**Migration File Naming Convention:**
To prevent naming conflicts and ensure correct chronological ordering in a collaborative environment, all migration files in `server/migrations/` **must** be prefixed with a timestamp (e.g., `YYYYMMDDHHMMSS_description.sql`).

**How to Create a New Migration:**
When a new feature requires a schema change, create a new migration file using a timestamp prefix.
```bash
touch server/migrations/$(date +"%Y%m%d%H%M%S")_your_migration_name.sql
```
Then, add your SQL schema changes (e.g., `CREATE TABLE`, `ALTER TABLE`) to this new file. Ensure your migration is **idempotent** where possible (i.e., running it multiple times has the same effect as running it once) to prevent errors if applied repeatedly.

**How to Apply Migrations:**
The provided command will find all `.sql` files in the `server/migrations/` directory and apply them in chronological order based on their filenames.

**Important Considerations:**
*   **Idempotency:** Ideally, each migration file should be designed to be idempotent.
*   **Tracking Applied Migrations:** The current setup (using `find | sort | xargs psql`) does **not** inherently track which migrations have already been applied to a database. This means running the command will attempt to apply *all* migration files every time.
    *   **Development Workflow:** During active development, if you frequently make schema changes, you might drop and recreate your database (using Option A or a subset of these steps) to ensure a clean state before applying migrations.
    *   **Applying New Migrations:** If you are applying new migrations to an existing database that already has some migrations applied, you must manually ensure that your new migration files are designed to only apply changes that haven't been applied yet, or that they are idempotent. For more robust migration management in larger projects, consider using a dedicated database migration tool (e.g., Flyway, Liquibase, Knex.js migrations) which typically include built-in tracking mechanisms.

To apply all migrations from scratch or apply any new, unapplied migrations:
```bash
find server/migrations -name "*.sql" | sort | xargs -I {} psql -U sam_user -d sam -f "{}"
```

---

## 5. Running the Application

### Start the Backend

Navigate to the `server` directory and start the Node.js backend application.

```bash
cd server
npm run dev # For development with nodemon (auto-restarts on file changes)
# or
# npm start # For production
```
The backend API will be available at `http://localhost:4000`.

### Start the Frontend

Navigate back to the project root and start the React frontend development server.

```bash
cd ..
npm start
```
The frontend application should now be running at `http://localhost:3000` (or another port if 3000 is in use).

---

## 6. Project Structure

The project is organized into distinct frontend and backend components, with a clear separation of concerns.

*   **`/` (Project Root):** Contains the main React frontend application, configuration files, and shared assets.
    *   `public/`: Static assets for the frontend.
    *   `src/`: Frontend source code.
        *   `auth/`: Authentication-related components and context.
        *   `layout/`: Application layout components.
        *   `pages/`: React components for different application views.
        *   `utils/`: General utility functions.
*   **`server/`:** Houses the Node.js/Express backend application.
    *   `concepts/`: Modularized backend code, organized by core concepts (e.g., `academicCalendar/`, `academicPlan/`, `user/`). Each concept directory typically contains its `Model`, `Routes`, and potentially `Controller` logic.
    *   `migrations/`: Contains ordered SQL files for database schema management (used for alternative setup or schema evolution).
    *   `routes/`: Centralized routing definitions for the backend API.
    *   `services/`: Contains utility services like `catalogScraper.js`.
    *   `tests/`: Backend unit and integration tests.
*   **`project_requirements/`:** Contains sample YAML files for importing data (e.g., `users1.yaml`, `academic_calendar_Fall2025.yaml`).

---

## 7. Testing

### Frontend Tests

To execute frontend unit and integration tests using Jest:
```bash
npm test
```

### Backend Tests

To execute backend unit and integration tests using Vitest and Supertest:
```bash
cd server
npm test
# or for continuous testing in watch mode:
# npm run test:watch
# For a test coverage report:
# npm run coverage
cd ..
```
*   **New Test Files:** `waitlist.test.js`, `academicPlan.test.js`, `auditLog.test.js` have been added to `server/tests/` to cover new functionalities.

---

## 8. Contributing

Contributions to the SAM project are highly encouraged. Please adhere to standard GitHub workflows:
1.  Fork the repository.
2.  Create a new feature branch (`git checkout -b feature/YourFeatureName`).
3.  Implement your changes, ensuring they align with existing code style and conventions.
4.  Write comprehensive tests for new features or bug fixes.
5.  Ensure all existing tests pass.
6.  Commit your changes with clear, descriptive messages.
7.  Push your branch and submit a pull request with a detailed description of your changes and their impact.

---

## 9. License

This project is licensed under the [MIT License](LICENSE.md).

---

## 10. Support

For any questions, issues, or further assistance, please contact the development team.