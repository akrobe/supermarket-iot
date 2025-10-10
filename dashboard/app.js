const API_BASE_URL = "https://0485i4jbx0.execute-api.us-east-1.amazonaws.com";

const $ = s => document.querySelector(s);

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function refresh() {
  const store = $('#store').value || 'S1';
  const inv = await fetchJSON(`${API_BASE_URL}/stores/${store}/inventory`);
  const ord = await fetchJSON(`${API_BASE_URL}/stores/${store}/orders?status=OPEN`);
  const tbInv = $('#inv tbody');
  const tbOrd = $('#ord tbody');

  tbInv.innerHTML = (inv.items || []).map(i =>
    `<tr class="${i.Stock_Level < i.Threshold ? 'low':''}">
      <td>${i.SKU_ID}</td>
      <td>${i.Stock_Level}</td>
      <td>${i.Threshold}</td>
      <td>${new Date(i.LastUpdateTs).toLocaleString()}</td>
    </tr>`
  ).join('');

  tbOrd.innerHTML = (ord.items || []).map(o =>
    `<tr>
      <td>${o.Order_ID}</td>
      <td>${o.SKU_ID}</td>
      <td>${o.Quantity}</td>
      <td>${o.Status}</td>
    </tr>`
  ).join('');
}

function setup() {
  $('#refresh').addEventListener('click', () => refresh().catch(console.error));
  const auto = $('#auto');
  let timer = setInterval(() => refresh().catch(console.error), 5000);
  auto.addEventListener('change', () => {
    if (auto.checked) {
      timer = setInterval(() => refresh().catch(console.error), 5000);
    } else {
      clearInterval(timer);
    }
  });
  refresh().catch(console.error);
}

document.addEventListener('DOMContentLoaded', setup);
