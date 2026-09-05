/**
 * WebSocket registry — the owned replacement for @b/handler/Websocket.
 *
 * The real market/order WS handlers import { hasClients, sendMessageToRoute }
 * from here and also read the `clients` registry directly. The handlers
 * documented the exact shapes they expect:
 *   clients:        Map<route, Map<clientId, { ws, subscriptions: Set<string> }>>
 *   subscriptions:  a Set of JSON.stringify(payload) strings, payload being
 *                   { type, limit?, interval?, symbol }
 *   sendMessageToRoute(route, payload, message): deliver `message` to every
 *                   client on `route` whose subscriptions match `payload`.
 *
 * CommonJS so the compiled (CJS) handlers can `require` it via a module alias.
 */

const clients = new Map();

function ensureRoute(route) {
  if (!clients.has(route)) clients.set(route, new Map());
  return clients.get(route);
}
function addClient(route, id, ws) {
  ensureRoute(route).set(id, { ws, subscriptions: new Set() });
}
function removeClient(route, id) {
  const r = clients.get(route);
  if (r) { r.delete(id); if (r.size === 0) clients.delete(route); }
}

function hasClients(route) {
  return (clients.get(route)?.size ?? 0) > 0;
}

/** Does any of a client's subscriptions match the broadcast payload?
 *
 * Every field the broadcaster names must match. It used to compare a fixed
 * list — type/symbol/interval/limit — which silently ignored any other field.
 * `exchange/order/index.ws.js` broadcasts with `{ userId }` and nothing else,
 * so under the old rule userId was never compared: a client could be handed
 * another account's open orders, and a subscription carrying a type/symbol
 * could never be reached at all. Comparing the payload's own keys fixes both
 * and leaves the market/chart streams matching exactly as before.
 *
 * Deliberately NOT the exact-string match the vendor uses here: the market
 * handler builds its payload as {type, limit?, interval?, symbol} while the
 * browser subscribes in a different key order, so string equality would never
 * match and every chart would go dark. Key order is not meaning. Where the
 * match IS the security boundary — broadcastToSubscribedClients on the
 * binary-order route — exact matching is used instead.
 */
function subscriptionMatches(subscriptions, payload) {
  const keys = Object.keys(payload || {});
  for (const sub of subscriptions) {
    let p;
    try { p = JSON.parse(sub); } catch { continue; }
    if (keys.every((k) => (p[k] ?? undefined) === (payload[k] ?? undefined))) return true;
  }
  return false;
}

function sendMessageToRoute(route, payload, message) {
  const routeClients = clients.get(route);
  if (!routeClients) return;
  const str = JSON.stringify(message);
  for (const record of routeClients.values()) {
    if (subscriptionMatches(record.subscriptions, payload)) {
      try { record.ws.send(str); } catch { /* client gone */ }
    }
  }
}

/* The message broker.
 *
 * `sendMessageToRoute` above matches field-by-field on type/symbol/interval
 * because that is what the market/chart handlers want. The broker below is a
 * different contract and must NOT reuse it: the vendor keys a subscription by
 * the exact `JSON.stringify(payload)` string and matches with `Set.has`, and
 * on the binary-order route that payload carries `userId`. Matching loosely
 * here would deliver one trader's settled order to every other client watching
 * the same symbol, so exact-string matching is the security boundary, not a
 * detail. serve.mjs stores keys in exactly this form (`subscriptions.add(
 * JSON.stringify(msg.payload))`), so the two line up.
 *
 * Reached two ways: the compiled handlers call
 * `Websocket_1.messageBroker.<method>`, while settlement-boot takes the module
 * itself — so both shapes are exported.
 */

function send(record, str, binary) {
  record.ws.send(binary ? Buffer.from(str) : str);
}

function broadcastToSubscribedClients(route, filter, message) {
  const routeClients = clients.get(route);
  if (!routeClients || routeClients.size === 0) return 0;

  const key = JSON.stringify(filter);
  const str = JSON.stringify(message);
  let sent = 0;

  for (const [id, record] of routeClients) {
    if (!record.subscriptions.has(key)) continue;
    try { send(record, str); sent++; } catch { routeClients.delete(id); }
  }

  if (sent === 0) {
    // The vendor logs this too, and it is the one line that tells you whether
    // a missing live update is "nobody connected" or "key did not match".
    const open = [...routeClients].map(([id, r]) => `${id}: [${[...r.subscriptions].join(", ")}]`);
    console.warn(
      `[WS] No matching subscriptions on route ${route} for key: ${key}. ` +
      `Connected clients (${routeClients.size}): ${open.join(" | ")}`
    );
  }
  return sent;
}

