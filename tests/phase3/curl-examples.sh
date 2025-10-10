#!/usr/bin/env bash
API="$1"
STORE=S1
SKU=SKU1
NOW=$(date +%s000)

echo "POST inventory/update"
curl -sS -X POST "$API/inventory/update" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE\",\"skuId\":\"$SKU\",\"current\":25,\"threshold\":30,\"ts\":$NOW}" | jq .

echo "POST events/stock-low"
curl -sS -X POST "$API/events/stock-low" \
  -H 'Content-Type: application/json' \
  -d "{\"storeId\":\"$STORE\",\"skuId\":\"$SKU\",\"current\":25,\"threshold\":30,\"ts\":$NOW}" | jq .

echo "GET inventory"
curl -sS "$API/stores/$STORE/inventory" | jq .

echo "GET orders?status=OPEN"
curl -sS "$API/stores/$STORE/orders?status=OPEN" | jq .
