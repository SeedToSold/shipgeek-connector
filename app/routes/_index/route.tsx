import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>ShipGeek Connector</h1>
        <p className={styles.text}>
          A Shopify app you host yourself. ShipGeek calls this connector for products, orders, and tracking.
        </p>
        {showForm ? (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>example.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        ) : null}
        <ul className={styles.list}>
          <li>
            <strong>Your token stays here.</strong> The Shopify Admin API token is stored on this server.
          </li>
          <li>
            <strong>ShipGeek gets a connector token.</strong> Create it in the embedded app and revoke it any time.
          </li>
          <li>
            <strong>Customer fields stay out of the API.</strong> Reads return catalog, order, and tracking data.
          </li>
        </ul>
      </div>
    </div>
  );
}
