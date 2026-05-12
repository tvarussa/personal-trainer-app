#!/bin/bash
# Deploy backend: push to GitHub then trigger Render
set -e

echo "→ Pushing to GitHub..."
git push origin main

echo "→ Triggering Render deploy..."
HOOK=$(cat "$(dirname "$0")/.render-deploy-hook")
curl -s -X POST "$HOOK"
echo ""
echo "✓ Deploy triggered. Wait 2-3 minutes for Render to finish."
