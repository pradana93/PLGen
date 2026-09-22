import fs from "fs";
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = "yapfgtmcykstdtprijvp";
const schema = fs.readFileSync("supabase/schema.sql", "utf-8");
console.log("Schema length", schema.length);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: schema })
});
const text = await res.text();
console.log("Status", res.status);
console.log(text.slice(0, 2000));
if (!res.ok) process.exit(1);
console.log("SCHEMA PUSH SUCCESS");
