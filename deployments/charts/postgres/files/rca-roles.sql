CREATE ROLE rca_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE rca_migrator LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE deployment_manager LOGIN PASSWORD :'dm_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE rca_agent LOGIN PASSWORD :'agent_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE rca_mcp LOGIN PASSWORD :'mcp_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER SCHEMA public OWNER TO rca_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO rca_migrator;
GRANT USAGE ON SCHEMA public TO deployment_manager, rca_agent, rca_mcp;
GRANT rca_owner TO rca_migrator;
ALTER ROLE deployment_manager SET statement_timeout = '10s';
ALTER ROLE deployment_manager SET lock_timeout = '5s';
ALTER ROLE rca_agent SET statement_timeout = '10s';
ALTER ROLE rca_agent SET lock_timeout = '5s';
ALTER ROLE rca_mcp SET statement_timeout = '10s';
ALTER ROLE rca_mcp SET lock_timeout = '5s';
ALTER ROLE rca_migrator SET statement_timeout = '5min';
ALTER ROLE rca_migrator SET lock_timeout = '30s';

