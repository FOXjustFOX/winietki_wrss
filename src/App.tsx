import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { getDocument } from "pdfjs-dist";
import "./App.css";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import JSZip from "jszip";
import type { Person, CSVRow } from "./shared/types";
import {
    AVAILABLE_FONTS,
    findMatchingColumn,
    firstNameVariants,
    lastNameVariants,
    titleVariants,
} from "./shared/constants";
import {
    generateSinglePdf,
    generateMultiplePdfs,
} from "./shared/pdf-generator";

// Configure PDF.js worker with fallback for offline use

// still in the making

const setPdfWorker = () => {
    try {
        // Fall back to CDN if local worker fails
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.0.375/pdf.worker.min.mjs`;
    } catch {
        console.warn(
            "Could not load remote PDF.js worker, trying local fallback...",
        );
        // Try to use local worker first (needs to be in public directory)
        pdfjs.GlobalWorkerOptions.workerSrc = `/assets/pdf.worker.min.mjs`;
    }
};

// Initialize the worker
setPdfWorker();

function App() {
    // File states
    const [pdfTemplate, setPdfTemplate] = useState<File | null>(null);
    const [csvData, setCsvData] = useState<Person[]>([]);
    const [fontFile, setFontFile] = useState<File | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [activeFontFamily, setActiveFontFamily] = useState<string>("inherit");
    const [fontScale, setFontScale] = useState<number>(12);
    const [textColor, setTextColor] = useState<string>("#000000");
    const [textPlacing, setTextPlacing] = useState<string[]>(["center"]);
    const [previewScale, setPreviewScale] = useState<number>(1);
    const [selectedFont, setSelectedFont] = useState<string>(
        AVAILABLE_FONTS[0].name,
    );
    const [curlCopied, setCurlCopied] = useState<boolean>(false);
    const [curlCommand, setCurlCommand] = useState<string | null>(null);
    const loadedFontsRef = useRef<Set<string>>(new Set());

    // Position states
    const [namePosition, setNamePosition] = useState({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [pdfFontSize, setPdfFontSize] = useState<number>(12);

    // Preview refs
    const previewRef = useRef<HTMLImageElement>(null);

    // Add new state for output format
    const [outputFormat, setOutputFormat] = useState<"single" | "multiple">(
        "single",
    );

    // Help state
    const [showCsvHelp, setShowCsvHelp] = useState<boolean>(false);

    // Flatten state
    const [shouldFlatten, setShouldFlatten] = useState<boolean>(false);

    // Drag states
    const [isDragActive, setIsDragActive] = useState<boolean>(false);
    const [isPdfDragActive, setIsPdfDragActive] = useState<boolean>(false);
    const [isCsvDragActive, setIsCsvDragActive] = useState<boolean>(false);
    const [globalDragType, setGlobalDragType] = useState<
        "pdf" | "csv" | "font" | null
    >(null);

    // Load built-in font for preview when selectedFont changes
    useEffect(() => {
        if (selectedFont === "Custom") return;

        const fontConfig = AVAILABLE_FONTS.find((f) => f.name === selectedFont);
        if (!fontConfig) return;

        const fontFamilyName = `builtin-${selectedFont.replace(/\s+/g, "-").toLowerCase()}`;

        // If we already loaded this font, just set it active
        if (loadedFontsRef.current.has(fontFamilyName)) {
            setActiveFontFamily(fontFamilyName);
            return;
        }

        fetch(fontConfig.path)
            .then((res) => res.arrayBuffer())
            .then((buffer) => {
                const fontFace = new FontFace(fontFamilyName, buffer);
                return fontFace.load();
            })
            .then((loaded) => {
                document.fonts.add(loaded);
                loadedFontsRef.current.add(fontFamilyName);
                setActiveFontFamily(fontFamilyName);
            })
            .catch((err) => {
                console.error("Error loading built-in font for preview:", err);
                setActiveFontFamily("inherit");
            });
    }, [selectedFont]);

    // Helper to detect file type from drag event
    const getFileTypeFromDrag = (
        e: React.DragEvent,
    ): "pdf" | "csv" | "font" | null => {
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            const item = e.dataTransfer.items[0];
            if (item.type === "application/pdf") return "pdf";
            if (
                item.type === "text/csv" ||
                item.type === "application/vnd.ms-excel"
            )
                return "csv";
            if (
                item.type === "font/ttf" ||
                item.type === "font/sfnt" ||
                item.type === "application/x-font-ttf" ||
                item.type === ""
            ) {
                const types = Array.from(e.dataTransfer.types);
                if (types.includes("Files")) {
                    return null;
                }
            }
        }
        return null;
    };

    // Helper functions for file processing
    const processPdfFile = async (file: File) => {
        setPdfTemplate(file);
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
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
            setPdfPreviewUrl(canvas.toDataURL());
        }
    };

    const processCsvFile = (file: File) => {
        Papa.parse<CSVRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const headers = results.meta.fields || [];
                const firstNameCol = findMatchingColumn(
                    headers,
                    firstNameVariants,
                );
                const lastNameCol = findMatchingColumn(
                    headers,
                    lastNameVariants,
                );
                const titleCol = findMatchingColumn(headers, titleVariants);
                const useDefaultPositions = !firstNameCol && !lastNameCol;

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
                            (firstNameCol && row[firstNameCol]?.trim()) ||
                            (lastNameCol && row[lastNameCol]?.trim())
                        );
                    })
                    .map((row) => {
                        if (useDefaultPositions) {
                            const columns = Object.values(row);
                            return {
                                firstName: (typeof columns[0] === "string"
                                    ? columns[0]
                                    : ""
                                ).trim(),
                                lastName: (columns.length > 1 &&
                                typeof columns[1] === "string"
                                    ? columns[1]
                                    : ""
                                ).trim(),
                                title: (columns.length > 2 &&
                                typeof columns[2] === "string"
                                    ? columns[2]
                                    : ""
                                ).trim(),
                            };
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
                            title: titleCol ? (row[titleCol] || "").trim() : "",
                        };
                    })
                    .filter(
                        (person) =>
                            person.firstName !== "" || person.lastName !== "",
                    );
                setCsvData(persons);
            },
            error: () => alert("Error parsing CSV file."),
            dynamicTyping: true,
            encoding: "utf-8",
        });
    };

    const processFontFile = (file: File) => {
        setFontFile(file);
        setSelectedFont("Custom");
        const fontFamilyName = `custom-font-${Date.now()}`;
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                const fontFace = new FontFace(
                    fontFamilyName,
                    event.target.result as ArrayBuffer,
                );
                fontFace
                    .load()
                    .then((loaded) => {
                        document.fonts.add(loaded);
                        setActiveFontFamily(fontFamilyName);
                    })
                    .catch(() => {
                        setActiveFontFamily("inherit");
                    });
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Generic Drag Handlers
    const handleDrag = (
        e: React.DragEvent,
        setDragActiveState: (active: boolean) => void,
        type: "pdf" | "csv" | "font",
    ) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActiveState(true);
            const detectedType = getFileTypeFromDrag(e);
            if (detectedType) {
                setGlobalDragType(detectedType);
            } else {
                setGlobalDragType(type);
            }
        } else if (e.type === "dragleave") {
            setDragActiveState(false);
        }
    };

    const handleDrop = (
        e: React.DragEvent,
        setDragActiveState: (active: boolean) => void,
        type: "pdf" | "csv" | "font",
    ) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActiveState(false);
        setGlobalDragType(null);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (type === "pdf" && file.name.toLowerCase().endsWith(".pdf")) {
                processPdfFile(file);
            } else if (
                type === "csv" &&
                file.name.toLowerCase().endsWith(".csv")
            ) {
                processCsvFile(file);
            } else if (
                type === "font" &&
                file.name.toLowerCase().endsWith(".ttf")
            ) {
                processFontFile(file);
            } else {
                alert(
                    `Proszę przesłać poprawny plik dla formatu .${type === "font" ? "ttf" : type}`,
                );
            }
        }
    };

    // Handle inputs
    const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0])
            processPdfFile(e.target.files[0]);
    };
    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0])
            processCsvFile(e.target.files[0]);
    };
    const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0])
            processFontFile(e.target.files[0]);
    };

    // Mouse handlers for positioning
    const handleMouseDown = (e: React.MouseEvent) => {
        if (previewRef.current) {
            const rect = previewRef.current.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
            setNamePosition({ x, y });
            setIsDragging(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && previewRef.current) {
            const rect = previewRef.current.getBoundingClientRect();
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
        if (pdfPreviewUrl && previewRef.current) {
            const calculateScale = async () => {
                try {
                    if (!pdfTemplate) return;
                    const arrayBuffer = await pdfTemplate.arrayBuffer();
                    const pdfDoc = await PDFDocument.load(arrayBuffer);
                    const page = pdfDoc.getPage(0);
                    const { width: pdfWidth } = page.getSize();

                    const previewWidth = previewRef.current?.clientWidth || 500;

                    const scale = previewWidth / pdfWidth;
                    setPreviewScale(scale);
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

        const scaleFactor = previewScale || 1;
        setFontScale(Math.round(newSizePt * scaleFactor));
    };

    // Font size
    const handleTextColor = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTextColor(e.target.value);
    };

    // Improve the useEffect that calculates font scale factors
    useEffect(() => {
        if (pdfTemplate && previewRef.current) {
            const calculateFontScale = async () => {
                try {
                    const arrayBuffer = await pdfTemplate.arrayBuffer();
                    const pdfDoc = await PDFDocument.load(arrayBuffer);
                    const page = pdfDoc.getPage(0);
                    const { width: pdfWidth } = page.getSize();

                    const previewWidth = previewRef.current?.clientWidth || 500;

                    const scaleFactor = previewWidth / pdfWidth;
                    setPreviewScale(scaleFactor);

                    setPdfFontSize((prevSize) => {
                        setFontScale(Math.round(prevSize * scaleFactor));
                        return prevSize;
                    });
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
    }, [pdfTemplate, pdfPreviewUrl, pdfFontSize]);

    // Add handler for output format change
    const handleOutputFormatChange = (
        e: React.ChangeEvent<HTMLSelectElement>,
    ) => {
        setOutputFormat(e.target.value as "single" | "multiple");
    };

    // Resolve font bytes for PDF generation
    const resolveFontBytes = async (): Promise<ArrayBuffer> => {
        if (selectedFont === "Custom" && fontFile) {
            return fontFile.arrayBuffer();
        }
        const fontConfig =
            AVAILABLE_FONTS.find((f) => f.name === selectedFont) ||
            AVAILABLE_FONTS[0];
        const response = await fetch(fontConfig.path);
        return response.arrayBuffer();
    };

    // Build curl command from current settings
    const buildCurlCommand = async (): Promise<string> => {
        const previewWidth = previewRef.current?.clientWidth ?? 500;
        const previewHeight = previewRef.current?.clientHeight ?? 700;

        let posX = 0.5;
        let posY = 0.5;

        if (pdfTemplate) {
            const templateBytes = await pdfTemplate.arrayBuffer();
            const templateDoc = await PDFDocument.load(templateBytes);
            const page = templateDoc.getPage(0);
            const { width: pageWidth, height: pageHeight } = page.getSize();

            const absX = (namePosition.x / previewWidth) * pageWidth + 5;
            const absY = (namePosition.y / previewHeight) * pageHeight + 17;
            posX = Math.round((absX / pageWidth) * 10000) / 10000;
            posY = Math.round((absY / pageHeight) * 10000) / 10000;
        }

        const outputExt = outputFormat === "single" ? "pdf" : "zip";
        const lines = [
            `curl -X POST "$BASE_URL/api/generate" \\`,
            `  -F "template=@template.pdf" \\`,
            `  -F "csv=@winietki.csv" \\`,
            ...(selectedFont === "Custom" && fontFile
                ? [`  -F "font=@${fontFile.name}" \\`]
                : []),
            `  -F "fontName=${selectedFont === "Custom" ? "Custom" : selectedFont}" \\`,
            `  -F "fontSize=${pdfFontSize}" \\`,
            `  -F "textColor=${textColor}" \\`,
            `  -F "textAlign=${textPlacing[0]}" \\`,
            `  -F "positionX=${posX}" \\`,
            `  -F "positionY=${posY}" \\`,
            `  -F "outputFormat=${outputFormat}" \\`,
            `  -F "flatten=${shouldFlatten}" \\`,
            `  -o "output.${outputExt}"`,
        ];

        return lines.join("\n");
    };

    const showCurlCommand = async () => {
        const cmd = await buildCurlCommand();
        setCurlCommand(cmd);
    };

    const confirmCopyCurl = async () => {
        if (!curlCommand) return;
        await navigator.clipboard.writeText(curlCommand);
        setCurlCopied(true);
        setTimeout(() => {
            setCurlCopied(false);
            setCurlCommand(null);
        }, 1500);
    };

    // Generate PDFs using shared module
    const generatePDFs = async () => {
        if (!pdfTemplate || csvData.length === 0) {
            alert("Please upload both a PDF template and CSV file");
            return;
        }

        setIsGenerating(true);
        setProgress(0);

        try {
            const templateBytes = await pdfTemplate.arrayBuffer();
            const fontBytes = await resolveFontBytes();

            const previewWidth = previewRef.current?.clientWidth ?? 500;
            const previewHeight = previewRef.current?.clientHeight ?? 700;

            // Convert pixel position to fraction + apply the padding/offset adjustments
            // that were in the original code
            const templateDoc = await PDFDocument.load(templateBytes);
            const page = templateDoc.getPage(0);
            const { width: pageWidth, height: pageHeight } = page.getSize();

            const positionX = (namePosition.x / previewWidth) * pageWidth + 5;
            const positionY =
                (namePosition.y / previewHeight) * pageHeight + 17;

            const options = {
                templateBytes: new Uint8Array(templateBytes),
                persons: csvData,
                fontBytes: new Uint8Array(fontBytes),
                fontSize: pdfFontSize,
                textColor,
                textAlign: textPlacing[0] as "left" | "center",
                positionX: positionX / pageWidth,
                positionY: positionY / pageHeight,
                outputFormat,
                shouldFlatten,
            };

            if (outputFormat === "single") {
                const pdfBytes = await generateSinglePdf(options, setProgress);
                const blob = new Blob([pdfBytes.buffer as ArrayBuffer], {
                    type: "application/pdf",
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "winietki.pdf";
                link.click();
                URL.revokeObjectURL(url);
            } else {
                const pdfs = await generateMultiplePdfs(options, setProgress);
                const zip = new JSZip();
                for (const [fileName, bytes] of pdfs) {
                    zip.file(fileName, bytes);
                }
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

    return (
        <div className="app-container">
            <div className="header">
                <div className="greeting">Cześć</div>
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
                                className={`upload-button ${pdfTemplate ? "has-file" : ""} ${isPdfDragActive ? "drag-active" : ""}${globalDragType && globalDragType !== "pdf" ? " drag-disabled" : ""}`}
                                htmlFor="pdfUpload"
                                onDragEnter={(e) =>
                                    handleDrag(e, setIsPdfDragActive, "pdf")
                                }
                                onDragLeave={(e) =>
                                    handleDrag(e, setIsPdfDragActive, "pdf")
                                }
                                onDragOver={(e) =>
                                    handleDrag(e, setIsPdfDragActive, "pdf")
                                }
                                onDrop={(e) =>
                                    handleDrop(e, setIsPdfDragActive, "pdf")
                                }>
                                <span>
                                    {isPdfDragActive
                                        ? "Upuść tutaj"
                                        : pdfTemplate
                                          ? pdfTemplate.name
                                          : "Dodaj"}
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
                                className={`upload-button ${csvData.length > 0 ? "has-file" : ""} ${isCsvDragActive ? "drag-active" : ""}${globalDragType && globalDragType !== "csv" ? " drag-disabled" : ""}`}
                                htmlFor="csvUpload"
                                onDragEnter={(e) =>
                                    handleDrag(e, setIsCsvDragActive, "csv")
                                }
                                onDragLeave={(e) =>
                                    handleDrag(e, setIsCsvDragActive, "csv")
                                }
                                onDragOver={(e) =>
                                    handleDrag(e, setIsCsvDragActive, "csv")
                                }
                                onDrop={(e) =>
                                    handleDrop(e, setIsCsvDragActive, "csv")
                                }>
                                <span>
                                    {isCsvDragActive
                                        ? "Upuść tutaj"
                                        : csvData.length > 0
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
                                                <strong>
                                                    Tytuł (opcjonalny):
                                                </strong>{" "}
                                                {titleVariants.join(", ")}
                                            </li>
                                        </ul>
                                        <p>
                                            Jeśli nagłówki nie zostaną
                                            rozpoznane, system użyje pierwszej,
                                            drugiej i trzeciej kolumny jako
                                            odpowiednio: imię, nazwisko i tytuł.
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
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td>Jan</td>
                                                    <td>Kowalski</td>
                                                    <td>mgr</td>
                                                </tr>
                                                <tr>
                                                    <td>Anna</td>
                                                    <td>Nowak</td>
                                                    <td>dr</td>
                                                </tr>
                                                <tr>
                                                    <td>Piotr</td>
                                                    <td>Wiśniewski</td>
                                                    <td>prof.</td>
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
                                <select
                                    value={selectedFont}
                                    onChange={(e) =>
                                        setSelectedFont(e.target.value)
                                    }
                                    disabled={isGenerating}
                                    style={{ marginBottom: "10px" }}>
                                    {AVAILABLE_FONTS.map((font) => (
                                        <option
                                            key={font.name}
                                            value={font.name}>
                                            {font.name}
                                        </option>
                                    ))}
                                    <option value="Custom">
                                        Własna (.ttf)
                                    </option>
                                </select>

                                <label
                                    className={`upload-button ${fontFile ? "has-font-file" : ""} ${isDragActive ? "drag-active" : ""}${globalDragType && globalDragType !== "font" ? " drag-disabled" : ""}`}
                                    htmlFor="fontUpload"
                                    title="Prześlij plik, aby przełączyć na czcionkę własną"
                                    onDragEnter={(e) =>
                                        handleDrag(e, setIsDragActive, "font")
                                    }
                                    onDragLeave={(e) =>
                                        handleDrag(e, setIsDragActive, "font")
                                    }
                                    onDragOver={(e) =>
                                        handleDrag(e, setIsDragActive, "font")
                                    }
                                    onDrop={(e) =>
                                        handleDrop(e, setIsDragActive, "font")
                                    }
                                    style={{
                                        opacity:
                                            (selectedFont === "Custom" ||
                                                isDragActive) &&
                                            !(
                                                globalDragType &&
                                                globalDragType !== "font"
                                            )
                                                ? 1
                                                : 0.6,
                                        transition: "all 0.2s ease",
                                    }}>
                                    <span>
                                        {isDragActive
                                            ? "Upuść tutaj"
                                            : fontFile
                                              ? fontFile.name
                                              : "Prześlij/Upuść .ttf"}
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
                                <div
                                    style={{
                                        display: "flex",
                                        gap: "10px",
                                        alignItems: "center",
                                        width: "100%",
                                    }}>
                                    <input
                                        type="color"
                                        value={textColor}
                                        onChange={handleTextColor}
                                        disabled={isGenerating}
                                        style={{
                                            flex: 1,
                                            height: "40px",
                                            cursor: "pointer",
                                        }}
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
                                            textAlign: "center",
                                            backgroundColor: "#ffffff",
                                            color: "#000000",
                                        }}
                                        maxLength={7}
                                    />
                                </div>
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
                            <div className="setting-item">
                                <label>Opcje dodatkowe</label>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        marginTop: "5px",
                                    }}>
                                    <input
                                        type="checkbox"
                                        id="flattenPdf"
                                        checked={shouldFlatten}
                                        onChange={(e) =>
                                            setShouldFlatten(e.target.checked)
                                        }
                                        disabled={isGenerating}
                                        style={{
                                            width: "20px",
                                            height: "20px",
                                            accentColor: "#4f46e5",
                                            backgroundColor: "#ffffff",
                                        }}
                                    />
                                    <label
                                        htmlFor="flattenPdf"
                                        style={{
                                            margin: 0,
                                            fontWeight: "normal",
                                            fontSize: "0.9em",
                                        }}>
                                        Spłaszcz PDF (Wymagane przez niektóre
                                        drukarnie)
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {pdfPreviewUrl && (
                    <div className="preview-section">
                        <h2>Podgląd i pozycjonowanie</h2>
                        <div
                            className="pdf-preview-container"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}>
                            <img
                                ref={previewRef}
                                src={pdfPreviewUrl}
                                className="pdf-preview-img"
                                alt="PDF Preview"
                                style={{ width: "100%", height: "auto" }}
                                draggable="false"
                            />
                            {csvData.length > 0 && (
                                <div
                                    className={`name-preview ${
                                        isDragging ? "dragging" : ""
                                    }`}
                                    style={{
                                        left: namePosition.x,
                                        top: namePosition.y,
                                        fontFamily: activeFontFamily,
                                        fontSize: `${fontScale}px`,
                                        color: textColor,
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
                                onClick={showCurlCommand}
                                disabled={!pdfTemplate || isGenerating}
                                title="Skopiuj komendę curl z aktualnymi ustawieniami">
                                Kopiuj curl
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
                    </div>
                )}
            </div>

            {curlCommand && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                    }}
                    onClick={() => setCurlCommand(null)}>
                    <div
                        style={{
                            background: "white",
                            borderRadius: "1rem",
                            padding: "1.5rem",
                            maxWidth: "700px",
                            width: "90%",
                            maxHeight: "80vh",
                            display: "flex",
                            flexDirection: "column",
                            gap: "1rem",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                        }}
                        onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ margin: 0, textAlign: "left" }}>
                            Komenda curl
                        </h3>
                        <pre
                            style={{
                                background: "#1e1e1e",
                                color: "#d4d4d4",
                                padding: "1rem",
                                borderRadius: "0.5rem",
                                overflow: "auto",
                                fontSize: "0.85rem",
                                textAlign: "left",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                margin: 0,
                            }}>
                            {curlCommand}
                        </pre>
                        <div
                            style={{
                                display: "flex",
                                gap: "0.5rem",
                                justifyContent: "flex-end",
                            }}>
                            <button
                                className="secondary-button"
                                onClick={() => setCurlCommand(null)}>
                                Zamknij
                            </button>
                            <button
                                className="primary-button"
                                onClick={confirmCopyCurl}>
                                {curlCopied
                                    ? "Skopiowano!"
                                    : "Kopiuj do schowka"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
