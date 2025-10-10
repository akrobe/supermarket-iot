import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { json, requireFields, ulid } from "./lib.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const INVENTORY_TABLE = process.env.INVENTORY_TABLE;

async function createOpenOrderOnce({ storeId, skuId, current, threshold, ts }) {
  // Check for an existing OPEN order for this SKU to ensure idempotency
  const open = await ddb.send(new QueryCommand({
    TableName: ORDERS_TABLE,
    IndexName: 'OrdersByStoreStatus',
    KeyConditionExpression: 'StoreID = :s AND begins_with(StatusCreated, :open)',
    ExpressionAttributeValues: { ':s': storeId, ':open': 'OPEN#' },
    ProjectionExpression: 'Order_ID, SKU_ID'
  }));
  if ((open.Items || []).some(o => o.SKU_ID === skuId)) return null;

  const id = ulid();
  const item = {
    Order_ID: id,
    StoreID: storeId,
    SKU_ID: skuId,
    Quantity: Math.max(Number(threshold) - Number(current), 1),
    Status: 'OPEN',
    CreatedTs: Number(ts),
    StatusCreated: `OPEN#${Number(ts)}`
  };
  await ddb.send(new PutCommand({ TableName: ORDERS_TABLE, Item: item }));
  return item;
}

export const handler = async (event) => {
  try {
    const { method, path } = event.requestContext.http;

    if (method === 'POST' && path === '/events/stock-low') {
      const body = JSON.parse(event.body || '{}');
      requireFields(body, ['storeId','skuId','current','threshold','ts']);

      const order = await createOpenOrderOnce(body);

      // Keep inventory snapshot consistent
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

      return json(200, { ok: true, created: !!order, order });
    }

    if (method === 'POST' && path.startsWith('/orders/') && path.endsWith('/status')) {
      const orderId = event.pathParameters?.orderId;
      const body = JSON.parse(event.body || '{}');
      requireFields(body, ['status','ts']);
      const status = String(body.status).toUpperCase();
      if (!['PLACED','DELIVERED'].includes(status))
        return json(400, { error: 'Invalid status' });

      const current = await ddb.send(new GetCommand({ TableName: ORDERS_TABLE, Key: { Order_ID: orderId } }));
      if (!current.Item) return json(404, { error: 'Order not found' });

      await ddb.send(new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { Order_ID: orderId },
        UpdateExpression: 'SET #S = :s, #SC = :sc',
        ExpressionAttributeNames: { '#S': 'Status', '#SC': 'StatusCreated' },
        ExpressionAttributeValues: { ':s': status, ':sc': `${status}#${Number(body.ts)}` }
      }));
      return json(200, { ok: true });
    }

    if (method === 'GET' && path.startsWith('/stores/') && path.endsWith('/orders')) {
      const storeId = event.pathParameters?.storeId;
      const status = event.queryStringParameters?.status; // optional
      let expr = 'StoreID = :s';
      let vals = { ':s': storeId };
      if (status) {
        expr += ' AND begins_with(StatusCreated, :st)';
        vals[':st'] = `${status.toUpperCase()}#`;
      }
      const res = await ddb.send(new QueryCommand({
        TableName: ORDERS_TABLE,
        IndexName: 'OrdersByStoreStatus',
        KeyConditionExpression: expr,
        ExpressionAttributeValues: vals
      }));
      return json(200, { items: res.Items ?? [] });
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return json(err.statusCode || 500, { error: err.message || 'Server error' });
  }
};
