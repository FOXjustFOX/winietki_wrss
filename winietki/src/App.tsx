import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { getDocument } from "pdfjs-dist";
import "./App.css";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString();

interface Person {
    firstName: string;
    lastName: string;
    title?: string;
}

// CSV row interface for type safety
interface CSVRow {
    [key: string]: string | undefined;
    firstName?: string;
    first_name?: string;
    Imię?: string;
    lastName?: string;
    last_name?: string;
    Nazwisko?: string;
    title?: string;
    Tytuł?: string;
}

function App() {
    // File states
    const [pdfTemplate, setPdfTemplate] = useState<File | null>(null);
    const [csvData, setCsvData] = useState<Person[]>([]);
    const [fontFile, setFontFile] = useState<File | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [customFontFamily, setCustomFontFamily] = useState<string>("inherit");
    const [customFontLoaded, setCustomFontLoaded] = useState<boolean>(false);
    const [fontScale, setFontScale] = useState<number>(12);
    const [textColor, setTextColor] = useState<string>("#000000");
    const [textPlacing, setTextPlacing] = useState<string[]>(["center"]);
    const [previewScale, setPreviewScale] = useState<number>(1);

    // Position states
    const [namePosition, setNamePosition] = useState({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [pdfFontSize, setPdfFontSize] = useState<number>(12);

    // Preview refs
    const previewRef = useRef<HTMLDivElement>(null);

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
                    const persons: Person[] = (results.data as CSVRow[])
                        .filter((row) => {
                            const hasName =
                                (
                                    row.firstName ||
                                    row.first_name ||
                                    row.Imię ||
                                    ""
                                ).trim() !== "" ||
                                (
                                    row.lastName ||
                                    row.last_name ||
                                    row.Nazwisko ||
                                    ""
                                ).trim() !== "";
                            console.log("Row:", row, "Has name:", hasName);
                            return hasName;
                        })
                        .map((row) => {
                            const person = {
                                firstName: (
                                    row.firstName ||
                                    row.first_name ||
                                    row.Imię ||
                                    ""
                                ).trim(),
                                lastName: (
                                    row.lastName ||
                                    row.last_name ||
                                    row.Nazwisko ||
                                    ""
                                ).trim(),
                                title: (row.title || row.Tytuł || "").trim(),
                            };
                            console.log("Processed person:", person);
                            return person;
                        });
                    console.log("Final persons array:", persons);
                    setCsvData(persons);
                },
                error: (error) => {
                    console.error("Error parsing CSV:", error);
                    alert("Error parsing CSV file. Please check the format.");
                },
                dynamicTyping: true,
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
            reader.onload = (event) => {
                if (event.target?.result) {
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
        if (previewRef.current) {
            const rect = previewRef.current.getBoundingClientRect();
            setNamePosition({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
            setIsDragging(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && previewRef.current) {
            const rect = previewRef.current.getBoundingClientRect();
            setNamePosition({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
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

                    // Get preview width
                    const previewWidth = previewRef.current?.clientWidth || 500;

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
        // Font size in preview should be scaled according to the preview size
        setFontScale(Math.round(newSizePt * previewScale));
    };

    // Font size
    const handleTextColor = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTextColor(e.target.value);
    };

    // Calculate appropriate font size based on PDF dimensions vs preview dimensions
    useEffect(() => {
        if (pdfTemplate && previewRef.current) {
            const calculateFontScale = async () => {
                try {
                    // Get PDF dimensions
                    const arrayBuffer = await pdfTemplate.arrayBuffer();
                    const pdfDoc = await PDFDocument.load(arrayBuffer);
                    const page = pdfDoc.getPage(0);
                    const { width: pdfWidth } = page.getSize();

                    // Get preview dimensions
                    const previewWidth = previewRef.current?.clientWidth || 500;

                    // Calculate initial font scale based on PDF dimensions
                    // Only set these values if they haven't been manually adjusted
                    if (!fontScale || fontScale === 12) {
                        const initialScale = 12 * (previewWidth / pdfWidth);
                        setFontScale(Math.round(initialScale));
                        setPdfFontSize(12); // Initial PDF font size in points
                    }

                    console.log(
                        "Preview width:",
                        previewWidth,
                        "PDF width:",
                        pdfWidth
                    );
                    console.log("Preview font size (pixels):", fontScale);
                    console.log("PDF font size (points):", pdfFontSize);
                } catch (error) {
                    console.error("Error calculating font scale:", error);
                    // Only set default values if they haven't been manually set
                    if (!fontScale || fontScale === 12) {
                        setFontScale(12);
                        setPdfFontSize(12);
                    }
                }
            };

            calculateFontScale();
        }
    }, [pdfTemplate, pdfPreviewUrl, fontScale, pdfFontSize]);

    // Generate PDFs
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
            const previewWidth = previewRef.current?.clientWidth ?? 500;
            const previewHeight = previewRef.current?.clientHeight ?? 700;

            const mergedDoc = await PDFDocument.create();
            mergedDoc.registerFontkit(fontkit);

            let font;
            if (fontFile) {
                try {
                    const fontBytes = await fontFile.arrayBuffer();
                    font = await mergedDoc.embedFont(fontBytes, {
                        subset: true,
                    });
                } catch (error) {
                    console.error("Error embedding custom font:", error);
                    const fontResponse = await fetch(
                        "https://pdf-lib.js.org/assets/ubuntu/Ubuntu-R.ttf"
                    );
                    const fontBytes = await fontResponse.arrayBuffer();
                    font = await mergedDoc.embedFont(fontBytes, {
                        subset: true,
                    });
                }
            } else {
                const fontResponse = await fetch(
                    "https://pdf-lib.js.org/assets/ubuntu/Ubuntu-R.ttf"
                );
                const fontBytes = await fontResponse.arrayBuffer();
                font = await mergedDoc.embedFont(fontBytes, { subset: true });
            }

            for (let i = 0; i < csvData.length; i++) {
                const person = csvData[i];
                const page = await mergedDoc.copyPages(templateDoc, [0]);
                mergedDoc.addPage(page[0]);

                const fullName = [
                    person.title,
                    person.firstName,
                    person.lastName,
                ]
                    .filter(Boolean)
                    .join(" ");

                // Calculate scaled position from preview to PDF coordinates
                const scaledX = (namePosition.x / previewWidth) * pageWidth;
                const scaledY =
                    pageHeight - (namePosition.y / previewHeight) * pageHeight;

                // Calculate text width using the actual PDF font size
                const textWidth = font.widthOfTextAtSize(fullName, pdfFontSize);

                // Place the text according to alignment
                let setX;
                switch (textPlacing[0]) {
                    case "left":
                        setX = scaledX;
                        break;
                    case "center":
                        setX = scaledX - textWidth / 2;
                        break;
                    default:
                        setX = scaledX - textWidth / 2;
                }

                // Draw text with the actual PDF font size
                page[0].drawText(fullName, {
                    x: setX,
                    y: scaledY,
                    size: pdfFontSize,
                    font: font,
                    color: rgb(
                        parseInt(textColor.slice(1, 3), 16) / 255,
                        parseInt(textColor.slice(3, 5), 16) / 255,
                        parseInt(textColor.slice(5, 7), 16) / 255
                    ),
                });

                setProgress(Math.round(((i + 1) / csvData.length) * 100));
            }

            const pdfBytes = await mergedDoc.save();
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = "winietki.pdf";
            link.click();

            URL.revokeObjectURL(url);
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
                                className="upload-button"
                                htmlFor="pdfUpload">
                                <span>Dodaj</span>
                                <input
                                    id="pdfUpload"
                                    type="file"
                                    accept=".pdf"
                                    onChange={handlePdfUpload}
                                    disabled={isGenerating}
                                />
                                {pdfTemplate && (
                                    <div className="step-check">✓</div>
                                )}
                            </label>
                            <div className="format-info">
                                Możliwe format: PDF
                            </div>
                        </div>
                    </div>

                    <div className="step-card">
                        <h2>Krok 2:</h2>
                        <p>
                            Prześlij plik z wartościami, które chcesz
                            wygenerować
                        </p>
                        <label className="upload-button" htmlFor="csvUpload">
                            <span>Dodaj</span>
                            <input
                                id="csvUpload"
                                type="file"
                                accept=".csv"
                                onChange={handleCsvUpload}
                                disabled={isGenerating}
                            />
                        </label>
                        <div className="format-info">Możliwy format: CSV</div>
                        {csvData.length > 0 && (
                            <div className="step-check">✓</div>
                        )}
                    </div>

                    <div className="step-card">
                        <h2>Krok 3:</h2>
                        <p>Wybierz ustawienia generowanego tekstu</p>
                        <div className="settings-grid">
                            <div className="setting-item">
                                <label>Czcionka</label>
                                <label
                                    className="upload-button"
                                    htmlFor="fontUpload">
                                    <span>Dodaj</span>
                                    <input
                                        id="fontUpload"
                                        type="file"
                                        accept=".ttf,.otf"
                                        onChange={handleFontUpload}
                                        disabled={isGenerating}
                                    />
                                </label>
                            </div>
                            <div className="setting-item">
                                <label>Rozmiar tekstu (pt)</label>
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
                                <input
                                    type="color"
                                    value={textColor}
                                    onChange={handleTextColor}
                                    disabled={isGenerating}
                                />
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
                                <select>
                                    <option value="tak">Tak</option>
                                    <option value="nie">Nie</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {pdfPreviewUrl && (
                    <div className="preview-section">
                        <h2>Podgląd i pozycjonowanie</h2>
                        <div
                            className="pdf-preview-container"
                            ref={previewRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}>
                            <img
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
                                        fontFamily: customFontLoaded
                                            ? customFontFamily
                                            : "inherit",
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
        </div>
    );
}

export default App;
