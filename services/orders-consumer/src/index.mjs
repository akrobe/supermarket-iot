import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const DEDUPE_TABLE = process.env.DEDUPE_TABLE;
const DEDUPE_TTL_HOURS = parseInt(process.env.DEDUPE_TTL_HOURS || "2", 10);

export const handler = async (event) => {
  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body); // { sku, threshold, qty, eventId, ts }
      const nowIso = new Date().toISOString();

      // 1) Idempotency gate
      const expiresAt = Math.floor(Date.now() / 1000) + DEDUPE_TTL_HOURS * 3600;
      await ddb.send(new PutCommand({
        TableName: DEDUPE_TABLE,
        Item: { EventId: msg.eventId, ExpiresAt: expiresAt },
        ConditionExpression: "attribute_not_exists(EventId)"
      }));

      // 2) Create/update OPEN order (alias reserved word "status")
      const orderId = `${msg.sku}#open`;
      await ddb.send(new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        ConditionExpression: "attribute_not_exists(orderId) OR #status = :open",
        UpdateExpression: "SET #status = :open, sku = :sku, qty = if_not_exists(qty, :zero) + :inc, threshold = :th, updatedAt = :now, createdAt = if_not_exists(createdAt, :now)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":open": "OPEN",
          ":sku": msg.sku,
          ":inc": Number(msg.qty ?? 1),
          ":zero": 0,
          ":th": Number(msg.threshold ?? 0),
          ":now": nowIso
        },
        ReturnValues: "ALL_NEW"
      }));

    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        console.info("Duplicate event, skipping", record.messageId);
        continue;
      }
      console.error("orders-consumer failed record", err);
      throw err; // let SQS retry & DLQ on poison
    }
  }
  return { ok: true };
};
