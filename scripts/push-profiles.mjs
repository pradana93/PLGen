import fs from "fs";
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = "yapfgtmcykstdtprijvp";
const sql = fs.readFileSync("supabase/profiles.sql", "utf-8");
console.log("Profiles SQL length", sql.length);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql })
});
const txt = await res.text();
console.log("Status", res.status);
console.log(txt.slice(0, 2000));
if (!res.ok) process.exit(1);
console.log("PROFILES PUSH SUCCESS");
