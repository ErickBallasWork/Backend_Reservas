#!/bin/sh
set -e

max_attempts=4
attempt=1

# Es más seguro usar npx que la ruta absoluta al binario dentro de Docker
until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Migrations failed after $max_attempts attempts."
    exit 1
  fi
  echo "Migrations failed (attempt $attempt/$max_attempts). Retrying in 15 s..."
  attempt=$((attempt + 1))
  sleep 15
done

echo "Migrations completed successfully. Starting NestJS application..."
exec node dist/main.js
