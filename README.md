# CreekSide Express API Server

Express API server with MySQL database integration and Google OAuth authentication, designed to run on Google Cloud Run.

## Features

- ✅ Express.js REST API
- ✅ MySQL database integration (Google Cloud SQL compatible)
- ✅ Google OAuth 2.0 authentication
- ✅ Session management with Passport.js
- ✅ CORS enabled
- ✅ SSL/TLS support for secure database connections
- ✅ Connection pooling for optimal performance
- ✅ Health check endpoint
- ✅ Protected API routes

## Prerequisites

- Node.js (v14 or higher)
- MySQL database (Google Cloud SQL or local)
- Google Cloud Console account (for OAuth credentials)

## Setup Instructions

### 1. Clone and Install

```bash
npm install
```

### 2. Configure Environment Variables

Copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in your configuration:

```env
PORT=3000
SESSION_SECRET=your-random-secret-key
JWT_SECRET=your-jwt-secret-key

# MySQL Database (Google Cloud SQL)
DB_HOST=your-cloud-sql-host
DB_USER=your-username
DB_PASSWORD=your-password
DB_NAME=creekside_db
DB_SSL=true

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Default Admin User (created automatically on first startup)
DEFAULT_ADMIN_EMAIL=admin@creekside.com
DEFAULT_ADMIN_PASSWORD=admin123
DEFAULT_ADMIN_FIRST_NAME=Admin
DEFAULT_ADMIN_LAST_NAME=User
```

**Note:** The default admin user is automatically created on first startup if it doesn't exist. You can customize the credentials using the environment variables above. **Important:** Change the default password after first login!

### 3. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Add authorized callback URL: `http://localhost:3000/auth/google/callback`
6. Copy the Client ID and Client Secret to your `.env` file

### 4. Set Up Database

Run the SQL schema:

```bash
mysql -h your-host -u your-username -p < database_schema.sql
```

Or manually execute the SQL in `database_schema.sql` in your MySQL client.

### 5. Run the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000`

**Default Admin User:**
On first startup, a default admin user is automatically created:
- **Email:** `admin@creekside.com` (or `DEFAULT_ADMIN_EMAIL` from `.env`)
- **Password:** `admin123` (or `DEFAULT_ADMIN_PASSWORD` from `.env`)

You can use these credentials to log in via `POST /auth/login` and get a JWT token for API access.

**⚠️ Important:** Change the default admin password after first login using the `PUT /api/users/{id}` endpoint (requires admin authentication).

## API Endpoints

### Public Endpoints

- `GET /` - API information
- `GET /health` - Health check and database connection status
- `GET /auth/google` - Initiate Google OAuth login

### Protected Endpoints (Requires Authentication)

- `GET /profile` - Get current user profile
- `GET /logout` - Logout current user
- `GET /api/data` - Get all users data
- `POST /api/users` - Create a new user

## Usage Examples

### Health Check
```bash
curl http://localhost:3000/health
```

### Login with Google
Visit: `http://localhost:3000/auth/google`

After successful login, you'll be redirected to `/profile`.

### Get Profile (requires authentication)
```bash
curl http://localhost:3000/profile
```

### Get All Data (requires authentication)
```bash
curl http://localhost:3000/api/data
```

## Database Schema

The main table structure:

- `users` - Stores user information with Google OAuth integration

See `database_schema.sql` for the complete schema.

## Google Cloud Run Deployment

To deploy to Google Cloud Run:

1. Create a Dockerfile (provided below)
2. Build and push the image:
```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT/creekside-api
```

3. Deploy to Cloud Run:
```bash
gcloud run deploy creekside-api \
  --image gcr.io/YOUR_PROJECT/creekside-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

Make sure to set environment variables in Cloud Run for your database credentials.

## Security Notes

- Never commit `.env` file to version control
- Use strong session secrets in production
- Enable SSL for database connections in production
- Implement rate limiting for production use
- Use environment-specific configurations

## Troubleshooting

### Database Connection Issues

- Verify your database host, credentials, and network access
- Check if SSL is required for your Cloud SQL instance
- Ensure your IP is whitelisted in Cloud SQL settings

### OAuth Issues

- Verify Google OAuth credentials
- Check callback URL matches exactly (including protocol)
- Ensure Google+ API is enabled in Google Cloud Console

## License

ISC

## Author

Jose Murillo
