#!/bin/bash
# Test script for the winietki API
# Usage: ./test_files/test-api.sh [BASE_URL]
# Defaults to http://localhost:3001

BASE_URL="${1:-http://localhost:3001}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$DIR/output"
mkdir -p "$OUT_DIR"

echo "=== Winietki API Test ==="
echo "Server: $BASE_URL"
echo "Output: $OUT_DIR"
echo ""

# Test 1: Single merged PDF (built-in font)
echo "--- Test 1: Single merged PDF with built-in Tan Pearl font ---"
curl -s -w "\nHTTP %{http_code} | %{size_download} bytes\n" \
  -X POST "$BASE_URL/api/generate" \
  -F "template=@$DIR/template.pdf" \
  -F "csv=@$DIR/winietki.csv" \
  -F "fontName=Tan Pearl" \
  -F "fontSize=14" \
  -F "textColor=#000000" \
  -F "textAlign=center" \
  -F "positionX=0.5" \
  -F "positionY=0.5" \
  -F "outputFormat=single" \
  -F "flatten=false" \
  -o "$OUT_DIR/winietki_single.pdf"


  curl -X POST "$BASE_URL/api/generate" \
  -F "template=@template.pdf" \
  -F "csv=@winietki.csv" \
  -F "fontName=Tan Pearl" \
  -F "fontSize=12" \
  -F "textColor=#000000" \
  -F "textAlign=center" \
  -F "positionX=0.2049" \
  -F "positionY=0.7216" \
  -F "outputFormat=single" \
  -F "flatten=false" \
  -o "output.pdf"

echo ""

# Test 2: Multiple PDFs as ZIP (built-in font)
echo "--- Test 2: Multiple PDFs (ZIP) with built-in Sans font ---"
curl -s -w "\nHTTP %{http_code} | %{size_download} bytes\n" \
  -X POST "$BASE_URL/api/generate" \
  -F "template=@$DIR/template.pdf" \
  -F "csv=@$DIR/winietki.csv" \
  -F "fontName=Sans" \
  -F "fontSize=12" \
  -F "textColor=#333333" \
  -F "textAlign=center" \
  -F "positionX=0.5" \
  -F "positionY=0.5" \
  -F "outputFormat=multiple" \
  -F "flatten=true" \
  -o "$OUT_DIR/winietki_multiple.zip"

echo ""
echo "=== Done ==="
echo "Check output files:"
ls -lh "$OUT_DIR"
