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
*   **`dotenv`:** To load environment variables from a `.env` file.
*   **`morgan`:** HTTP request logger middleware for Node.js.

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

2.  **Install Frontend Dependencies:**
    ```bash
    npm install
    ```

3.  **Install Backend Dependencies:**
    ```bash
    cd server
    npm install
    cd ..
    ```

### Environment Variables

Create `.env` files in both the root directory (for the frontend) and the `server/` directory (for the backend).

**Root `.env` (Frontend):**
```
REACT_APP_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
# Add any other frontend-specific environment variables here
```

**`server/.env` (Backend):**
```
PORT=4000
DATABASE_URL=postgresql://user:password@host:port/database_name
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
SESSION_SECRET=YOUR_SESSION_SECRET
# Add any other backend-specific environment variables here
```
*   Replace `YOUR_GOOGLE_CLIENT_ID`, `YOUR_GOOGLE_CLIENT_SECRET`, `YOUR_SESSION_SECRET`, and `DATABASE_URL` with your actual values.
*   For `DATABASE_URL`, ensure it points to your PostgreSQL instance.

### Database Setup

SAM uses PostgreSQL as its database. The schema is managed through SQL migration files located in `server/migrations/`.

1.  **Create a PostgreSQL database:**
    ```sql
    CREATE DATABASE sam_db;
    ```
    *   Replace `sam_db` with your desired database name.

2.  **Apply Database Migrations:**
    The database schema is defined by a series of ordered SQL migration files. These migrations ensure that your database structure matches the application's requirements, including tables, sequences, primary keys, unique constraints, foreign keys, indexes, triggers, and access control.

    To apply all migrations from scratch, navigate to your project's root directory in your terminal and run the following commands. Replace `sam_user` with your PostgreSQL username and `your_database_name` with the name of the database you created (e.g., `sam_db`).

    ```bash
    # Ensure your PostgreSQL server is running.
    # If you are starting from scratch, you might want to create a new, empty database first:
    # createdb -U sam_user your_database_name

    psql -U sam_user -d your_database_name -f server/migrations/001_create_types.sql
    psql -U sam_user -d your_database_name -f server/migrations/002_create_tables.sql
    psql -U sam_user -d your_database_name -f server/migrations/003_create_sequences.sql
    psql -U sam_user -d your_database_name -f server/migrations/004_set_default_values.sql
    psql -U sam_user -d your_database_name -f server/migrations/005_add_primary_keys.sql
    psql -U sam_user -d your_database_name -f server/migrations/006_add_unique_constraints.sql
    psql -U sam_user -d your_database_name -f server/migrations/007_add_foreign_keys.sql
    psql -U sam_user -d your_database_name -f server/migrations/008_add_indexes_triggers.sql
    psql -U sam_user -d your_database_name -f server/migrations/009_add_acl_privileges.sql
    ```

3.  **Verify the new schema:** After running all commands, you can verify that the tables have been created by running:
    ```bash
    psql -U sam_user -d your_database_name -c "\dt"
    ```

### Running the Application

1.  **Start the Backend Server:**
    ```bash
    cd server
    npm run dev # For development with nodemon
    # or
    # npm start # For production
    cd ..
    ```

2.  **Start the Frontend Development Server:**
    ```bash
    npm start
    ```

The frontend application should now be running at `http://localhost:3000` (or another port if 3000 is in use), and the backend API will be available at `http://localhost:4000`.

## Project Structure

*   **`/` (Root):** Contains the React frontend application.
*   **`server/`:** Contains the Node.js/Express backend application.
    *   **`server/concepts/`:** Modularized backend code, organized by core concepts. Each concept directory typically contains its `Model`, `Routes`, and potentially `Controller` logic.
        *   `academicCalendar/`
        *   `academicPlan/` (New: Manages student academic plans)
        *   `academicProgram/`
        *   `auditLog/` (New: Records system actions and changes)
        *   `courseCatalog/`
        *   `degreeRequirement/`
        *   `registrationHold/` (Updated: Manages student registration holds)
        *   `studentProfile/`
        *   `user/`
        *   `waitlist/` (New: Manages class waitlists)
        *   `waiver/` (Updated: Manages academic waivers)
    *   **`server/migrations/`:** (New: Contains ordered SQL files for database schema management.)
    *   **`server/routes/`:** Centralized routing for the backend.
    *   **`server/services/`:** Contains utility services like `catalogScraper.js`.
    *   **`server/tests/`:** Backend unit and integration tests.
*   **`public/`:** Static assets for the frontend.
*   **`src/`:** Frontend source code.
    *   **`src/auth/`:** Authentication-related components and context.
    *   **`src/layout/`:** Layout components.
    *   **`src/pages/`:** React components for different application pages.
    *   **`src/utils/`:** Utility functions (e.g., `dateWrapper.js`).
*   **`project_requirements/`:** Contains sample YAML files for importing data (e.g., `users1.yaml`, `academic_calendar_Fall2025.yaml`).

## Testing

### Frontend Tests

To run frontend tests (using Jest):
```bash
npm test
```

### Backend Tests

To run backend tests (using Vitest):
```bash
cd server
npm test
# or for watch mode
# npm run test:watch
# For coverage report
# npm run coverage
cd ..
```
*   **New Test Files:** `waitlist.test.js`, `academicPlan.test.js`, `auditLog.test.js` have been added to `server/tests/` to cover the new functionalities.

## Contributing

Contributions are welcome! Please refer to the `CONTRIBUTING.md` (if available) for guidelines.

## License

This project is licensed under the [MIT License](LICENSE.md). (Placeholder - replace with actual license if different).

## Support

For any questions or issues, please contact the development team.