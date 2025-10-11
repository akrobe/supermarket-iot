import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const INVENTORY_TABLE = process.env.INVENTORY_TABLE;

export const handler = async (event) => {
  const records = event.Records || [];
  console.log("InventoryConsumer received batch size:", records.length);

  for (const r of records) {
    try {
      const msg = JSON.parse(r.body);
      const { storeId, skuId, current, threshold, ts } = msg;
      if (!storeId || !skuId || typeof current !== "number") {
        console.warn("InventoryConsumer skipped invalid message:", r.body);
        continue;
      }

      await ddb.send(new UpdateCommand({
        TableName: INVENTORY_TABLE,
        Key: { StoreID: storeId, SKU_ID: skuId },
        UpdateExpression: "SET Stock_Level=:s, Threshold=:t, LastUpdateTs=:u",
        ExpressionAttributeValues: {
          ":s": current,
          ":t": typeof threshold === "number" ? threshold : 30,
          ":u": ts ?? Date.now()
        }
      }));
    } catch (e) {
      console.error("InventoryConsumer error on message:", r.body, e);
      throw e; // re-drive → DLQ if poison
    }
  }

  console.log("InventoryConsumer processed", records.length, "messages");
  return {};
};
