import express from "express";
import cors from "cors";
import multer from "multer";
import nodemailer from "nodemailer";
import Papa from "papaparse";
import { PDFDocument, cmyk } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(cors());

app.post(
    "/api/send-certificates",
    upload.fields([
        { name: "template", maxCount: 1 },
        { name: "font", maxCount: 1 },
        { name: "csv", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const templateFile = req.files?.template?.[0];
            if (!templateFile) {
                return res.status(400).json({ error: "Brak szablonu PDF" });
            }

            // People can come either from JSON (preferred) or CSV upload
            let people = [];
            if (req.body.people) {
                people = JSON.parse(req.body.people);
            } else if (req.files?.csv?.[0]) {
                people = parseCsv(req.files.csv[0].buffer.toString("utf8"));
            }

            if (!people.length) {
                return res.status(400).json({ error: "Brak uczestników z adresami e-mail" });
            }

            // Odkomentuj poniższe aby debugować dane SMTP przychodzące z

            //console.log("Otrzymane dane SMTP:", {
            //host: req.body.host,
            //port: req.body.port,
            //user: req.body.user,
            //from: req.body.from,
        //});
        const settings = normalizeSettings(req.body);

            const templateDoc = await PDFDocument.load(templateFile.buffer);
            const fontBytes = req.files?.font?.[0]?.buffer ?? null;

            const { width: pageWidth, height: pageHeight } = templateDoc.getPage(0).getSize();
            const { scaledX, scaledY } = mapToPdfCoords({
                nameX: settings.nameX,
                nameY: settings.nameY,
                previewWidth: settings.previewWidth,
                previewHeight: settings.previewHeight,
                pageWidth,
                pageHeight,
            });

            // Wczytaj domyślną czcionkę jeśli użytkownik nie wgrał własnej
            const defaultFontBytes = fontBytes
                ? null
                : await readFile("./public/fonts/default-font.ttf");

            // measureFont używany w renderCertificate do obliczenia szerokości tekstu per osoba
            const measureDoc = await PDFDocument.create();
            measureDoc.registerFontkit(fontkit);
            const measureFont = await measureDoc.embedFont(
                fontBytes ?? defaultFontBytes,
                { subset: true }
            );

            const summary = { sent: 0, skipped: [], failed: [] };
            const transporter = settings.dryRun
                ? null
                : nodemailer.createTransport({
                      host: settings.smtp.host,
                      port: settings.smtp.port,
                      secure: settings.smtp.secure,
                      auth: settings.smtp.user
                          ? {
                                user: settings.smtp.user,
                                pass: settings.smtp.pass,
                            }
                          : undefined,
                  });

            if (transporter) {
                try {
                    await transporter.verify();
                } catch (smtpError) {
                    return res.status(400).json({
                        error: `Nie można połączyć ze SMTP: ${smtpError.message || smtpError}`,
                    });
                }
            }

            for (const person of people) {

                if (!person.email) {
                    console.log(`Pominięto: ${person.firstName} ${person.lastName} — brak e-mail`);
                    summary.skipped.push({ person, reason: "Brak adresu e-mail" });

                    continue;
                }

                try {
                    const pdfBuffer = await renderCertificate({
                        person,
                        templateDoc,
                        fontBytes: fontBytes ?? defaultFontBytes,
                        settings,
                        measureFont,
                        scaledX,
                        scaledY,
                    });

                    if (!settings.dryRun) {
                        await transporter.sendMail({
                            from: settings.from,
                            to: person.email,
                            subject: applyTemplate(settings.subject, person),
                            text: applyTemplate(settings.body, person),
                            attachments: [
                                {
                                    filename: buildFileName(person),
                                    content: pdfBuffer,
                                    contentType: "application/pdf",
                                },
                            ],
                        });
                    }

                    summary.sent += 1;
                } catch (error) {
                    console.error(`Błąd dla ${person.email}:`, error.message || String(error));
                summary.failed.push({ person, error: error.message || String(error) });
                }
            }

            return res.json(summary);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Błąd serwera" });
        }
    }
);

app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Mail server listening on http://localhost:${PORT}`);
});

function normalizeSettings(body) {
    const num = (value, fallback = 0) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    };

    const port = num(body.port, 587);
    const secure = body.secure === "true" || port === 465;

    return {
        nameX: num(body.nameX),
        nameY: num(body.nameY),
        previewWidth: num(body.previewWidth, 1),
        previewHeight: num(body.previewHeight, 1),
        fontSize: num(body.fontSize, 32),
        align: ["left", "center", "right"].includes(body.align) ? body.align : "center",
        color: body.color || "#000000",
        subject: body.subject || "Certyfikat dla {fullName}",
        body:
            body.body ||
            "Cześć {firstName},\n\nW załączniku znajdziesz swój certyfikat. Daj znać, jeśli coś się nie zgadza.\n\nPozdrawiamy!",
        from: body.from || body.user || "no-reply@example.com",
        dryRun: body.dryRun === "true",
        smtp: {
            host: body.host || "",
            port,
            user: body.user || "",
            pass: body.pass || "",
            secure,
        },
    };
}

function mapToPdfCoords({ nameX, nameY, previewWidth, previewHeight, pageWidth, pageHeight }) {
    const scaledX = (nameX / previewWidth) * pageWidth;
    const scaledY = pageHeight - (nameY / previewHeight) * pageHeight;
    return { scaledX, scaledY };
}

