import { PDFDocument, cmyk } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Person, PdfGenerationOptions } from "./types";

export function hexToCmyk(hex: string) {
    let r = 0,
        g = 0,
        b = 0;
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
    } else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
    }

    let c = 1 - r / 255;
    let m = 1 - g / 255;
    let y = 1 - b / 255;

    const k = Math.min(c, Math.min(m, y));

    if (k === 1) {
        return cmyk(0, 0, 0, 1);
    }

    c = (c - k) / (1 - k);
    m = (m - k) / (1 - k);
    y = (y - k) / (1 - k);

    return cmyk(c, m, y, k);
}

function buildFullName(person: Person): string {
    return [person.title, person.firstName, person.lastName]
        .filter(Boolean)
        .join(" ");
}

export async function generateSinglePdf(
    options: PdfGenerationOptions,
    onProgress?: (percent: number) => void
): Promise<Uint8Array> {
    const templateDoc = await PDFDocument.load(options.templateBytes);
    const [templatePage] = await templateDoc.copyPages(templateDoc, [0]);
    const { width: pageWidth, height: pageHeight } = templatePage.getSize();

    const mergedDoc = await PDFDocument.create();
    mergedDoc.registerFontkit(fontkit);

    const font = await mergedDoc.embedFont(options.fontBytes, { subset: true });

    // Convert fractional positions to PDF coordinates
    const scaledX = options.positionX * pageWidth;
    const scaledY = pageHeight - options.positionY * pageHeight;

    // Calculate reference text width for alignment
    const firstFullName = buildFullName(options.persons[0]);
    const referenceTextWidth = font.widthOfTextAtSize(
        firstFullName,
        options.fontSize
    );
    const anchorX = scaledX + referenceTextWidth / 2;

    // Batch copy all pages
    const pageIndices = new Array(options.persons.length).fill(0);
    const pages = await mergedDoc.copyPages(templateDoc, pageIndices);

    for (let i = 0; i < options.persons.length; i++) {
        const page = pages[i];
        mergedDoc.addPage(page);

        const fullName = buildFullName(options.persons[i]);
        const currentTextWidth = font.widthOfTextAtSize(
            fullName,
            options.fontSize
        );

        let setX: number;
        if (options.textAlign === "left") {
            setX = anchorX - referenceTextWidth / 2;
        } else {
            setX = anchorX - currentTextWidth / 2;
        }

        page.drawText(fullName, {
            x: setX,
            y: scaledY,
            size: options.fontSize,
            font,
            color: hexToCmyk(options.textColor),
        });

        onProgress?.(Math.round(((i + 1) / options.persons.length) * 100));
    }

    if (options.shouldFlatten) {
        try {
            const form = mergedDoc.getForm();
            form.flatten();
        } catch {
            // No form to flatten
        }
    }

    return mergedDoc.save();
}

export async function generateMultiplePdfs(
    options: PdfGenerationOptions,
    onProgress?: (percent: number) => void
): Promise<Map<string, Uint8Array>> {
    const templateDoc = await PDFDocument.load(options.templateBytes);
    const [templatePage] = await templateDoc.copyPages(templateDoc, [0]);
    const { width: pageWidth, height: pageHeight } = templatePage.getSize();

    const results = new Map<string, Uint8Array>();

    // We need a reference font for anchor calculation
    // Create a temporary doc just to measure
    const tempDoc = await PDFDocument.create();
    tempDoc.registerFontkit(fontkit);
    const tempFont = await tempDoc.embedFont(options.fontBytes, {
        subset: true,
    });

    const scaledX = options.positionX * pageWidth;
    const scaledY = pageHeight - options.positionY * pageHeight;

    const firstFullName = buildFullName(options.persons[0]);
    const referenceTextWidth = tempFont.widthOfTextAtSize(
        firstFullName,
        options.fontSize
    );
    const anchorX = scaledX + referenceTextWidth / 2;

    for (let i = 0; i < options.persons.length; i++) {
        const person = options.persons[i];
        const singleDoc = await PDFDocument.create();
        singleDoc.registerFontkit(fontkit);

        const font = await singleDoc.embedFont(options.fontBytes, {
            subset: true,
        });

        const [page] = await singleDoc.copyPages(templateDoc, [0]);
        singleDoc.addPage(page);

        const fullName = buildFullName(person);
        const currentTextWidth = font.widthOfTextAtSize(
            fullName,
            options.fontSize
        );

        let setX: number;
        if (options.textAlign === "left") {
            setX = anchorX - referenceTextWidth / 2;
        } else {
            setX = anchorX - currentTextWidth / 2;
        }

        page.drawText(fullName, {
            x: setX,
            y: scaledY,
            size: options.fontSize,
            font,
            color: hexToCmyk(options.textColor),
        });

        if (options.shouldFlatten) {
            try {
                const form = singleDoc.getForm();
                form.flatten();
            } catch {
                // No form
            }
        }

        const pdfBytes = await singleDoc.save();
        const fileName = `${person.firstName}_${person.lastName}.pdf`.replace(
            /\s+/g,
            "_"
        );
        results.set(fileName, pdfBytes);

        onProgress?.(Math.round(((i + 1) / options.persons.length) * 100));
    }

    return results;
}
