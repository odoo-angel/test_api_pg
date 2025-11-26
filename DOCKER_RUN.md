# Running with Docker

This guide shows you how to run the CreekSide Express API using Docker.

## Prerequisites

- Docker installed on your machine
- Docker Compose (optional, for easier setup)

## Method 1: Using Docker Compose (Recommended)

This is the easiest way to run the entire stack including the database.

### Step 1: Install Docker and Docker Compose

Download and install from [Docker Desktop](https://www.docker.com/products/docker-desktop)

### Step 2: Create docker-compose.yml

We'll need to create a docker-compose file that includes the database:

```yaml
version: '3.8'

services:
  db:
    image: mysql:8.0
    container_name: creekside-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: creekside_db
      MYSQL_USER: creekside_user
      MYSQL_PASSWORD: creekside_password
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  app:
    build: .
    container_name: creekside-api
    restart: always
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      SESSION_SECRET: your-session-secret-change-this
      DB_HOST: db
      DB_USER: creekside_user
      DB_PASSWORD: creekside_password
      DB_NAME: creekside_db
      DB_SSL: false
      GOOGLE_CLIENT_ID: your-google-client-id
      GOOGLE_CLIENT_SECRET: your-google-client-secret
    depends_on:
      - db
    volumes:
      - .:/app
      - /app/node_modules

volumes:
  mysql_data:
```

### Step 3: Run with Docker Compose

```bash
# Start the application
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Method 2: Using Docker Only

### Step 1: Build the Docker Image

```bash
docker build -t creekside-api .
```

### Step 2: Run the Container

You'll need a running MySQL database. You can use a local MySQL or run it in Docker:

```bash
# Run MySQL database
docker run -d \
  --name creekside-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=creekside_db \
  -e MYSQL_USER=creekside_user \
  -e MYSQL_PASSWORD=creekside_password \
  -p 3306:3306 \
  mysql:8.0

# Wait a few seconds for MySQL to start, then run the app
docker run -d \
  --name creekside-api \
  --link creekside-mysql:db \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e SESSION_SECRET=your-session-secret \
  -e DB_HOST=db \
  -e DB_USER=creekside_user \
  -e DB_PASSWORD=creekside_password \
  -e DB_NAME=creekside_db \
  -e DB_SSL=false \
  -e GOOGLE_CLIENT_ID=your-client-id \
  -e GOOGLE_CLIENT_SECRET=your-client-secret \
  creekside-api
```

### Step 3: Initialize Database

After the containers are running, initialize the database schema:

```bash
# Copy schema to container
docker cp database_schema.sql creekside-mysql:/tmp/

# Execute schema
docker exec -i creekside-mysql mysql -uroot -prootpassword < database_schema.sql
```

Or connect to the MySQL container and run the schema:

```bash
docker exec -it creekside-mysql mysql -uroot -prootpassword
```

Then manually run the SQL from `database_schema.sql`.

### Step 4: View Logs

```bash
# View application logs
docker logs -f creekside-api

# View database logs
docker logs -f creekside-mysql
```

### Step 5: Stop Containers

```bash
docker stop creekside-api creekside-mysql
docker rm creekside-api creekside-mysql
```

## Method 3: Development Mode (No Docker)

For development, it's often easier to run without Docker:

```bash
# Install dependencies
npm install

# Create .env file from template
cp .env.example .env
# Edit .env with your settings

# Make sure you have MySQL running locally or accessible
# Run the database schema
mysql -h localhost -u root -p < database_schema.sql

# Start the development server
npm run dev
```

## Quick Test

Once running (any method above), test the API:

```bash
# Health check
curl http://localhost:3000/health

# Root endpoint
curl http://localhost:3000

# Open in browser
open http://localhost:3000
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker logs creekside-api
```

### Database connection issues

Verify MySQL is running:
```bash
docker ps | grep mysql
```

Test connection:
```bash
docker exec -it creekside-mysql mysql -ucreekside_user -pcreekside_password
```

### Port already in use

If port 3000 is in use, change it in docker-compose.yml or the docker run command:
```yaml
ports:
  - "3001:3000"  # Map host port 3001 to container port 3000
```

### Environment variables not working

Make sure you set all required environment variables. Check `.env.example` for the complete list.

## Useful Docker Commands

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# Stop a container
docker stop <container-name>

# Remove a container
docker rm <container-name>

# View container logs
docker logs <container-name>

# Execute a command in a running container
docker exec -it <container-name> /bin/bash

# Remove all stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove everything (containers, images, volumes)
docker system prune -a --volumes
```

## Next Steps

1. Set up your Google OAuth credentials
2. Customize the database schema
3. Add more API endpoints
4. Deploy to Google Cloud Run (see DEPLOYMENT.md)
