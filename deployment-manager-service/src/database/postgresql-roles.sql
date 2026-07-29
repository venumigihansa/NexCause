-- Run once as a PostgreSQL administrator. Passwords are deliberately not
-- included; set them from the platform secret-management workflow.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rca_owner') THEN
    CREATE ROLE rca_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rca_migrator') THEN
    CREATE ROLE rca_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deployment_manager') THEN
    CREATE ROLE deployment_manager LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rca_agent') THEN
    CREATE ROLE rca_agent LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rca_mcp') THEN
    CREATE ROLE rca_mcp LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO deployment_manager, rca_agent, rca_mcp;
GRANT USAGE, CREATE ON SCHEMA public TO rca_migrator;
GRANT rca_owner TO rca_migrator;

ALTER ROLE deployment_manager SET statement_timeout = '10s';
ALTER ROLE deployment_manager SET lock_timeout = '5s';
ALTER ROLE rca_agent SET statement_timeout = '10s';
ALTER ROLE rca_agent SET lock_timeout = '5s';
ALTER ROLE rca_mcp SET statement_timeout = '10s';
ALTER ROLE rca_mcp SET lock_timeout = '5s';
ALTER ROLE rca_migrator SET statement_timeout = '5min';
ALTER ROLE rca_migrator SET lock_timeout = '30s';

ALTER DEFAULT PRIVILEGES FOR ROLE rca_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO deployment_manager;
ALTER DEFAULT PRIVILEGES FOR ROLE rca_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO deployment_manager;
