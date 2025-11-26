-- Migration: Add password_hash column to app_users table
-- Run this SQL script on your existing database to add the password_hash column
-- Safe for PostgreSQL 17.6 (Cloud SQL)

ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS password_hash TEXT;
