import dotenv from "dotenv";
dotenv.config();
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mysql from "mysql2/promise";
// Create server instance
const server = new McpServer({
    name: "Access MySQL",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
});
// MySQL connection pool
const dbPool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USERNAME || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "ximply_b2b",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
// MCP tool: get-users
server.tool("access-mysql", "Access MySQL database", {
    query: z.string().describe("SQL query to execute"),
}, async ({ query }) => {
    try {
        const [rows] = await dbPool.query(query);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(rows, null, 2),
                },
            ],
        };
    }
    catch (err) {
        return {
            content: [
                {
                    type: "text",
                    text: `Database error: ${err}`,
                },
            ],
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Weather MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
