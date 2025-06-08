import { createClient } from "@libsql/client/web";
import type { Env } from "../types";

export const tursoClient = (env: Env) =>
	createClient({
		url: env.TURSO_DATABASE_URL,
		authToken: env.TURSO_AUTH_TOKEN,
	});
