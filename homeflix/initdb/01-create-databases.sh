#!/bin/bash
# Une base et un rôle par service : aucun accès croisé entre bases.
set -euo pipefail
create() {
  local name="$1" password="$2"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
CREATE ROLE ${name} LOGIN PASSWORD '${password}';
CREATE DATABASE ${name} OWNER ${name};
REVOKE CONNECT ON DATABASE ${name} FROM PUBLIC;
SQL
}
create identity    "$IDENTITY_DB_PASSWORD"
create library     "$LIBRARY_DB_PASSWORD"
create acquisition "$ACQUISITION_DB_PASSWORD"
