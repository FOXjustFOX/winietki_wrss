import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { generateRouter } from "./routes/generate.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = parseInt(process.env.PORT || "3001", 10);
const isProduction = process.env.NODE_ENV === "production";
app.use(cors());
app.use(express.json());
// API routes
app.use("/api", generateRouter);
if (isProduction) {
    // Serve built frontend
    const distPath = path.resolve(__dirname, "../dist");
    app.use(express.static(distPath));
    // Serve public/fonts for API font resolution
    const fontsPath = path.resolve(__dirname, "../public/fonts");
    app.use("/fonts", express.static(fontsPath));
    // SPA fallback
    app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });
}
app.listen(port, () => {
    console.log(`Server running on port ${port} (${isProduction ? "production" : "development"})`);
});
//# sourceMappingURL=index.js.map