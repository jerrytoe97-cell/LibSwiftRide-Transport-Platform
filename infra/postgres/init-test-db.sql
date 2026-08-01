-- Local-only test database matching the credentials used by vitest.config.ts.
-- Docker runs this file once, when a new PostgreSQL volume is initialized.
SELECT 'CREATE ROLE test LOGIN PASSWORD ''test'''
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test') \gexec

SELECT 'CREATE DATABASE libswiftride_test OWNER test'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'libswiftride_test') \gexec
