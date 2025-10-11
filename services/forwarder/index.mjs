import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});
const INVENTORY_QUEUE_URL = process.env.INVENTORY_QUEUE_URL;
const ORDERS_QUEUE_URL = process.env.ORDERS_QUEUE_URL;

// simple unique id (sufficient for dedupe window)
const simpleId = () => `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

export const handler = async (event) => {
  try {
    // minimal diagnostics
    console.log("EVENT meta:", {
      routeKey: event?.routeKey,
      isBase64: event?.isBase64Encoded,
      target: event?.pathParameters?.target,
      hasInvQ: !!INVENTORY_QUEUE_URL,
      hasOrdQ: !!ORDERS_QUEUE_URL
    });

    const target = event?.pathParameters?.target; // "inventory" | "orders"

    let raw = event?.body || "{}";
    if (event?.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(raw);
    const now = Date.now();

    const items = Array.isArray(parsed) ? parsed : [parsed];
    const entries = items.map((item, idx) => ({
      Id: String(idx),
      MessageBody: JSON.stringify({
        ...item,
        eventId: item.eventId || simpleId(),
        receivedTs: now
      })
    }));

    const queueUrl = target === "orders" ? ORDERS_QUEUE_URL : INVENTORY_QUEUE_URL;
    if (!queueUrl) throw new Error(`Queue URL not set for target=${target}`);

    for (let i = 0; i < entries.length; i += 10) {
      const chunk = entries.slice(i, i + 10);
      const resp = await sqs.send(new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: chunk }));
      if (resp?.Failed?.length) throw new Error(`SQS failed entries: ${JSON.stringify(resp.Failed)}`);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, count: entries.length }) };
  } catch (err) {
    console.error("FORWARDER ERROR:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
