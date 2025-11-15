g# SAM API Testing Guidelines

This document outlines best practices and industry standards for testing the SAM backend API. Effective API testing ensures the reliability, performance, and security of our services.

## 1. Core Principles of API Testing

*   **Automated First:** Prioritize automated tests for regression, functional, and integration testing.
*   **Clear Test Cases:** Each test should have a clear purpose, covering a specific scenario or requirement.
*   **Independent Tests:** Tests should be independent and not rely on the order of execution or the state left by previous tests.
*   **Data Setup & Teardown:** Manage test data effectively, ensuring a clean state before and after each test.
*   **Assertions:** Use robust assertions to validate responses (status codes, body content, headers).
*   **Environment Agnostic:** Design tests to run across different environments (development, staging, production) using configuration.

## 2. Recommended Tools

The SAM project utilizes `Vitest` for its testing framework and `Supertest` for making HTTP requests to the API.

*   **Vitest:** A fast unit test framework powered by Vite. It's configured in `server/package.json`.
*   **Supertest:** A library for testing HTTP servers, making it easy to send requests and assert responses.

### Running Automated Tests

To run all automated API tests, navigate to the `server` directory and use the following command:

```bash
npm test
```

For continuous testing during development:

```bash
npm run test:watch
```

To generate a coverage report:

```bash
npm run coverage
```

## 3. Writing Automated API Tests (Vitest & Supertest)

All automated API tests should reside in the `server/tests` directory. Follow existing conventions for file naming (e.g., `userRoutes.test.js`).

Here's a template for a basic API test:

```javascript
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../index.js'; // Assuming your Express app is exported from index.js

describe('User API Endpoints', () => {
  let server;

  beforeAll(async () => {
    // Start the server before all tests
    server = app.listen(4001); // Use a different port for testing if needed
    // Perform any necessary database setup here
  });

  afterAll(async () => {
    // Close the server after all tests
    await server.close();
    // Perform any necessary database teardown here
  });

  it('GET /api/users/registrars should return all registrars', async () => {
    const response = await request(server).get('/api/users/registrars');
    expect(response.statusCode).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    // Add more specific assertions about the data structure or content
    expect(response.body[0]).toHaveProperty('role', 'Registrar');
  });

  it('POST /api/import/users should import user data', async () => {
    // Example of testing a file upload
    const response = await request(server)
      .post('/api/import/users')
      .attach('file', './project_requirements/users1.yaml'); // Path to a test YAML file

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('message', 'Users imported successfully');
    // Add assertions to verify the data was actually imported (e.g., by fetching it)
  });

  // Add more test cases for search, get by ID, export, etc.
});
```

### Best Practices for Automated Tests:

*   **Mocking:** Use `vitest`'s mocking capabilities for external dependencies (e.g., database calls, external APIs) to ensure tests are fast and isolated.
*   **Authentication:** Implement helper functions to handle authentication (e.g., logging in a test user, obtaining a token) for protected routes.
*   **Test Data:** Create dedicated test data files or use factories/fixtures to generate realistic data for tests. Avoid relying on existing database data.
*   **Error Handling:** Explicitly test error scenarios (e.g., invalid input, unauthorized access, server errors).

## 4. Manual Testing / Quick Checks (cURL)

While automated tests are preferred, `cURL` commands remain useful for quick, ad-hoc manual testing, debugging, or verifying specific endpoint behaviors directly from the command line.

Before running these commands, ensure your backend server is running:

```bash
cd server
npm run dev
```

### General cURL Usage Tips:

*   `jq`: Use `| jq` to pretty-print JSON responses for better readability.
*   `-H "Content-Type: application/json"`: Essential for sending JSON payloads.
*   `-d '{...}'`: Used to send request body data.
*   `-F file=@./path/to/file`: Used for file uploads in `multipart/form-data` requests.

---

### Existing cURL Commands (for reference and manual checks):

The following sections contain the original `cURL` commands, now intended for manual verification and quick debugging.

### 1. User Endpoints

**Get all Registrars**

```bash
curl -X GET http://localhost:4000/api/users/registrars | jq
```

**Search Users**