function broadcastToRoute(route, message) {
  const routeClients = clients.get(route);
  if (!routeClients) return 0;
  const str = JSON.stringify(message);
  let sent = 0;
  for (const [id, record] of routeClients) {
    try { send(record, str); sent++; } catch { routeClients.delete(id); }
  }
  return sent;
}

function sendToClientOnRoute(route, clientId, message, binary = false) {
  const record = clients.get(route)?.get(clientId);
  if (!record) return false;
  try { send(record, JSON.stringify(message), binary); return true; } catch { return false; }
}

/** The same client id can be on several routes; the vendor sends to all of them. */
function sendToClient(clientId, message, binary = false) {
  const str = JSON.stringify(message);
  let sent = false;
  for (const routeClients of clients.values()) {
    const record = routeClients.get(clientId);
    if (!record) continue;
    try { send(record, str, binary); sent = true; } catch { routeClients.delete(clientId); }
  }
  return sent;
}

const messageBroker = {
  broadcastToSubscribedClients,
  broadcastToRoute,
  sendToClientOnRoute,
  sendToClient,
};

/* handleBroadcastMessage / handleDirectClientMessage.
 *
 * Seven compiled handlers call these — the six admin announcement routes and
 * ending a support chat — and this module exported neither, so each one was a
 * call into `undefined`. Creating an announcement threw instead of publishing.
 *
 * Faithful port of the vendor's processWebSocketMessage: `update` with
 * status===true re-reads the record(s) and republishes them as a create,
 * status===false emits a delete, and anything else emits {id, data}.
 * `@b/utils/query` is required lazily because the module aliases are installed
 * by compat before this file is used, not before it is loaded.
 */
function wsError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function processWebSocketMessage({ type, model, id, data, method, status, sendMessage }) {
  /* `@b/utils/query` is pulled in only on the branches that actually re-read
     records. Requiring it up front would make every call — including the
     common "here is the data already" create — depend on the module aliases
     being installed, for no benefit. */
  const fetchRecords = async (theModel, theId) => {
    if (!theModel) throw wsError(400, "Model is required for update method");
    const { getRecord, getRecords } = require("@b/utils/query");
    if (Array.isArray(theId)) {
      const rows = await getRecords(theModel, theId);
      if (!rows || rows.length === 0) {
        throw wsError(404, `Records with IDs ${theId.join(", ")} not found`);
      }
      return rows;
    }
    const row = await getRecord(theModel, theId);
    if (!row) throw wsError(404, `Record with ID ${theId} not found`);
    return row;
  };

  const asDeletePayload = (theId) =>
    Array.isArray(theId) ? theId.map((one) => ({ id: one })) : { id: theId };

  if (method === "update") {
    if (!id) throw wsError(400, "ID is required for update method");
    if (status === true) sendMessage("create", await fetchRecords(model, id));
    else if (status === false) sendMessage("delete", asDeletePayload(id));
    else sendMessage("update", { id, data });
    return;
  }

  if (method === "create") {
    if (data) { sendMessage("create", data); return; }
    if (!model || !id) {
      throw wsError(400, "Model and ID are required for create method when no data is provided");
    }
    sendMessage("create", await fetchRecords(model, id));
    return;
  }

  if (method === "delete") {
    if (!id) throw wsError(400, "ID is required for delete method");
    sendMessage("delete", asDeletePayload(id));
  }
}

const handleBroadcastMessage = async (msg) =>
  processWebSocketMessage({
    ...msg,
    sendMessage: (method, payload) =>
      broadcastToRoute(msg.route || "/api/user", { type: msg.type, method, payload }),
  });

const handleDirectClientMessage = async (msg) =>
  processWebSocketMessage({
    ...msg,
    sendMessage: (method, payload) =>
      sendToClient(msg.clientId, { type: msg.type, method, payload }),
  });

/* The vendor's own names for registering/removing a client. Nothing in api/**
 * uses them today, but they are part of this module's published surface and
 * costing nothing to keep aligned beats another undefined call later. */
const registerClient = (route, id, ws, subscriptionKey) => {
  addClient(route, id, ws);
  if (subscriptionKey) clients.get(route).get(id).subscriptions.add(subscriptionKey);
};
const deregisterClient = removeClient;
const removeClientSubscription = (route, id, subscriptionKey) => {
  clients.get(route)?.get(id)?.subscriptions.delete(subscriptionKey);
};

module.exports = {
  clients, hasClients, sendMessageToRoute, addClient, removeClient,
  messageBroker,
  broadcastToSubscribedClients, broadcastToRoute, sendToClientOnRoute, sendToClient,
  handleBroadcastMessage, handleDirectClientMessage,
  registerClient, deregisterClient, removeClientSubscription,
};
