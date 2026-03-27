import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { getDocument } from "pdfjs-dist";
import "./App.css";
import { PDFDocument, cmyk, PDFFont, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import JSZip from "jszip";

// Configure PDF.js worker (prefer local asset to avoid CDN/CORS issues)
const setPdfWorker = () => {
    // Prefer bundler-provided worker to avoid missing wasm warnings; keep CDN as fallback
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc || `/assets/pdf.worker.min.mjs`;

    if (typeof window !== "undefined") {
        window.addEventListener("error", (event) => {
            const target = event?.target as HTMLScriptElement | undefined;
            if (target?.src?.includes("pdf.worker") && target instanceof HTMLScriptElement) {
                pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs`;
            }
        });
    }
};

setPdfWorker();

interface Person {
    firstName: string;
    lastName: string;
    title?: string;
    email?: string;
}

interface CSVRow {
    [key: string]: string | undefined;
}

// Helper functions for CSV column matching
const firstNameVariants = [
    "firstName",
    "first_name",
    "Imię",
    "imię",
    "imie",
    "name",
    "Name",
    "first",
    "First",
    "given_name",
];
const lastNameVariants = [
    "lastName",
    "last_name",
    "Nazwisko",
    "nazwisko",
    "surname",
    "Surname",
    "family_name",
    "last",
    "Last",
];
const titleVariants = [
    "title",
    "Tytuł",
    "tytuł",
    "tytul",
    "prefix",
    "Prefix",
    "honorific",
    "degree",
];
const emailVariants = [
    "email",
    "Email",
    "E-mail",
    "mail",
    "e-mail",
    "adres",
    "adres email",
    "adres_email",
];

const GLOBAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Function to find which column matches a specific field
const findMatchingColumn = (
    headers: string[],
    variants: string[]
): string | null => {
    for (const header of headers) {
        if (variants.map(v => v.toLowerCase()).includes(header.trim().toLowerCase())) {
            return header;
        }
    }
    return null;
};

// Helper function to convert Hex to CMYK
const hexToCmyk = (hex: string) => {
    let r = 0,
        g = 0,
        b = 0;
    // Handle 3-digit hex
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
    }
    // Handle 6-digit hex
    else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
    }

    // Normalize RGB to 0-1 range
    let c = 1 - r / 255;
    let m = 1 - g / 255;
    let y = 1 - b / 255;

    // Find K (black key)
    const k = Math.min(c, Math.min(m, y));

    // Handle pure black
    if (k === 1) {
        return cmyk(0, 0, 0, 1);
    }

    // Calculate C, M, Y
    c = (c - k) / (1 - k);
    m = (m - k) / (1 - k);
    y = (y - k) / (1 - k);

    return cmyk(c, m, y, k);
};

function App() {
    // File states
    const [pdfTemplate, setPdfTemplate] = useState<File | null>(null);
    const [csvData, setCsvData] = useState<Person[]>([]);
    const [fontFile, setFontFile] = useState<File | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [customFontFamily, setCustomFontFamily] = useState<string>("'DefaultPDF'");
    const [customFontLoaded, setCustomFontLoaded] = useState<boolean>(false);
    const [fontScale, setFontScale] = useState<number>(12);
    const [textColor, setTextColor] = useState<string>("#000000");
    const [colorError, setColorError] = useState<string | null>(null);
    const [textPlacing, setTextPlacing] = useState<string[]>(["center"]);
    const [previewScale, setPreviewScale] = useState<number>(1);

    // Position states
    const [namePosition, setNamePosition] = useState({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [pdfFontSize, setPdfFontSize] = useState<number>(12);

    // Preview refs
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    // Add new state for output format
    const [outputFormat, setOutputFormat] = useState<"single" | "multiple">(
        "single"
    );

    // Help state
    const [showCsvHelp, setShowCsvHelp] = useState<boolean>(false);
    const [showEmailHelp, setShowEmailHelp] = useState<boolean>(false);

    // Mail sending states
    const [smtpHost, setSmtpHost] = useState<string>("smtp.gmail.com");
    const [smtpPort, setSmtpPort] = useState<number>(587);
    const [smtpUser, setSmtpUser] = useState<string>("");
    const [smtpPass, setSmtpPass] = useState<string>("");
    const [smtpFrom, setSmtpFrom] = useState<string>("");
    const [smtpSecure, setSmtpSecure] = useState<boolean>(false);
    const [emailSubject, setEmailSubject] = useState<string>(
        "Certyfikat dla {fullName}"
    );
    const [emailBody, setEmailBody] = useState<string>(
        "WITamy {firstName},\n\nW załączniku znajdziesz swój certyfikat. Daj znać, jeśli coś się nie zgadza."
    );
    const [dryRun, setDryRun] = useState<boolean>(true);
    const [isSending, setIsSending] = useState<boolean>(false);
    const [sendResult, setSendResult] = useState<string | null>(null);

    // Handle PDF template upload
    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPdfTemplate(file);

            // Read the PDF file
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);

            // Create a canvas to render the page
            const rotation = page.rotate ?? 0;
            const viewport = page.getViewport({ scale: 1.5, rotation });

            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            if (context) {
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                };
                await page.render(renderContext).promise;
            } else {
                console.error("Failed to get canvas context");
            }

            // Convert the canvas to a data URL
            const dataUrl = canvas.toDataURL();
            setPdfPreviewUrl(dataUrl);
        }
    };

    // Handle CSV upload
    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            console.log("CSV file selected:", file.name);

            Papa.parse<CSVRow>(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    console.log("Raw CSV data:", results.data);

                    // Get headers
                    const headers = results.meta.fields || [];
                    console.log("CSV headers:", headers);

                    // Find matching columns for each field
                    const firstNameCol = findMatchingColumn(
                        headers,
                        firstNameVariants
                    );
                    const lastNameCol = findMatchingColumn(
                        headers,
                        lastNameVariants
                    );
                    const titleCol = findMatchingColumn(headers, titleVariants);
                    const emailCol = findMatchingColumn(headers, emailVariants);

                    // Check if we need to use default positions
                    const useDefaultPositions = !firstNameCol && !lastNameCol;
                    console.log(
                        "Using default positions:",
                        useDefaultPositions
                    );

                            const persons: Person[] = (results.data as CSVRow[])
                        .filter((row) => {
                            if (useDefaultPositions) {
                                const columns = Object.values(row);
                                return (
                                    columns.length > 0 &&
                                    typeof columns[0] === "string" &&
                                    columns[0].trim() !== ""
                                );
                            }

                            return (
                                (firstNameCol &&
                                    typeof row[firstNameCol] === "string" &&
                                    row[firstNameCol]!.trim() !== "") ||
                                (lastNameCol &&
                                    typeof row[lastNameCol] === "string" &&
                                    row[lastNameCol]!.trim() !== "")
                            );
                        })
                        .map((row) => {
                            if (useDefaultPositions) {
                                const columns = Object.values(row);

                                const firstName = (typeof columns[0] === "string" ? columns[0] : "").trim();
                                const lastName = (columns.length > 1 && typeof columns[1] === "string" ? columns[1] : "").trim();
                                let title = (columns.length > 2 && typeof columns[2] === "string" ? columns[2] : "").trim();

                                let email = "";
                                if (columns.length > 3 && typeof columns[3] === "string") {
                                    email = columns[3].trim();
                                } else if (columns.length > 2 && typeof columns[2] === "string" && GLOBAL_EMAIL_REGEX.test(columns[2])) {
                                    // Backward-compat: 3 kolumny gdzie 3. to e-mail
                                    email = columns[2].trim();
                                    title = "";
                                }

                                return { firstName, lastName, title, email };
                            }

                            return {
                                firstName:
                                    firstNameCol &&
                                        typeof row[firstNameCol] === "string"
                                        ? row[firstNameCol]!.trim()
                                        : "",
                                lastName:
                                    lastNameCol &&
                                        typeof row[lastNameCol] === "string"
                                        ? row[lastNameCol]!.trim()
                                        : "",
                                email: emailCol
                                    ? (row[emailCol] || "").trim()
                                    : "",
                                title: titleCol
                                    ? (row[titleCol] || "").trim()
                                    : "",
                            };
                        })
                        .filter(
                            (person) =>
                                person.firstName !== "" ||
                                person.lastName !== ""
                        );

                    console.log("Final persons array:", persons);
                    if (persons.length === 0) {
                        alert("Plik CSV jest pusty lub nie zawiera imion/nazwisk do wygenerowania.");
                        setCsvData([]);
                        return;
                    }
                    setCsvData(persons);
                },
                error: (error) => {
                    console.error("Error parsing CSV:", error);
                    alert("Error parsing CSV file. Please check the format.");
                },

                //dynamicTyping: true,
                encoding: "utf-8",
            });
        }
    };

    // Handle font upload with preview support
    const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setFontFile(file);

            // Create a unique font family name based on file name
            const fontFamilyName = `custom-font-${Date.now()}`;

            // Load the font for preview
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                if (event.target && event.target.result) {
                    // Create and load the font
                    const fontFace = new FontFace(
                        fontFamilyName,
                        event.target.result as ArrayBuffer
                    );

                    fontFace
                        .load()
                        .then((loadedFont) => {
                            // Add the font to the document
                            document.fonts.add(loadedFont);

                            // Set the font family for the preview
                            setCustomFontFamily(fontFamilyName);
                            setCustomFontLoaded(true);
                            console.log(
                                "Custom font loaded for preview:",
                                fontFamilyName
                            );
                        })
                        .catch((err) => {
                            console.error(
                                "Error loading font for preview:",
                                err
                            );
                            setCustomFontFamily("inherit");
                            setCustomFontLoaded(false);
                        });
                }
            };
            reader.readAsArrayBuffer(file);
        }
    };

    // Mouse handlers for positioning
    const handleMouseDown = (e: React.MouseEvent) => {
        if (previewContainerRef.current) {
            const rect = previewContainerRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
            setNamePosition({ x, y });
            setIsDragging(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && previewContainerRef.current) {
            const rect = previewContainerRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
            setNamePosition({ x, y });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleTextPlacing = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setTextPlacing([e.target.value]);
    };

    // Calculate preview scale when PDF is loaded
    useEffect(() => {
        if (pdfPreviewUrl && previewContainerRef.current) {
            const calculateScale = async () => {
                try {
                    if (!pdfTemplate) return;
                    const arrayBuffer = await pdfTemplate.arrayBuffer();
                    const pdfDoc = await PDFDocument.load(arrayBuffer);
                    const page = pdfDoc.getPage(0);
                    const { width: pdfWidth } = page.getSize();

                    // Get preview width
                    const previewWidth = imgRef.current?.clientWidth || previewContainerRef.current?.clientWidth || 500;

                    // Calculate scale factor
                    const scale = previewWidth / pdfWidth;
                    setPreviewScale(scale);

                    console.log("Scale factor:", scale);
                } catch (error) {
                    console.error("Error calculating scale:", error);
                }
            };

            calculateScale();
        }
    }, [pdfPreviewUrl, pdfTemplate]);

    // Update font scale handler
    const handleFontScale = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSizePt = parseInt(e.target.value);
        setPdfFontSize(newSizePt);

        // Scale the preview font size based on the ratio between preview and PDF dimensions
        const scaleFactor = previewScale || 1;
        setFontScale(Math.round(newSizePt * scaleFactor));
    };

    // Font size
    const handleTextColor = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.trim();
        const hexRegex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

        if (hexRegex.test(value)) {
            setTextColor(value.toUpperCase());
            setColorError(null);
        } else {
            setColorError("Nieprawidłowy kolor. Użyj #RGB lub #RRGGBB.");
        }
    };

    // Recalculate scale when PDF or preview changes (not when font size changes)
    useEffect(() => {
        if (pdfTemplate && previewContainerRef.current) {
            const calculateFontScale = async () => {
                try {
                    const arrayBuffer = await pdfTemplate.arrayBuffer();
                    const pdfDoc = await PDFDocument.load(arrayBuffer);
                    const page = pdfDoc.getPage(0);
                    const { width: pdfWidth } = page.getSize();

                    const previewWidth = imgRef.current?.clientWidth || previewContainerRef.current?.clientWidth || 500;
                    const scaleFactor = previewWidth / pdfWidth;
                    setPreviewScale(scaleFactor);
                } catch (error) {
                    console.error("Error calculating font scale:", error);
                }
            };

            calculateFontScale();

            const handleResize = () => {
                calculateFontScale();
            };

            window.addEventListener("resize", handleResize);
            return () => {
                window.removeEventListener("resize", handleResize);
            };
        }
    }, [pdfTemplate, pdfPreviewUrl]);

    // Sync fontScale whenever pdfFontSize or previewScale changes
    useEffect(() => {
        setFontScale(Math.round(pdfFontSize * (previewScale || 1)));
    }, [pdfFontSize, previewScale]);

    // Add handler for output format change
    const handleOutputFormatChange = (
        e: React.ChangeEvent<HTMLSelectElement>
    ) => {
        setOutputFormat(e.target.value as "single" | "multiple");
    };

    // Update the generatePDFs function to handle both formats
    const generatePDFs = async () => {
        if (!pdfTemplate || csvData.length === 0) {
            alert("Please upload both a PDF template and CSV file");
            return;
        }

        setIsGenerating(true);
        setProgress(0);

        try {
            const templateArrayBuffer = await pdfTemplate.arrayBuffer();
            const templateDoc = await PDFDocument.load(templateArrayBuffer);
            const [templatePage] = await templateDoc.copyPages(templateDoc, [
                0,
            ]);
            const { width: pageWidth, height: pageHeight } =
                templatePage.getSize();

            // Użycie getBoundingClientRect dla uniknięcia błędów zaokrągleń pikseli
            const previewRect = imgRef.current?.getBoundingClientRect();
            if (!previewRect) throw new Error("Preview image not found");
            const previewWidth = previewRect.width;
            const previewHeight = previewRect.height;

            const mergedDoc = await PDFDocument.create();
            mergedDoc.registerFontkit(fontkit);

            let font: PDFFont;
            let cachedFontBytes: ArrayBuffer | null = null; // Inicjalizacja naprawia TS2454

            if (fontFile) {
                try {
                    cachedFontBytes = await fontFile.arrayBuffer();
                    font = await mergedDoc.embedFont(cachedFontBytes, { subset: true });
                } catch { // Usunięcie zmiennej naprawia błąd ESLint (_e is defined but never used)
                    console.error("Error embedding custom font, falling back to default.");
                    const fontResponse = await fetch("/fonts/default-font.ttf");
                    cachedFontBytes = await fontResponse.arrayBuffer();
                    font = await mergedDoc.embedFont(cachedFontBytes, { subset: true });
                }
            } else {
                try {
                    const fontResponse = await fetch("/fonts/default-font.ttf");
                    if (!fontResponse.ok) throw new Error("Default font not found");
                    cachedFontBytes = await fontResponse.arrayBuffer();
                    font = await mergedDoc.embedFont(cachedFontBytes, { subset: true });
                } catch {
                    console.warn("Using Standard Helvetica font as fallback");
                    font = await mergedDoc.embedStandardFont(StandardFonts.Helvetica);
                }
            }

            // OSTATECZNA MATEMATYKA POZYCJONOWANIA
            const paddingPDF_Y = (5 / previewHeight) * pageHeight;
            const paddingPDF_X = (9 / previewWidth) * pageWidth;

            // Sztywny ułamek 0.87 (idealny środek między za wysokim 0.84 a za niskim 0.94)
            const fontBaselineOffset = pdfFontSize * 0.80;

            if (outputFormat === "single") {
                // Generate single merged PDF
                console.log(`Preparing ${csvData.length} pages (batch copy)...`);

                // OPTIMIZATION: Copy all pages in one operation to share resources and reduce file size
                const pageIndices = new Array(csvData.length).fill(0);
                const pages = await mergedDoc.copyPages(templateDoc, pageIndices);

                for (let i = 0; i < csvData.length; i++) {
                    const person = csvData[i];
                    console.log(`Processing winietka ${i + 1}/${csvData.length}: ${[person.title, person.firstName, person.lastName].filter(Boolean).join(" ")}`);

                    // Add the pre-copied page
                    const page = pages[i];
                    mergedDoc.addPage(page);

                    const fullName = [person.title, person.firstName, person.lastName]
                        .filter(Boolean)
                        .join(" ");

                    const currentTextWidth = font.widthOfTextAtSize(
                        fullName,
                        pdfFontSize
                    );

                    const baseScaledX = (namePosition.x / previewWidth) * pageWidth;

                    let setX;
                    if (textPlacing[0] === "center") {
                        setX = baseScaledX - currentTextWidth / 2;
                    } else {
                        setX = baseScaledX + paddingPDF_X;
                    }

                    const setY = pageHeight - (namePosition.y / previewHeight) * pageHeight - paddingPDF_Y - fontBaselineOffset;

                    page.drawText(fullName, {
                        x: setX,
                        y: setY,
                        size: pdfFontSize,
                        font: font,
                        color: hexToCmyk(textColor),
                    });

                    setProgress(Math.round(((i + 1) / csvData.length) * 100));
                }

                console.log("Finished generation loop. Serializing PDF (this may take a moment)...");
                const pdfBytes = await mergedDoc.save();
                console.log(`PDF serialized. Size: ${pdfBytes.byteLength} bytes. Creating Blob...`);
                const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);

                const link = document.createElement("a");
                link.href = url;
                link.download = "winietki.pdf";
                link.click();

                URL.revokeObjectURL(url);
            } else {
                // Generate multiple PDFs in a zip file
                const zip = new JSZip();

                for (let i = 0; i < csvData.length; i++) {
                    const person = csvData[i];
                    console.log(`Creating winietka ${i + 1}/${csvData.length}: ${[person.title, person.firstName, person.lastName].filter(Boolean).join(" ")}`);
                    const singleDoc = await PDFDocument.create();
                    singleDoc.registerFontkit(fontkit);

                    // Wykorzystujemy zbuforowaną czcionkę
                    if (!cachedFontBytes) throw new Error("Błąd ładowania czcionki");
                    const singleFont = await singleDoc.embedFont(cachedFontBytes, { subset: true });

                    // Copy template page
                    const [page] = await singleDoc.copyPages(templateDoc, [0]);
                    singleDoc.addPage(page);

                    const fullName = [
                        person.title,
                        person.firstName,
                        person.lastName,
                    ]
                        .filter(Boolean)
                        .join(" ");

                    // Calculate text width for this specific name
                    const currentTextWidth = singleFont.widthOfTextAtSize(
                        fullName,
                        pdfFontSize
                    );

                    let setX;
                    if (textPlacing[0] === "center") {
                        setX = (namePosition.x / previewWidth) * pageWidth - currentTextWidth / 2;
                    } else {
                        setX = (namePosition.x / previewWidth) * pageWidth + paddingPDF_X;
                    }

                    const setY = pageHeight - (namePosition.y / previewHeight) * pageHeight - paddingPDF_Y - fontBaselineOffset;

                    page.drawText(fullName, {
                        x: setX,
                        y: setY,
                        size: pdfFontSize,
                        font: singleFont,
                        color: hexToCmyk(textColor),
                    });

                    // Save the single PDF
                    const pdfBytes = await singleDoc.save();

                    // Create filename without special characters
                    const fileName =
                        `${person.firstName}_${person.lastName}.pdf`.replace(
                            /\s+/g,
                            "_"
                        );

                    // Add to zip
                    zip.file(fileName, pdfBytes);

                    setProgress(Math.round(((i + 1) / csvData.length) * 100));
                }

                // Generate and download zip file
                const zipBlob = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(zipBlob);

                const link = document.createElement("a");
                link.href = url;
                link.download = "winietki.zip";
                link.click();

                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error("Error generating PDFs:", error);
            alert("Error generating PDFs. Check console for details.");
        } finally {
            setIsGenerating(false);
            setProgress(0);
        }
    };

    const handleSendEmails = async () => {
        if (!pdfTemplate || csvData.length === 0) {
            alert("Dodaj szablon PDF i CSV przed wysyłką");
            return;
        }

        const recipients = csvData.filter((p) => p.email && emailRegex.test(p.email));

        if (recipients.length === 0) {
            alert("Brak adresów e-mail w CSV");
            return;
        }

        if (!previewContainerRef.current) {
            alert("Podgląd nie jest gotowy. Wgraj szablon PDF");
            return;
        }

        // Walidacja wymaganych pól SMTP przed wysyłką
        const missingSmtp: string[] = [];
        if (!smtpHost.trim()) missingSmtp.push("SMTP host");
        if (!smtpPort || smtpPort <= 0) missingSmtp.push("SMTP port");
        if (!smtpUser.trim()) missingSmtp.push("Login (user)");
        if (!smtpPass.trim()) missingSmtp.push("Hasło");
        if (!smtpFrom.trim()) missingSmtp.push("From");

        if (missingSmtp.length > 0) {
            alert(`Uzupełnij wymagane pola SMTP przed wysyłką:\n- ${missingSmtp.join("\n- ")}`);
            return;
        }

        const previewWidth = imgRef.current?.clientWidth || previewContainerRef.current?.clientWidth || 500;
        const previewHeight = imgRef.current?.clientHeight || previewContainerRef.current?.clientHeight || 700;

        setIsSending(true);
        setSendResult(null);

        console.log("Stan SMTP przed wysyłką:", { smtpHost, smtpPort, smtpUser, smtpFrom });


        try {
             const formData = new FormData();
              formData.append("template", pdfTemplate);
            if (fontFile) {
                formData.append("font", fontFile);
            }
            formData.append("people", JSON.stringify(csvData));
            formData.append("nameX", namePosition.x.toString());
            formData.append("nameY", namePosition.y.toString());
            formData.append("previewWidth", previewWidth.toString());
            formData.append("previewHeight", previewHeight.toString());
            formData.append("fontSize", pdfFontSize.toString());
            formData.append("align", textPlacing[0]);
            formData.append("color", textColor);
            formData.append("subject", emailSubject);
            formData.append("body", emailBody);
            formData.append("from", smtpFrom);
            formData.append("host", smtpHost);
            formData.append("port", smtpPort.toString());
            formData.append("user", smtpUser);
            formData.append("pass", smtpPass);
            formData.append("secure", smtpSecure ? "true" : "false");
            formData.append("dryRun", dryRun ? "true" : "false");

            const response = await fetch("/api/send-certificates", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Błąd serwera");
            }

            const result = await response.json();
            const failedList = result.failed
                ?.map((f: { person: { email: string }; error: string }) =>
                    `• ${f.person.email}: ${f.error}`
                ).join("\n") ?? "";
            setSendResult(
                `Wysłano: ${result.sent || 0}, Pominięto: ${result.skipped?.length || 0}, Błędy: ${result.failed?.length || 0}` +
                (failedList ? `\n\n${failedList}` : "")
            );
        } catch (error) {
            console.error("Error sending emails:", error);
            setSendResult((error as Error).message || "Błąd wysyłki");
        } finally {
            setIsSending(false);
        }
    };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipientsWithEmail = csvData.filter(
        (p) => p.email && emailRegex.test(p.email)
    ).length;

    return (
        <div className="app-container">
            <div className="header">
                <div className="greeting">WITaj</div>
                <h1>Uzupełnij swoje grafiki szybko i prosto!</h1>
            </div>

            <div className="main-content">
                <div className="steps-container">
                    <div className="step-card upload-container">
                        <div className="upload-header">
                            <h2>Krok 1:</h2>
                            <p>Prześlij plik z grafiką bazową</p>
                        </div>

                        <div>
                            <label
                                className={`upload-button ${pdfTemplate ? "has-file" : ""
                                    }`}
                                htmlFor="pdfUpload">
                                <span>
                                    {pdfTemplate ? pdfTemplate.name : "Dodaj"}
                                </span>
                                <input
                                    id="pdfUpload"
                                    type="file"
                                    accept=".pdf"
                                    onChange={handlePdfUpload}
                                    disabled={isGenerating}
                                />
                            </label>
                            {pdfTemplate && <div className="step-check">✓</div>}
                            <div className="format-info">
                                Możliwy format: PDF
                            </div>
                        </div>
                    </div>

                    <div className="step-card upload-container">
                        <div>
                            <h2>Krok 2:</h2>
                            <p>
                                Prześlij plik z wartościami, które chcesz
                                wygenerować
                            </p>
                        </div>
                        <div>
                            <label
                                className={`upload-button ${csvData.length > 0 ? "has-file" : ""
                                    }`}
                                htmlFor="csvUpload">
                                <span>
                                    {csvData.length > 0
                                        ? `Załadowano ${csvData.length} wierszy`
                                        : "Dodaj"}
                                </span>
                                <input
                                    id="csvUpload"
                                    type="file"
                                    accept=".csv"
                                    onChange={handleCsvUpload}
                                    disabled={isGenerating}
                                />
                            </label>
                            <div className="format-info">
                                Możliwy format: CSV
                                <span
                                    className="help-icon"
                                    onClick={() =>
                                        setShowCsvHelp((prev) => !prev)
                                    }
                                    onMouseEnter={() => setShowCsvHelp(true)}
                                    onMouseLeave={() => setShowCsvHelp(false)}>
                                    ?
                                </span>
                                {showCsvHelp && (
                                    <div className="help-tooltip">
                                        <h4>
                                            Jak odczytywana jest zawartość CSV?
                                        </h4>
                                        <p>
                                            System rozpoznaje następujące
                                            nagłówki kolumn:
                                        </p>
                                        <ul>
                                            <li>
                                                <strong>Imię:</strong>{" "}
                                                {firstNameVariants.join(", ")}
                                            </li>
                                            <li>
                                                <strong>Nazwisko:</strong>{" "}
                                                {lastNameVariants.join(", ")}
                                            </li>
                                            <li>
                                                <strong> Tytuł (opcjonalny):</strong>{" "}
                                                {titleVariants.join(", ")}
                                            </li>
                                            <li>
                                                <strong>E-mail:</strong>{" "}
                                                {emailVariants.join(", ")}
                                            </li>
                                        </ul>
                                        <p>
                                            Jeśli nagłówki nie zostaną
                                            rozpoznane, system użyje pierwszych
                                            czterech kolumn w kolejności: imię,
                                            nazwisko, tytuł, e-mail. Gdy plik ma
                                            tylko 3 kolumny, trzecia kolumna jest
                                            traktowana jako e-mail (bez tytułu).
                                        </p>
                                        <p>
                                            <strong>Uwaga:</strong> kolumna
                                            e-mail jest wymagana do wysyłki
                                            certyfikatów. Bez niej generowanie
                                            PDF działa normalnie, ale wysyłka
                                            e-mail nie będzie możliwa.
                                        </p>

                                        <table className="csv-example-table">
                                            <caption>
                                                Przykładowy format pliku CSV:
                                            </caption>
                                            <thead>
                                                <tr>
                                                    <th>Imię</th>
                                                    <th>Nazwisko</th>
                                                        <th>Tytuł</th>
                                                        <th>E-mail</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td>Jan</td>
                                                    <td>Kowalski</td>
                                                    <td>mgr</td>
                                                    <td>
                                                        jan.kowalski@example.com
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>Anna</td>
                                                    <td>Nowak</td>
                                                    <td>dr
                                                    </td>
                                                    <td>anna.nowak@example.com</td>
                                                </tr>
                                                <tr>
                                                    <td>Piotr</td>
                                                    <td>Wiśniewski</td>
                                                    <td>prof.</td>
                                                    <td>piotr.w@example.com</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            {csvData.length > 0 && (
                                <div className="step-check">✓</div>
                            )}
                        </div>
                    </div>

                    <div className="step-card">
                        <h2>Krok 3:</h2>
                        <p>Wybierz ustawienia generowanego tekstu</p>
                        <div className="settings-grid">
                            <div className="setting-item">
                                <label>Czcionka</label>
                                <label
                                    className={`upload-button ${fontFile ? "has-file" : ""
                                        }`}
                                    htmlFor="fontUpload">
                                    <span>
                                        {fontFile ? fontFile.name : "Dodaj"}
                                    </span>
                                    <input
                                        id="fontUpload"
                                        type="file"
                                        accept=".ttf"
                                        onChange={handleFontUpload}
                                        disabled={isGenerating}
                                    />
                                </label>
                            </div>
                            <div className="setting-item">
                                <label>Rozmiar tekstu</label>
                                <input
                                    type="number"
                                    min="6"
                                    max="72"
                                    value={pdfFontSize}
                                    onChange={handleFontScale}
                                    disabled={isGenerating}
                                />
                            </div>
                            <div className="setting-item">
                                <label>Kolor tekstu</label>
                                <div style={{ display: "flex", gap: "10px", alignItems: "center", width: "100%" }}>
                                    <input
                                        type="color"
                                        value={textColor}
                                        onChange={handleTextColor}
                                        disabled={isGenerating}
                                        style={{ flex: 1, height: "40px", cursor: "pointer" }}
                                    />
                                    <input
                                        type="text"
                                        value={textColor}
                                        onChange={handleTextColor}
                                        disabled={isGenerating}
                                        placeholder="#000000"
                                        style={{
                                            width: "90px",
                                            flexShrink: 0,
                                            padding: "8px",
                                            borderRadius: "4px",
                                            border: "1px solid #ccc",
                                            textTransform: "uppercase",
                                            textAlign: "center"
                                        }}
                                        maxLength={7}
                                    />
                                </div>
                                {colorError && (
                                    <small style={{ color: "#d14343" }}>{colorError}</small>
                                )}
                            </div>
                        </div>
                        {fontFile && <div className="step-check">✓</div>}
                    </div>

                    <div className="step-card">
                        <h2>Krok 4:</h2>
                        <p>Ustawienia końcowe generowanych PDFów</p>
                        <div className="settings-grid">
                            <div className="setting-item">
                                <label>Wyrównanie tekstu</label>
                                <select
                                    value={textPlacing[0]}
                                    onChange={handleTextPlacing}
                                    disabled={isGenerating}>
                                    <option value="left">Do lewej</option>
                                    <option value="center">Do środka</option>
                                </select>
                            </div>
                            <div className="setting-item">
                                <label>Czy złączyć w 1 plik:</label>
                                <select
                                    value={outputFormat}
                                    onChange={handleOutputFormatChange}
                                    disabled={isGenerating}>
                                    <option value="single">
                                        Jeden plik PDF
                                    </option>
                                    <option value="multiple">
                                        Osobne pliki PDF (ZIP)
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="step-card" style={{ gridColumn: "1 / -1" }}>
                        <h2>Krok 5:</h2>
                        <p>Wysyłka certyfikatów e-mail</p>
                        <div className="format-info" style={{ position: "relative", display: "inline-block" }}>
                            Instrukcja wysyłki
                            <span
                                className="help-icon"
                                onClick={() => setShowEmailHelp((prev) => !prev)}
                                onMouseEnter={() => setShowEmailHelp(true)}
                                onMouseLeave={() => setShowEmailHelp(false)}>
                                ?
                            </span>
                            {showEmailHelp && (
                                <div className="help-tooltip" style={{ width: "360px", right: "auto", left: 0 }}>
                                    <strong>Jak wysłać e-maile?</strong><br /><br />
                                    Aby wysłać certyfikaty, potrzebujesz danych swojego serwera pocztowego (SMTP).<br /><br />

                                    <strong>Skąd wziąć dane SMTP?</strong>
                                    <ul style={{ margin: "0.5rem 0", paddingLeft: "1.2rem" }}>
                                        <li><strong>Outlook/Hotmail:</strong> host: <code>smtp.office365.com</code>, port: <code>587</code>.</li>
                                        <li><strong>nazwa.pl / home.pl:</strong> host znajdziesz w panelu hostingu w sekcji "Poczta".</li>
                                        <li>
                                            <strong>Gmail</strong> — wymaga hasła aplikacji (nie zwykłego hasła):
                                            <ol style={{ margin: "0.4rem 0", paddingLeft: "1.2rem" }}>
                                                <li>Włącz weryfikację dwuetapową (2FA) na <code>myaccount.google.com</code> → Bezpieczeństwo → Weryfikacja dwuetapowa.</li>
                                                <li>Wejdź na <code>myaccount.google.com/apppasswords</code>.</li>
                                                <li>W polu "Nazwa aplikacji" wpisz np. <code>Winietki</code> i kliknij "Utwórz".</li>
                                                <li>Skopiuj wygenerowane hasło w formacie <code>xxxx xxxx xxxx xxxx</code> — Google pokaże je tylko raz.</li>
                                                <li>Użyj tych ustawień: host: <code>smtp.gmail.com</code>, port: <code>587</code>, login: Twój adres Gmail, hasło: skopiowane hasło aplikacji, "Połączenie szyfrowane": odznaczone.</li>
                                            </ol>
                                        </li>
                                    </ul>

                                </div>
                            )}
                        </div>

                        <div className="settings-grid">
                            <div className="setting-item">
                                <label>SMTP host</label>
                                <input
                                    type="text"
                                    placeholder="smtp.example.com"
                                    value={smtpHost}
                                    onChange={(e) => setSmtpHost(e.target.value)}
                                    disabled={isSending}
                                />
                            </div>
                            <div className="setting-item">
                                <label>SMTP port</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={smtpPort}
                                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                                    disabled={isSending}
                                />
                            </div>
                            <div className="setting-item">
                                <label>Login (user)</label>
                                <input
                                    type="text"
                                    placeholder="<adres@domena>"
                                    value={smtpUser}
                                    onChange={(e) => setSmtpUser(e.target.value)}
                                    disabled={isSending}
                                />
                            </div>
                            <div className="setting-item">
                                <label>Hasło</label>
                                <input
                                    type="password"
                                    value={smtpPass}
                                    onChange={(e) => setSmtpPass(e.target.value)}
                                    disabled={isSending}
                                />
                            </div>
                            <div className="setting-item">
                                <label>From</label>
                                <input
                                    type="text"
                                    placeholder="Organizacja <adres@domena>"
                                    value={smtpFrom}
                                    onChange={(e) => setSmtpFrom(e.target.value)}
                                    disabled={isSending}
                                />
                            </div>
                            <div className="setting-item">
                                <label>Połączenie szyfrowane (465)</label>
                                <input
                                    type="checkbox"
                                    checked={smtpSecure}
                                    onChange={(e) => setSmtpSecure(e.target.checked)}
                                    disabled={isSending}
                                />
                            </div>
                            <div className="setting-item" style={{ gridColumn: "1 / span 2" }}>
                                <label>Temat wiadomości</label>
                                <input
                                    type="text"
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                    disabled={isSending}
                                />
                            </div>
                            <div className="setting-item" style={{ gridColumn: "1 / span 2" }}>
                                <label>Treść wiadomości</label>
                                <textarea
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                    rows={4}
                                    disabled={isSending}
                                />
                                <small>
                                    Placeholdery: {"{fullName}"}, {"{title}"}, {"{firstName}"}, {"{lastName}"}
                                </small>
                            </div>
                            <div className="setting-item">
                                <label>Tryb testowy (bez wysyłki)</label>
                                <input
                                    type="checkbox"
                                    checked={dryRun}
                                    onChange={(e) => setDryRun(e.target.checked)}
                                    disabled={isSending}
                                />
                            </div>
                            <div className="setting-item">
                                <label>Odbiorcy z e-mail</label>
                                <div>{recipientsWithEmail} / {csvData.length}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {pdfPreviewUrl && (
                    <div className="preview-section">
                        <h2>Podgląd i pozycjonowanie</h2>
                            <div
                                className="pdf-preview-container"
                                ref={previewContainerRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}>

                            <img
                                ref={imgRef}
                                src={pdfPreviewUrl}
                                className="pdf-preview-img"
                                alt="PDF Preview"
                                style={{ width: "100%", height: "auto" }}
                                draggable="false"
                            />
                            {csvData.length > 0 && (
                                <div
                                    className={`name-preview ${isDragging ? "dragging" : ""
                                        }`}
                                    style={{
                                        left: namePosition.x,
                                        top: namePosition.y,
                                        fontFamily: customFontLoaded
                                            ? customFontFamily
                                            : "'DefaultPDF'", // Poprawka: używamy naszej czcionki z PDF, a nie systemowej
                                        fontSize: `${fontScale}px`,
                                        color: textColor,
                                        transform:
                                            textPlacing[0] === "center"
                                                ? "translate(-50%, 0)"
                                                : "translate(0, 0)",
                                    }}>
                                    {[
                                        csvData[0].title,
                                        csvData[0].firstName,
                                        csvData[0].lastName,
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                </div>
                            )}
                        </div>
                        <div className="action-buttons">
                            <button
                                className="primary-button"
                                onClick={generatePDFs}
                                disabled={
                                    !pdfTemplate ||
                                    csvData.length === 0 ||
                                    isGenerating
                                }>
                                {isGenerating ? "Generowanie..." : "Generuj"}
                            </button>
                            <button
                                className="secondary-button"
                                onClick={handleSendEmails}
                                disabled={
                                    !pdfTemplate ||
                                    recipientsWithEmail === 0 ||
                                    isGenerating ||
                                    isSending
                                }>
                                {isSending
                                    ? "Wysyłanie..."
                                    : dryRun
                                        ? "Wyślij (dry-run)"
                                        : "Wyślij e-maile"}
                            </button>
                        </div>

                        {isGenerating && (
                            <div className="progress-bar-container">
                                <div
                                    className="progress-bar"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}

                        {sendResult && (
                            <div className="status-box">{sendResult}</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
