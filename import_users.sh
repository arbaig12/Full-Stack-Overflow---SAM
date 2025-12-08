#!/bin/bash

# Script to import users2.yaml file
# Usage: ./import_users.sh [port] [cookie-file]

PORT=${1:-3000}
COOKIE_FILE=${2:-"cookies.txt"}
FILE="demo_files/users2.yaml"

echo "Importing users from $FILE..."
echo "Server: http://localhost:$PORT"
echo ""

if [ -f "$COOKIE_FILE" ]; then
  echo "Using cookies from $COOKIE_FILE"
  curl -X POST "http://localhost:$PORT/api/import/users" \
    -F "file=@$FILE" \
    -b "$COOKIE_FILE" \
    -H "Content-Type: multipart/form-data" \
    -w "\n\nHTTP Status: %{http_code}\n" \
    -s | jq '.' 2>/dev/null || cat
else
  echo "No cookie file found. Attempting import without authentication..."
  echo "(This will work if no registrars exist in the database)"
  curl -X POST "http://localhost:$PORT/api/import/users" \
    -F "file=@$FILE" \
    -H "Content-Type: multipart/form-data" \
    -w "\n\nHTTP Status: %{http_code}\n" \
    -s | jq '.' 2>/dev/null || cat
fi

echo ""
echo "Done!"

