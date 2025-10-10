import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { json, requireFields } from "./lib.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const INVENTORY_TABLE = process.env.INVENTORY_TABLE;

export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method;
    const path = event.requestContext?.http?.path;

    if (method === 'POST' && path === '/inventory/update') {
      const body = JSON.parse(event.body || '{}');
      requireFields(body, ['storeId','skuId','current','threshold','ts']);

      await ddb.send(new PutCommand({
        TableName: INVENTORY_TABLE,
        Item: {
          StoreID: body.storeId,
          SKU_ID: body.skuId,
          Stock_Level: Number(body.current),
          Threshold: Number(body.threshold),
          LastUpdateTs: Number(body.ts)
        }
      }));
      return json(200, { ok: true });
    }

    if (method === 'GET' && path.startsWith('/stores/') && path.endsWith('/inventory')) {
      const storeId = event.pathParameters?.storeId;
      if (!storeId) return json(400, { error: 'storeId required' });
      const res = await ddb.send(new QueryCommand({
        TableName: INVENTORY_TABLE,
        KeyConditionExpression: 'StoreID = :s',
        ExpressionAttributeValues: { ':s': storeId }
      }));
      return json(200, { items: res.Items ?? [] });
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return json(err.statusCode || 500, { error: err.message || 'Server error' });
  }
};
