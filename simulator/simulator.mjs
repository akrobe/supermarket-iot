import mqtt from 'mqtt';
import 'dotenv/config';

const brokerUrl = process.env.BROKER_URL || 'mqtt://localhost:1883';
const stores = (process.env.STORE_IDS || 'S1').split(',');
const skus = (process.env.SKU_IDS || 'SKU1,SKU2').split(',');
const interval = Number(process.env.INTERVAL_MS || 1000);
const base = Number(process.env.BASE_STOCK || 100);
const threshold = Number(process.env.THRESHOLD || 30);
const noiseStd = Number(process.env.NOISE_STD || 2);
const drift = Number(process.env.DRIFT || -0.5);

const client = mqtt.connect(brokerUrl);

const state = {};
for (const s of stores) for (const k of skus) state[`${s}/${k}`] = base;

function gaussian(std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * std;
}

client.on('connect', () => {
  console.log('Simulator connected to', brokerUrl);
  setInterval(() => {
    const ts = Date.now();
    for (const s of stores) {
      for (const k of skus) {
        const key = `${s}/${k}`;
        state[key] = Math.max(0, state[key] + drift + gaussian(noiseStd));
        const msg = { storeId: s, skuId: k, current: Math.round(state[key]), threshold, ts };
        const topic = `stores/${s}/sensors/${k}`;
        client.publish(topic, JSON.stringify(msg));
      }
    }
  }, interval);
});
