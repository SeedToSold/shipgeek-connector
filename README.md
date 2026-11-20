# ShipGeek Connector

Suppliers run this Shopify app on their own infrastructure and embed it in their Shopify admin. It asks Shopify for the same permissions as a ShipGeek supplier custom app. The connector never sends its Shopify Admin API token to ShipGeek.

The connector can:

- create and read orders
- read fulfillment status and tracking

Read responses leave out customer name, email, phone, and street address. Creating an order still sends a shipping address through to Shopify so the supplier can ship it. That address is not written to the activity log and is not returned by later reads.

The app requests `read_assigned_fulfillment_orders`, `write_draft_orders`, `read_draft_orders`, `read_fulfillments`, `read_inventory`, `read_locations`, `read_merchant_managed_fulfillment_orders`, `write_order_edits`, `read_orders`, `write_orders`, `read_products`, `read_shipping`, and `read_third_party_fulfillment_orders`. `write_orders` includes reading orders, limited to the last 60 days. It does not request customer records, all historical orders, or permission to edit products.

## API

Authenticate with `Authorization: Bearer <token>`. Create the token in the embedded app under **Access**. The raw token is shown once. The database stores its SHA-256 hash.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Liveness. No authentication and no shop data. |
| `GET` | `/api/v1/shop` | Shop domain and the scopes Shopify has granted. |
| `GET` | `/api/v1/orders?limit=25&cursor=&name=&externalId=&fulfillmentStatus=` | Orders, without customer fields. |
| `POST` | `/api/v1/orders` | Create an order. |
| `GET` | `/api/v1/orders/:id` | One order. |
| `GET` | `/api/v1/orders/:id/tracking` | Tracking numbers for an order. |
| `POST` | `/api/v1/graphql` | Proxy an order or fulfillment query, or create an order. Other mutations are rejected. |
| `PUT` | `/api/v1/destination` | Tell the connector where to send order and fulfillment webhooks. |
| `POST` | `/webhooks/shopify` | Shopify calls this. The connector signs the payload and forwards it to ShipGeek. |

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

ShipGeek calls this API when a supplier saves a connector. Saving also registers order and fulfillment webhooks and forwards them to ShipGeek.

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
