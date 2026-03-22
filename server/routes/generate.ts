import { Router } from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import { parseCsvString } from "../../src/shared/csv-parser.js";
import { AVAILABLE_FONTS } from "../../src/shared/constants.js";
import {
    generateSinglePdf,
    generateMultiplePdfs,
} from "../../src/shared/pdf-generator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

export const generateRouter = Router();

generateRouter.post(
    "/generate",
    upload.fields([
        { name: "template", maxCount: 1 },
        { name: "csv", maxCount: 1 },
        { name: "font", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const files = req.files as {
                [fieldname: string]: Express.Multer.File[];
            };

            if (!files.template?.[0] || !files.csv?.[0]) {
                res.status(400).json({
                    error: "Both template (PDF) and csv files are required",
                });
                return;
            }

            const templateBytes = new Uint8Array(files.template[0].buffer);
            const csvContent = files.csv[0].buffer.toString("utf-8");

            const persons = parseCsvString(csvContent);
            if (persons.length === 0) {
                res.status(400).json({
                    error: "No valid person data found in CSV",
                });
                return;
            }

            // Resolve font
            let fontBytes: Uint8Array;
            const fontName = (req.body.fontName as string) || AVAILABLE_FONTS[0].name;

            if (fontName === "Custom" && files.font?.[0]) {
                fontBytes = new Uint8Array(files.font[0].buffer);
            } else {
                const fontConfig =
                    AVAILABLE_FONTS.find((f) => f.name === fontName) ||
                    AVAILABLE_FONTS[0];
                // Resolve font path relative to project root
                const fontsDir = path.resolve(__dirname, "../../public/fonts");
                const fontFileName = path.basename(fontConfig.path);
                const fontPath = path.join(fontsDir, fontFileName);
                const fontBuffer = await fs.readFile(fontPath);
                fontBytes = new Uint8Array(fontBuffer);
            }

            const fontSize = parseFloat(req.body.fontSize) || 12;
            const textColor = (req.body.textColor as string) || "#000000";
            const textAlign =
                (req.body.textAlign as "left" | "center") || "center";
            const positionX = parseFloat(req.body.positionX) || 0.5;
            const positionY = parseFloat(req.body.positionY) || 0.5;
            const outputFormat =
                (req.body.outputFormat as "single" | "multiple") || "single";
            const shouldFlatten = req.body.flatten === "true";

            const options = {
                templateBytes,
                persons,
                fontBytes,
                fontSize,
                textColor,
                textAlign,
                positionX,
                positionY,
                outputFormat,
                shouldFlatten,
            };

            if (outputFormat === "single") {
                const pdfBytes = await generateSinglePdf(options);
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader(
                    "Content-Disposition",
                    'attachment; filename="winietki.pdf"'
                );
                res.send(Buffer.from(pdfBytes));
            } else {
                const pdfs = await generateMultiplePdfs(options);
                const zip = new JSZip();
                for (const [fileName, bytes] of pdfs) {
                    zip.file(fileName, bytes);
                }
                const zipBuffer = await zip.generateAsync({
                    type: "nodebuffer",
                });
                res.setHeader("Content-Type", "application/zip");
                res.setHeader(
                    "Content-Disposition",
                    'attachment; filename="winietki.zip"'
                );
                res.send(zipBuffer);
            }
        } catch (error) {
            console.error("Error generating PDFs:", error);
            res.status(500).json({
                error: "Failed to generate PDFs",
                details: error instanceof Error ? error.message : String(error),
            });
        }
    }
);
