import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const DEDUPE_TABLE = process.env.DEDUPE_TABLE;

export const handler = async (event) => {
  const now = Date.now();
  const records = event.Records || [];
  console.log("OrdersConsumer received batch size:", records.length);

  for (const r of records) {
    try {
      const msg = JSON.parse(r.body);
      const { storeId, skuId, current, threshold, ts, eventId } = msg;

      if (!storeId || !skuId || typeof current !== "number") {
        console.warn("OrdersConsumer skipped invalid message:", r.body);
        continue;
      }

      const thr = typeof threshold === "number" ? threshold : 30;
      if (current >= thr) {
        console.log("OrdersConsumer no-op (not low-stock) for", storeId, skuId, current, thr);
        continue;
      }

      // Strong idempotency claim
      const expiresAt = Math.floor(now / 1000) + 2 * 3600; // 2h TTL
      await ddb.send(new PutCommand({
        TableName: DEDUPE_TABLE,
        Item: { EventId: eventId || `${storeId}#${skuId}#${ts || now}`, ExpiresAt: expiresAt },
        ConditionExpression: "attribute_not_exists(EventId)"
      }));

      // Create OPEN order
      const qty = Math.max(thr - current, 1);
      const orderId = ulid();
      await ddb.send(new PutCommand({
        TableName: ORDERS_TABLE,
        Item: {
          Order_ID: orderId,
          StoreID: storeId,
          SKU_ID: skuId,
          Quantity: qty,
          Status: "OPEN",
          CreatedTs: ts || now,
          StatusCreated: `OPEN#${ts || now}`
        },
        ConditionExpression: "attribute_not_exists(Order_ID)"
      }));

      console.log("OrdersConsumer created OPEN order", orderId, "for", storeId, skuId, "qty", qty);

    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        console.log("OrdersConsumer duplicate event suppressed");
        continue;
      }
      console.error("OrdersConsumer error on message:", r.body, e);
      throw e; // retry → DLQ on poison
    }
  }

  console.log("OrdersConsumer processed", records.length, "messages");
  return {};
};
