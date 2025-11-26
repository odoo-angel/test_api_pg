# Google Cloud Run Deployment Guide

This guide will help you deploy the CreekSide Express API to Google Cloud Run.

## Prerequisites

- Google Cloud account with billing enabled
- Google Cloud CLI (`gcloud`) installed
- Docker installed (for local testing)

## Step 1: Set Up Google Cloud SQL

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to SQL in the left menu
3. Click "Create Instance"
4. Choose MySQL
5. Set instance ID: `creekside-mysql`
6. Set root password
7. Choose region
8. Click "Create Instance"
9. Wait for instance to be created
10. Click on the instance and go to "Connections"
11. Note the Public IP address

## Step 2: Create Database and Tables

1. Go to the SQL instance
2. Click "Databases" tab
3. Create a database named `creekside_db`
4. Click "Users" tab
5. Create a new user or use root
6. Use the SQL tab to run the schema from `database_schema.sql`

## Step 3: Configure OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth client ID"
5. Application type: Web application
6. Name: CreekSide API
7. Authorized JavaScript origins: (leave blank for now)
8. Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
9. Copy Client ID and Client Secret

## Step 4: Build and Push Docker Image

```bash
# Set your project ID
export PROJECT_ID="your-gcp-project-id"
export SERVICE_NAME="creekside-api"

# Configure gcloud
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com

# Build and push the image
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
```

## Step 5: Deploy to Cloud Run

```bash
# Deploy the service
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="DB_HOST=YOUR_DB_IP" \
  --set-env-vars="DB_USER=YOUR_DB_USER" \
  --set-env-vars="DB_PASSWORD=YOUR_DB_PASSWORD" \
  --set-env-vars="DB_NAME=creekside_db" \
  --set-env-vars="DB_SSL=true" \
  --set-env-vars="GOOGLE_CLIENT_ID=YOUR_CLIENT_ID" \
  --set-env-vars="GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET" \
  --set-env-vars="SESSION_SECRET=YOUR_STRONG_SECRET" \
  --set-env-vars="PORT=8080"
```

## Step 6: Configure Cloud SQL Connection

1. Go to your Cloud Run service
2. Click "Edit & Deploy New Revision"
3. Go to "Connections" tab
4. Check "Cloud SQL connections"
5. Select your Cloud SQL instance
6. Save and deploy

## Step 7: Update OAuth Callback URL

1. Get your Cloud Run URL (it will be something like `https://your-service-xxx.run.app`)
2. Go back to Google Cloud Console → Credentials
3. Edit your OAuth 2.0 Client ID
4. Add to Authorized redirect URIs: `https://your-service-xxx.run.app/auth/google/callback`
5. Save

## Step 8: Test the Deployment

Visit your Cloud Run URL to test:
```
https://your-service-url.run.app
```

Check health endpoint:
```
https://your-service-url.run.app/health
```

## Environment Variables Reference

Make sure to set these in Cloud Run:

- `NODE_ENV`: production
- `PORT`: 8080 (Cloud Run default)
- `SESSION_SECRET`: A strong random string
- `DB_HOST`: Your Cloud SQL IP address
- `DB_USER`: Database username
- `DB_PASSWORD`: Database password
- `DB_NAME`: Database name (e.g., creekside_db)
- `DB_SSL`: true
- `GOOGLE_CLIENT_ID`: Your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret

## Troubleshooting

### Database Connection Issues

1. Ensure Cloud Run can connect to Cloud SQL:
   - Enable Cloud SQL connections in Cloud Run
   - Whitelist Cloud Run service account

2. Check firewall rules:
   - Cloud SQL instance should allow connections from authorized networks

### OAuth Issues

1. Verify callback URLs match exactly
2. Ensure all required APIs are enabled
3. Check that OAuth consent screen is configured

### Service Not Starting

1. Check Cloud Run logs: `gcloud logging read "resource.type=cloud_run_revision"`
2. Verify all environment variables are set correctly
3. Check if the database is accessible

## Scaling and Performance

- Cloud Run automatically scales based on traffic
- Set min/max instances based on your needs
- Configure memory and CPU based on workload
- Monitor costs in Cloud Console

## Security Best Practices

1. Use Secret Manager for sensitive data instead of environment variables
2. Enable IAM for Cloud Run service
3. Restrict Cloud SQL access to authorized services only
4. Use VPC connector for private connections
5. Enable Cloud Armor for DDoS protection

## Monitoring

1. Set up Cloud Monitoring alerts
2. Use Cloud Logging to track errors
3. Monitor database connections and performance
4. Set up uptime checks

## Cost Optimization

- Set minimum instances to 0 to avoid cold starts
- Use Cloud SQL smaller instances for development
- Monitor Cloud Run invocations and CPU usage
- Set up billing alerts

## Next Steps

- Set up CI/CD pipeline with Cloud Build
- Add custom domain mapping
- Implement rate limiting
- Add API key authentication
- Set up monitoring and alerting
