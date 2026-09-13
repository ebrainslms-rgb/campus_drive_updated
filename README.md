# EB-LMS — EcoBrains Online Examination Portal

EB-LMS is an online examination platform developed for EcoBrains.

## Technology Stack

### Backend
- Java 21
- Spring Boot 4.1
- Spring Data JPA
- Hibernate
- MySQL 8
- JWT
- Maven

### Frontend
- React 18
- Vite
- Tailwind CSS

### Deployment
- Docker
- Docker Compose
- Nginx

---

## Project Structure

```text
Raju-LMS/
│
├── backend/
│   ├── src/
│   ├── pom.xml
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## Local Development

### Backend Requirements

- JDK 21
- Maven 3.9+
- MySQL 8

### Create Database

```sql
CREATE DATABASE ecobrains_lms CHARACTER SET utf8mb4;
```

### Run Backend

```bash
cd backend
mvn clean package
java -jar target/lms-backend.jar
```

Backend runs on:

```text
http://localhost:8080
```

### Frontend Requirements

- Node.js 18+

### Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:3000
```

---

## Admin Portal

The admin URL follows this format:

```text
http://localhost:3000/{ADMIN_URL_KEY}/admin
```

The actual `ADMIN_URL_KEY` is environment-specific and must not be committed to the repository.

## Student Portal

```text
http://localhost:3000/
```

---

## Production Configuration

Production configuration is provided through the `.env` file.

Required environment variables:

```env
MYSQL_ROOT_PASSWORD=<database-password>

ADMIN_USERNAME=<admin-username>
ADMIN_PASSWORD=<admin-password>
ADMIN_URL_KEY=<admin-url-key>

JWT_SECRET=<jwt-secret>

CORS_ALLOWED_ORIGINS=<frontend-origin>
```

The production `.env` file must NOT be committed to GitHub.

The deployment person must create the `.env` file separately on the production server.

---

## JWT Configuration

Current JWT expiration:

```text
Admin   : 8 hours
Student : 3 hours
```
Configuration:

```properties
app.jwt.admin-expiration-ms=28800000
app.jwt.student-expiration-ms=10800000
```

---

## Docker Deployment

From the project root:

```bash
docker compose build
```

Start the application:

```bash
docker compose up -d
```

Check the services:

```bash
docker compose ps
```

The application contains three services:

```text
frontend
backend
mysql
```

Stop the application:

```bash
docker compose stop
```

Restart the application:

```bash
docker compose restart
```

---

## Docker Update

After backend or frontend code changes:

```bash
docker compose build
docker compose up -d
```

For frontend-only changes:

```bash
docker compose build frontend
docker compose up -d frontend
```

For backend-only changes:

```bash
docker compose build backend
docker compose up -d backend
```

---

## Database

MySQL database:

```text
Database: ecobrains_lms
Port: 3306
```

Docker uses a persistent volume for MySQL data.

Do NOT use:

```bash
docker compose down -v
```

unless the database data is intentionally being deleted.

---

## Nginx

Nginx configuration:

```text
frontend/nginx.conf
```

Nginx handles:

- React routing
- `/api/` requests to the Spring Boot backend
- File uploads up to 15 MB at the Nginx level

Current Nginx upload limit:

```nginx
client_max_body_size 15M;
```

The Spring Boot backend currently has:

```properties
spring.servlet.multipart.max-file-size=10MB
spring.servlet.multipart.max-request-size=10MB
```

Therefore, the current effective backend upload limit is 10 MB.

---

## Production Deployment

The production deployment flow is:

```text
GitHub Repository
       ↓
Production Server
       ↓
Create .env
       ↓
docker compose build
       ↓
docker compose up -d
       ↓
docker compose ps
       ↓
Test Application
```

Example:

```bash
git clone <repository-url>
cd Raju-LMS
```

Create the production `.env` file:

```bash
nano .env
```

Then build and start:

```bash
docker compose build
docker compose up -d
```

Check:

```bash
docker compose ps
```

---

## Useful Docker Commands

Check running containers:

```bash
docker ps
```

Check application status:

```bash
docker compose ps
```

Backend logs:

```bash
docker compose logs --tail=100 backend
```

Frontend logs:

```bash
docker compose logs --tail=100 frontend
```

MySQL logs:

```bash
docker compose logs --tail=100 mysql
```

Follow backend logs:

```bash
docker compose logs -f backend
```

---

## Security

Do NOT commit the following to GitHub:

- `.env`
- Production passwords
- JWT secrets
- API keys
- Private keys
- Production credentials

## Campus Drive_Raju_version_9 - Exam State Architecture

The exam engine uses three layers intentionally:

- React state: immediate UI response.
- IndexedDB: browser-side recovery copy for unstable college internet.
- Redis: temporary live exam state and dirty answer synchronization.
- MySQL: permanent checkpoint, final answers, scores and audit history.

### Starting Redis

Redis is included in `docker-compose.yml`. You do not need to install Redis separately when using Docker Compose.

Run the complete local stack with:

```bash
docker compose up -d --build
```

This starts MySQL, Redis, Spring Boot and the React/Nginx frontend. Redis data uses a persistent Docker volume and AOF persistence.

### Exam synchronization behavior

The browser keeps `CURRENT` and `LAST_SYNCED` answers locally. Moving between pages sends one request only when the current page contains changed answers. Unchanged page navigation produces no exam save request. The backend applies client sequence numbers so an older delayed request cannot overwrite a newer answer.

Active Redis sessions are checkpointed to MySQL every 15 minutes by default, processing dirty sessions in bounded batches. Manual submission and deadline submission finalize the latest browser/Redis state in MySQL before clearing Redis and browser exam storage.

### Exam login window

The previous 15-minute first-login cutoff is removed. A student can enter the exam while the scheduled exam window is active. The absolute exam end time remains authoritative, so a late entrant receives only the remaining time.

### Examination-policy violations

- First tab/fullscreen violation: 5-minute access restriction.
- Second violation: another 5-minute restriction.
- Third violation: examination access is terminated.
- Admin can allow resume or force-submit from `Drives -> Ongoing Drive -> Live Examination Control`.
- Violation history is retained in audit logs.
- The actual exam deadline never moves because of a restriction.


### Existing systemd backend deployment

If Spring Boot is run directly by systemd instead of inside Docker, run the Redis service from this compose file (`docker compose up -d redis`) so Redis is available at `127.0.0.1:6379`. The backend's default Redis host is `localhost`; production values can be overridden with `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD`.
