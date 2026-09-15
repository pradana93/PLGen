import app from "../backend/src/index";

// Vercel serverless handler - wraps Express
// All /api/* , /static/* , /check , /scan/* , /uploads/* are handled by Express app
export default app;
