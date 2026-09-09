$ErrorActionPreference = 'Stop'
$taskRepository = Split-Path -Parent $PSScriptRoot
$taskPreviousEnvironment = @{}
foreach ($taskVariable in @('TEST_DATABASE_URL', 'TEST_REDIS_URL', 'DATABASE_URL')) {
  $taskPreviousEnvironment[$taskVariable] = [Environment]::GetEnvironmentVariable($taskVariable, 'Process')
}
Push-Location $taskRepository
try {
  docker compose -f docker-compose.acceptance.yml up -d --wait --wait-timeout 120
  if ($LASTEXITCODE -ne 0) { throw 'Acceptance database services did not become healthy' }
  $env:TEST_DATABASE_URL = 'postgresql://test:acceptance-only-local@127.0.0.1:15432/libswiftride_test'
  $env:TEST_REDIS_URL = 'redis://127.0.0.1:16379'
  $env:DATABASE_URL = $env:TEST_DATABASE_URL
  node apps/api/node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { throw 'Acceptance database migration failed' }
  Push-Location apps/api
  try {
    node node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
    if ($LASTEXITCODE -ne 0) { throw 'API acceptance/unit/security tests failed' }
  } finally { Pop-Location }
} finally {
  foreach ($taskVariable in $taskPreviousEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($taskVariable, $taskPreviousEnvironment[$taskVariable], 'Process')
  }
  Pop-Location
}
