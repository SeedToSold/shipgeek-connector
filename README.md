# ShipGeek Connector

Suppliers run this Shopify app on their own infrastructure and embed it in their Shopify admin. ShipGeek calls the connector. It does not install ShipGeek's custom app on the supplier store, and it never receives the supplier's Shopify Admin API token.

The connector can:

- list and read products, variants, and inventory
- create and read orders
- read fulfillment tracking

Read responses leave out customer name, email, phone, and street address. Creating an order still sends a shipping address through to Shopify so the supplier can ship it. That address is not written to the activity log and is not returned by later reads.

`write_orders` includes reading orders, limited to the last 60 days. The app does not request `read_all_orders`, `read_customers`, `write_products`, content, discounts, or shop settings.

## API

Authenticate with `Authorization: Bearer <token>`. Create the token in the embedded app under **Access**. The raw token is shown once. The database stores its SHA-256 hash.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Liveness. No authentication and no shop data. |
| `GET` | `/api/v1/shop` | Shop domain and the connector scope list. |
| `GET` | `/api/v1/products?limit=25&cursor=&q=` | Products. `q` matches title or SKU. |
| `GET` | `/api/v1/products/:id` | One product. `:id` is the numeric Shopify id. |
| `GET` | `/api/v1/orders?limit=25&cursor=&name=&externalId=&fulfillmentStatus=` | Orders, without customer fields. |
| `POST` | `/api/v1/orders` | Create an order. |
| `GET` | `/api/v1/orders/:id` | One order. |
| `GET` | `/api/v1/orders/:id/tracking` | Tracking numbers for an order. |

`fulfillmentStatus` accepts `unfulfilled`, `partial`, `fulfilled`, `scheduled`, or `on_hold`.

Create order:

```json
{
  "externalId": "po-10",
  "currency": "USD",
  "financialStatus": "PAID",
  "retailerOrderId": "700",
  "sourceFulfillmentOrderId": "900",
  "shippingAddress": {
    "firstName": "Ada",
    "lastName": "Lovelace",
    "address1": "1 Analytical Way",
    "city": "London",
    "zip": "SW1A 1AA",
    "countryCode": "GB"
  },
  "lineItems": [
    { "variantId": "123", "quantity": 1, "price": "15.50", "sourceLineItemId": "44" }
  ]
}
```

`externalId` is idempotent. A repeat request returns the existing order. The connector does not email the customer unless `sendReceipt` is `true`. `financialStatus` defaults to `PAID`.

The main ShipGeek app does not call this API yet. Point a supplier connection at `SHOPIFY_APP_URL` plus the token when that client is added.

## Local development

Each supplier creates their own Shopify app in the Dev Dashboard and links this project to it. Do not reuse ShipGeek's existing custom app.

```shell
cd connector
npm install
npm run dev
```

`npm run dev` runs Shopify CLI, which links `shopify.app.toml`, opens a tunnel, and installs the app into the supplier's admin. The embedded pages are Home, Access, and Activity.

```shell
npm test
npm run typecheck
```

## Production

Run the app behind HTTPS. Set:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL` to the public origin, with no trailing path
- `SCOPES` to the scopes in `shopify.app.toml`
- `DATABASE_URL` to a persistent SQLite file, for example `file:/data/connector.sqlite`

In the supplier's Shopify app settings:

- App URL: `https://<host>`
- Allowed redirection URL: `https://<host>/auth/callback`
- Embed app in Shopify admin: on

Then push the scopes and webhook subscriptions:

```shell
npm run deploy
npm run setup
npm run start
```

Docker:

```shell
docker build -t shipgeek-connector .
docker run --rm -p 3000:3000 \
  -e SHOPIFY_API_KEY \
  -e SHOPIFY_API_SECRET \
  -e SHOPIFY_APP_URL \
  -e SCOPES \
  -v connector-data:/data \
  shipgeek-connector
```

The container stores SQLite at `/data/connector.sqlite`. Keep that volume. Uninstalling the app revokes connector tokens and deletes the Shopify session.
