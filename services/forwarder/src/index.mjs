import { SQSClient, SendMessageBatchCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { ulid } from "ulid";

const sqs = new SQSClient({});
const INVENTORY_Q_URL = process.env.INVENTORY_QUEUE_URL;
const ORDERS_Q_URL = process.env.ORDERS_QUEUE_URL;

const toArray = (x) => Array.isArray(x) ? x : [x];

export const handler = async (event) => {
  if (!event || !event.rawPath) return { statusCode: 400, body: "Bad request" };

  const isInventory = event.rawPath.endsWith("/inventory");
  const queueUrl = isInventory ? INVENTORY_Q_URL : ORDERS_Q_URL;

  let body;
  try { body = JSON.parse(event.body || "[]"); }
  catch { return { statusCode: 400, body: "Invalid JSON" }; }

  const items = toArray(body).map((m) => ({
    ...m,
    eventId: m.eventId || ulid(),
    sentAt: new Date().toISOString()
  }));

  // batch up to 10
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    if (batch.length === 1) {
      await sqs.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(batch[0])
      }));
    } else {
      await sqs.send(new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: batch.map((msg, idx) => ({ Id: `${idx}`, MessageBody: JSON.stringify(msg) }))
      }));
    }
  }

  return { statusCode: 200, body: JSON.stringify({ forwarded: items.length }) };
};