```bash
curl "http://localhost:4000/api/users/search?name=A&role=Student" | jq
```

**Get User by SBU ID**

```bash
curl -X GET http://localhost:4000/api/users/registrars | jq
```

**Import Users (YAML upload)**

```bash
curl -X POST http://localhost:4000/api/import/users \
  -H "Content-Type: multipart/form-data" \
  -F file=@./project_requirements/users1.yaml | jq
```

### 2. Class Schedule Endpoints

**Upload Class Schedule File (PDF/YAML/etc.)**

```bash
curl -X POST http://localhost:4000/api/classes/upload \
  -H "Content-Type: multipart/form-data" \
  -F file=@./project_requirements/schedule_Fall2025.pdf | jq
```

**Get All Class Sections**

```bash
curl -X GET http://localhost:4000/api/classes | jq
```

**Search Class Sections**

```bash
curl "http://localhost:4000/api/classes/search?subject=CSE&course_num=216" | jq
```

### 3. Waitlist Endpoints

**Add Student to Waitlist**

```bash
curl -X POST http://localhost:4000/api/waitlist/add \
  -H "Content-Type: application/json" \
  -d '{
        "class_id": 10123,
        "student_id": 100123456
      }' | jq
```

**Remove Student from Waitlist**

```bash
curl -X POST http://localhost:4000/api/waitlist/remove \
  -H "Content-Type: application/json" \
  -d '{
        "class_id": 10123,
        "student_id": 100123456
      }' | jq
```

**Get Waitlist for a Class**

```bash
curl "http://localhost:4000/api/waitlist/class/10123" | jq
```

### 4. Academic Plan Endpoints

**Get Academic Plan for a Student**

```bash
curl "http://localhost:4000/api/academic-plan/100123456" | jq
```

**Create/Update Academic Plan**

```bash
curl -X POST http://localhost:4000/api/academic-plan \
  -H "Content-Type: application/json" \
  -d '{
        "student_id": 100123456,
        "entries": [
          { "term": "Fall 2025", "course_id": 3210 },
          { "term": "Spring 2026", "course_id": 3220 }
        ]
      }' | jq
```

### 5. Registration Holds

**View Registration Holds**

```bash
curl "http://localhost:4000/api/registration-hold/100123456" | jq
```

**Add Registration Hold**

```bash
curl -X POST http://localhost:4000/api/registration-hold/add \
  -H "Content-Type: application/json" \
  -d '{
        "student_id": 100123456,
        "type": "Financial",
        "reason": "Unpaid Tuition"
      }' | jq
```

**Resolve Registration Hold**

```bash
curl -X POST http://localhost:4000/api/registration-hold/resolve \
  -H "Content-Type: application/json" \
  -d '{
        "hold_id": 7
      }' | jq
```

### 6. Audit Log Endpoints

**Get Audit Log for a User**

```bash
curl "http://localhost:4000/api/audit-log/100123456" | jq
```

**Write Audit Log Entry**

```bash
curl -X POST http://localhost:4000/api/audit-log \
  -H "Content-Type: application/json" \
  -d '{
        "actor_id": 12,
        "action": "ADD_CLASS",
        "details": "Student added CSE 216 to schedule"
      }' | jq
```

### 7. Term & Calendar Endpoints

**Get All Terms**

```bash
curl http://localhost:4000/api/terms | jq
```

**Get Term Schedule**

```bash
curl http://localhost:4000/api/terms/2025/Fall | jq
```

### 8. Course Catalog Endpoints

**Get All Courses**

```bash
curl http://localhost:4000/api/catalog/courses | jq
```

**Get Courses by Subject**

```bash
curl "http://localhost:4000/api/catalog/courses?subject=CSE" | jq
```

**Scrape & Import Catalog**

```bash
curl -X POST http://localhost:4000/api/catalog/scrape | jq
```

### 9. Health Check

**Ping the server**

```bash
curl http://localhost:4000/api/health | jq
```

### 10. Authentication Testing (If Enabled)

**Get current user (session-based)**

```bash
curl -X GET http://localhost:4000/api/auth/me \
  -H "Cookie: sessionId=your_session_cookie_here" | jq
```
