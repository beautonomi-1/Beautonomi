#!/bin/bash
# Quick Test Script for Linux/Mac

echo "Running Quick Test Suite..."
echo ""

echo "[1/4] Health Check..."
npm run test:health || exit 1

echo ""
echo "[2/4] Type Check..."
npx tsc --noEmit || exit 1

echo ""
echo "[3/4] Linting..."
npm run lint || exit 1

echo ""
echo "[4/4] Running Tests..."
npm run test:run || exit 1

echo ""
echo "All checks passed!"
