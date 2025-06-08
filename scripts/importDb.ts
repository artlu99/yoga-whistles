import { createClient } from "@libsql/client/web";
import dotenv from "dotenv";
import fs from "node:fs";
import invariant from "tiny-invariant";

const config = dotenv.config({ path: ".env.local" });

invariant(config.parsed?.TURSO_DATABASE_URL, "TURSO_DATABASE_URL is required");
invariant(config.parsed?.TURSO_AUTH_TOKEN, "TURSO_AUTH_TOKEN is required");

const turso = createClient({
	url: config.parsed.TURSO_DATABASE_URL,
	authToken: config.parsed.TURSO_AUTH_TOKEN,
});

const fullCopy = async () => {
	await turso.execute("DROP TABLE IF EXISTS stored_data");

	// apply schema from ./stored_data.sql
	const schema = fs
		.readFileSync("./src/lib/d1.sql", "utf8")
		.split("\n")
		.join(" ");
	if (schema) {
		console.log(schema);
		try {
			await turso.execute(schema);
			console.log("Schema applied");
		} catch (error) {
			console.error(error);
		}
	}

	// assume the script in `package.json` has already exported the data to ./stored_data.sql
	const file = fs.readFileSync("./stored_data.sql", "utf8");
	const sql = file.split("\n");

	// import it into the turso db using liqsql client
	for (const line of sql) {
		if (line.trim() !== "") {
			try {
				const result = await turso.execute(line);
				console.log(result.lastInsertRowid);
			} catch (error) {
				console.error(error);
			}
		}
	}
};

fullCopy();
