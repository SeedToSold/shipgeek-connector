import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { ensureOrderWebhooks } from "./shipgeek/webhooks.server";

const prismaSessionStorage = new PrismaSessionStorage(prisma);
const persistentSessions = {
  storeSession: prismaSessionStorage.storeSession.bind(prismaSessionStorage),
  loadSession: async (id: string) => {
    const session = await prismaSessionStorage.loadSession(id);
    // The saved token still expires. Treat it as missing so the next admin open
    // exchanges and stores an offline token with no expiry.
    if (session && !session.isOnline && session.expires) session.expires = new Date(0);
    return session;
  },
  deleteSession: prismaSessionStorage.deleteSession.bind(prismaSessionStorage),
  deleteSessions: prismaSessionStorage.deleteSessions.bind(prismaSessionStorage),
  findSessionsByShop: prismaSessionStorage.findSessionsByShop.bind(prismaSessionStorage),
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: persistentSessions,
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: false,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ session, admin }) => {
      const destination = await prisma.webhookDestination.findUnique({ where: { shop: session.shop } });
      if (!destination || !process.env.SHOPIFY_APP_URL) return;
      await ensureOrderWebhooks(admin, process.env.SHOPIFY_APP_URL);
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
