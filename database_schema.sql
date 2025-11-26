-- CreekSide Database Schema
-- Run this SQL script on your PostgreSQL database to create the necessary tables

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enumerated Types
-- 1. user_role
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN 
        CREATE TYPE user_role AS ENUM ('surveyor', 'reviewer', 'admin'); 
    END IF; 
END $$;

-- 2. project_status
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN 
        CREATE TYPE project_status AS ENUM ('active', 'completed', 'not_started'); 
    END IF; 
END $$;

-- 3. house_status
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'house_status') THEN 
        CREATE TYPE house_status AS ENUM ('in_progress', 'completed', 'delayed'); 
    END IF; 
END $$;

-- 4. house_activity_status
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'house_activity_status') THEN 
        CREATE TYPE house_activity_status AS ENUM ('pending', 'in_progress', 'review', 'completed', 'blocked', 'rejected'); 
    END IF; 
END $$;

-- Users (app users)
CREATE TABLE app_users (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email        TEXT NOT NULL UNIQUE,
    first_name   TEXT,
    last_name    TEXT,
    user_image   TEXT,
    role         user_role NOT NULL DEFAULT 'surveyor',
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    password_hash TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role  ON app_users(role);
CREATE INDEX idx_users_email ON app_users(email);

-- Projects (construction projects / fraccionamientos / desarrollos)
CREATE TABLE app_projects (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title            TEXT NOT NULL,
    houses_completed INTEGER NOT NULL DEFAULT 0 CHECK (houses_completed >= 0),
    total_houses     INTEGER NOT NULL DEFAULT 0 CHECK (total_houses >= 0),
    project_image    TEXT,
    description      TEXT,
    start_date       DATE,
    status           project_status NOT NULL DEFAULT 'not_started',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON app_projects(status);
CREATE INDEX idx_projects_title  ON app_projects(title);

-- Houses under construction
CREATE TABLE app_houses (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id           UUID,
    coto                 TEXT,
    name                 TEXT,
    model                TEXT,
    status               house_status NOT NULL DEFAULT 'in_progress',
    progress             NUMERIC NOT NULL DEFAULT 0
                           CHECK (progress >= 0 AND progress <= 100),
    description          TEXT,
    house_image          TEXT,
    m2const              NUMERIC,
    completed_activities INTEGER NOT NULL DEFAULT 0,
    total_activities     INTEGER NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_houses_project
      FOREIGN KEY (project_id)
      REFERENCES app_projects(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE
);

CREATE INDEX idx_houses_project_id ON app_houses(project_id);
CREATE INDEX idx_houses_status     ON app_houses(status);

-- Triggers to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_houses_updated_at
BEFORE UPDATE ON app_houses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Master list of activities (workflow definition)
CREATE TABLE app_activities (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    num         INT NOT NULL,                
    phase       TEXT NOT NULL,
    sub_phase   TEXT NOT NULL,
    activity    TEXT NOT NULL,                
    dependance  JSONB,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX uniq_activities_num         ON app_activities(num);
CREATE INDEX        idx_activities_phase        ON app_activities(phase, sub_phase);
CREATE INDEX        idx_activities_is_active    ON app_activities(is_active);

-- House-specific activities (instantiated from the master list)
CREATE TABLE app_house_activities (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id         UUID NOT NULL,
    activity_id      UUID NOT NULL,

    num              TEXT NOT NULL,
    phase            TEXT NOT NULL,
    sub_phase        TEXT NOT NULL,
    activity         TEXT NOT NULL,
    dependance       JSONB,
    description      TEXT,

    open_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    start_date       TIMESTAMPTZ,
    completion_date  TIMESTAMPTZ,
    status           house_activity_status NOT NULL DEFAULT 'pending',

    app_user_id      UUID,
    approved_by_id   UUID,
    approved_at      TIMESTAMPTZ,
    remarks          TEXT,
    rejected_remarks TEXT,
    is_blocked       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_house_activities_house
      FOREIGN KEY (house_id)
      REFERENCES app_houses(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_house_activities_activity
      FOREIGN KEY (activity_id)
      REFERENCES app_activities(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE,

    CONSTRAINT fk_house_activities_app_user
      FOREIGN KEY (app_user_id)
      REFERENCES app_users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE,

    CONSTRAINT fk_house_activities_approved_by
      FOREIGN KEY (approved_by_id)
      REFERENCES app_users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE
);

CREATE INDEX idx_house_activities_house_id      ON app_house_activities(house_id);
CREATE INDEX idx_house_activities_activity_id   ON app_house_activities(activity_id);
CREATE INDEX idx_house_activities_status        ON app_house_activities(status);
CREATE INDEX idx_house_activities_app_user      ON app_house_activities(app_user_id);
CREATE INDEX idx_house_activities_approved_by   ON app_house_activities(approved_by_id);

-- Images linked to house activities
CREATE TABLE app_images (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_activity_id UUID NOT NULL,
    app_user_id       UUID,
    url               TEXT NOT NULL,
    caption           TEXT,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_images_house_activity
      FOREIGN KEY (house_activity_id)
      REFERENCES app_house_activities(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE,

    CONSTRAINT fk_images_user
      FOREIGN KEY (app_user_id)
      REFERENCES app_users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE
);

CREATE INDEX idx_images_ha_id    ON app_images(house_activity_id);
CREATE INDEX idx_images_user_id  ON app_images(app_user_id);
