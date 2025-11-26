# Quick Start Guide

Get the CreekSide Express API running in minutes!

## Option 1: Docker (Easiest - Recommended for production)

### Prerequisites
- Docker Desktop installed ([Download here](https://www.docker.com/products/docker-desktop))

### Steps

1. **Edit the environment variables** (optional but recommended):
   ```bash
   # Open docker-compose.yml and update:
   # - GOOGLE_CLIENT_ID
   # - GOOGLE_CLIENT_SECRET
   # - SESSION_SECRET
   ```

2. **Start everything**:
   ```bash
   docker-compose up -d
   ```

3. **Check if it's running**:
   ```bash
   docker-compose ps
   ```

4. **View logs**:
   ```bash
   docker-compose logs -f
   ```

5. **Test the API**:
   ```bash
   curl http://localhost:3000/health
   ```
   
   Or open in browser: http://localhost:3000

6. **Stop everything**:
   ```bash
   docker-compose down
   ```

That's it! The database will automatically initialize with the schema.

---

## Option 2: Local Development (No Docker)

### Prerequisites
- Node.js 14+ installed
- MySQL installed and running

### Steps

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your database and Google OAuth settings
   ```

3. **Set up database**:
   ```bash
   mysql -u root -p < database_schema.sql
   ```

4. **Start the server**:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

5. **Test**:
   ```bash
   curl http://localhost:3000/health
   ```

---

## What You Get

Once running, you'll have:

- ✅ Express API server on port 3000
- ✅ MySQL database on port 3306
- ✅ Google OAuth authentication
- ✅ Health check endpoint: `/health`
- ✅ API info at root: `/`
- ✅ Protected routes (requires login)

### Test Endpoints

```bash
# Health check
curl http://localhost:3000/health

# API info
curl http://localhost:3000

# Login with Google (opens in browser)
# Visit: http://localhost:3000/auth/google

# Profile (requires authentication)
curl http://localhost:3000/profile
```

### Email/Password (JWT) Endpoints

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test User","email":"test@example.com","password":"Secret123!"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"Secret123!"}'

# Me (JWT)
TOKEN=... # paste token from login/registration response
curl http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## Troubleshooting

### Port 3000 already in use?

**With Docker Compose:**
Edit `docker-compose.yml` and change:
```yaml
ports:
  - "3001:3000"  # Use port 3001 instead
```

**Local development:**
Change `PORT` in your `.env` file or set it:
```bash
PORT=3001 npm start
```

### Database connection issues?

**With Docker:**
```bash
# Check if database is running
docker-compose ps

# View database logs
docker-compose logs db

# Restart database
docker-compose restart db
```

**Local:**
```bash
# Check if MySQL is running
mysql -u root -p -e "SELECT 1"
```

### Need to reset everything?

**With Docker:**
```bash
# Stop and remove everything including data
docker-compose down -v

# Start fresh
docker-compose up -d
```

---

## Next Steps

1. **Set up Google OAuth:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth credentials
   - Add to your `.env` or `docker-compose.yml`

2. **Customize the API:**
   - Add your own routes in `app.js`
   - Modify the database schema as needed

3. **Deploy to production:**
   - See `DEPLOYMENT.md` for Google Cloud Run instructions

---

## Need Help?

- Check the logs: `docker-compose logs -f`
- View database: `docker exec -it creekside-mysql mysql -u root -prootpassword`
- See detailed docs in `README.md` and `DOCKER_RUN.md`