async function renderCertificate({
    person,
    templateDoc,
    fontBytes,
    settings,
    measureFont,
    scaledX,
    scaledY: rawY, // scaledY z mapToPdfCoords traktujemy jako bazę
}) {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const font = await doc.embedFont(fontBytes, { subset: true });

    const [page] = await doc.copyPages(templateDoc, [0]);
    doc.addPage(page);
    const { width: pageWidth, height: pageHeight } = page.getSize();

    const fullName = buildFullName(person);
    const currentWidth = font.widthOfTextAtSize(fullName, settings.fontSize);

    // Przeliczenie paddingów (4px) + ramki (1px)
    const paddingPDF_Y = (5 / settings.previewHeight) * pageHeight;
    const paddingPDF_X = (9 / settings.previewWidth) * pageWidth;

    // Sztywny ułamek 0.87 (idealny środek synchronizujący z przeglądarką)
    const fontBaselineOffset = settings.fontSize * 0.80;

    let setX;
    switch (settings.align) {
        case "left":
            setX = scaledX + paddingPDF_X;
            break;
        case "right":
            setX = scaledX - currentWidth - paddingPDF_X;
            break;
        case "center":
        default:
            setX = scaledX - currentWidth / 2;
            break;
    }

    // Ostateczne Y z uwzględnieniem paddingu i linii bazowej
    const setY = rawY - paddingPDF_Y - fontBaselineOffset;

    page.drawText(fullName, {
        x: setX,
        y: setY,
        size: settings.fontSize,
        font,
        color: hexToCmyk(settings.color),
    });

    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
}

function hexToCmyk(hex) {
    let r = 0, g = 0, b = 0;
    const normalized = hex.startsWith("#") ? hex.slice(1) : hex;

    if (normalized.length === 3) {
        r = parseInt("0x" + normalized[0] + normalized[0]);
        g = parseInt("0x" + normalized[1] + normalized[1]);
        b = parseInt("0x" + normalized[2] + normalized[2]);
    } else if (normalized.length === 6) {
        r = parseInt("0x" + normalized[0] + normalized[1]);
        g = parseInt("0x" + normalized[2] + normalized[3]);
        b = parseInt("0x" + normalized[4] + normalized[5]);
    } else {
        return cmyk(0,0,0,1);
    }

    let c = 1 - r / 255;
    let m = 1 - g / 255;
    let y = 1 - b / 255;
    let k = Math.min(c, Math.min(m, y));

    if (k === 1) return cmyk(0, 0, 0, 1);

    c = (c - k) / (1 - k);
    m = (m - k) / (1 - k);
    y = (y - k) / (1 - k);

    return cmyk(c, m, y, k);
}

function applyTemplate(template, person) {
    const fullName = buildFullName(person);
    return template
        .replace(/\{fullName\}/gi, fullName)
        .replace(/\{firstName\}/gi, person.firstName || "")
        .replace(/\{lastName\}/gi, person.lastName || "")
        .replace(/\{title\}/gi, person.title || "");
}

function buildFullName(person) {
    return [person.title, person.firstName, person.lastName].filter(Boolean).join(" ").trim();
}

function buildFileName(person) {
    const name = [person.firstName, person.lastName].filter(Boolean).join("_");
    return `certyfikat_${name}.pdf`;
}

function parseCsv(csvText) {
    const parsed = Papa.parse(csvText, { skipEmptyLines: true });
    const rows = parsed.data
        .map((row) => (Array.isArray(row) ? row : Object.values(row)))
        .map((cells) => cells.map((c) => String(c ?? "").trim()))
        .filter((cells) => cells.some((c) => c !== ""));

    if (!rows.length) return [];
    const headerLooksValid = looksLikeHeader(rows[0]);
    const headers = headerLooksValid ? rows[0].map((h) => h.toLowerCase()) : [];
    const dataRows = headerLooksValid ? rows.slice(1) : rows;

    const firstIdx = findIndex(headers, firstNameVariants, 0);
    const lastIdx = findIndex(headers, lastNameVariants, 1);
    const emailIdx = findIndex(headers, emailVariants, 2);
    const titleIdx = findIndex(headers, titleVariants, -1);

    return dataRows
        .map((cells) => ({
            firstName: cells[firstIdx] || "",
            lastName: cells[lastIdx] || "",
            email: cells[emailIdx] || "",
            title: titleIdx >= 0 ? (cells[titleIdx] || "") : "",
        }))
        .filter((p) => (p.firstName || p.lastName) && p.email);
}

function looksLikeHeader(cells) {
    const lower = cells.map((c) => c.toLowerCase());
    return lower.some((cell) =>
        [...firstNameVariants, ...lastNameVariants, ...emailVariants].some((variant) => variant === cell)
    );
}

function findIndex(headers, variants, fallback) {
    if (!headers.length) return fallback;
    const idx = headers.findIndex((h) => variants.includes(h.toLowerCase()));
    return idx >= 0 ? idx : fallback;
}

const firstNameVariants = ["firstname", "first_name", "imie", "imię", "given_name", "name"];
const lastNameVariants = ["lastname", "last_name", "nazwisko", "surname"];
const emailVariants = ["email", "mail", "e-mail", "adres", "adres email", "adres_email"];
const titleVariants = ["title", "tytul", "tytuł", "prefix", "degree"];

