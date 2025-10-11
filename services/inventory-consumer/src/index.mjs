import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const INVENTORY_TABLE = process.env.INVENTORY_TABLE;

export const handler = async (event) => {
  for (const record of event.Records || []) {
    try {
      const msg = JSON.parse(record.body);
      if (!msg.sku || typeof msg.quantity !== "number") continue;

      await ddb.send(new PutCommand({
        TableName: INVENTORY_TABLE,
        Item: {
          sku: String(msg.sku),
          updatedAt: new Date().toISOString(),
          quantity: msg.quantity
        }
      }));
    } catch (e) {
      console.error("inventory-consumer failed record", e);
      throw e;
    }
  }
  return {};
};
