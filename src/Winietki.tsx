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

function Winietki() {
    // File states
    const [pdfTemplate, setPdfTemplate] = useState<File | null>(null);
    const [csvData, setCsvData] = useState<Person[]>([]);
    const [fontFile, setFontFile] = useState<File | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [customFontFamily, setCustomFontFamily] = useState<string>("inherit");
    const [customFontLoaded, setCustomFontLoaded] = useState<boolean>(false);
    const [fontScale, setFontScale] = useState<number>(12); // Default font size
    const [textColor, setTextColor] = useState<string>("#000000");
    const [textPlacing, setTextPlacing] = useState<string[]>(["center"]);

    // Position states
    const [namePosition, setNamePosition] = useState({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);

    // Generation states
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);

    // Preview refs
    const previewRef = useRef<HTMLDivElement>(null);

    // Add state to store the actual PDF font size
    const [pdfFontSize, setPdfFontSize] = useState<number>(12);

    // Conversion factor between pixels and points - adjusted for Mac high-DPI displays

    const PX_TO_PT_RATIO = 0.75;
    const PT_TO_PX_RATIO = 1.75; // Reduced from 2.5 to make preview font match PDF size

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

    // Handle font scale changes from the input control
    const handleFontScale = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSizePt = parseInt(e.target.value);
        // Convert points to pixels for preview
        setFontScale(Math.round(newSizePt * PT_TO_PX_RATIO));
        // Store original point size for PDF
        setPdfFontSize(newSizePt);
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
            // Read template PDF as ArrayBuffer
            const templateArrayBuffer = await pdfTemplate.arrayBuffer();

            // Load the template PDF using pdf-lib
            const templateDoc = await PDFDocument.load(templateArrayBuffer);
            const [templatePage] = await templateDoc.copyPages(templateDoc, [
                0,
            ]);
            const pageWidth = templatePage.getWidth();
            const pageHeight = templatePage.getHeight();

            // Create a new PDF document
            const mergedDoc = await PDFDocument.create();

            // Register fontkit with the PDF document
            mergedDoc.registerFontkit(fontkit);

            // Font handling with better Polish character support
            let font;

            // Default font location (Ubuntu font with good Unicode support)
            const ubuntuFontUrl =
                "https://pdf-lib.js.org/assets/ubuntu/Ubuntu-R.ttf";

            if (fontFile) {
                // Try to use the custom font first
                try {
                    const fontBytes = await fontFile.arrayBuffer();
                    font = await mergedDoc.embedFont(fontBytes, {
                        subset: true,
                    });
                    console.log("Successfully embedded custom font");
                } catch (error) {
                    console.error("Error embedding custom font:", error);
                    // Fall back to Ubuntu font if custom font fails
                    const fontResponse = await fetch(ubuntuFontUrl);
                    const fontBytes = await fontResponse.arrayBuffer();
                    font = await mergedDoc.embedFont(fontBytes, {
                        subset: true,
                    });
                    console.log("Falling back to Ubuntu font");
                }
            } else {
                // No custom font provided, use Ubuntu font which has good Polish character support
                const fontResponse = await fetch(ubuntuFontUrl);
                const fontBytes = await fontResponse.arrayBuffer();
                font = await mergedDoc.embedFont(fontBytes, { subset: true });
                console.log("Using Ubuntu font (no custom font provided)");
            }

            // Get scale factors based on preview dimensions
            const previewWidth = previewRef.current?.clientWidth ?? 500;
            const previewHeight = previewRef.current?.clientHeight ?? 700;

            // Process each person
            for (let i = 0; i < csvData.length; i++) {
                const person = csvData[i];

                // Copy template page for this person
                const page = await mergedDoc.copyPages(templateDoc, [0]);
                mergedDoc.addPage(page[0]);

                // Add text to the page
                const fullName = [
                    person.title,
                    person.firstName,
                    person.lastName,
                ]
                    .filter(Boolean)
                    .join(" ");

                // Calculate scaled X position - standard scaling
                const scaledX = (namePosition.x / previewWidth) * pageWidth;

                const scaledY =
                    ((namePosition.y *
                        PX_TO_PT_RATIO *
                        (pageHeight * PX_TO_PT_RATIO)) /
                        previewHeight) *
                    PX_TO_PT_RATIO;

                // Debug positioning info to console
                console.log("PDF page size:", {
                    width: pageWidth,
                    height: pageHeight,
                });
                console.log("Preview dimensions:", {
                    width: previewWidth,
                    height: previewHeight,
                });
                console.log("Preview position:", namePosition);
                console.log("Final PDF position:", { x: scaledX, y: scaledY });

                // Add text to PDF with Unicode-compatible font
                const textWidth = font.widthOfTextAtSize(fullName, pdfFontSize);

                // place the text
                let setX;
                switch (textPlacing[0]) {
                    case "left":
                        setX = scaledX;
                        break;
                    case "center":
                        setX = pageWidth / 2 - textWidth / 2;
                        break;
                    case "right":
                        setX = pageWidth / 2 + textWidth / 2;
                        break;
                    default: // center
                        setX = pageWidth / 2 - textWidth / 2;
                }

                page[0].drawText(fullName, {
                    x: setX,
                    y: scaledY,
                    size: pdfFontSize, // Use the configured PDF font size
                    font: font,
                    color: rgb(
                        parseInt(textColor.slice(1, 3), 16) / 255,
                        parseInt(textColor.slice(3, 5), 16) / 255,
                        parseInt(textColor.slice(5, 7), 16) / 255
                    ),
                });

                // Update progress
                setProgress(Math.round(((i + 1) / csvData.length) * 100));
            }

            // Save the PDF
            const pdfBytes = await mergedDoc.save();
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);

            // Create a link and trigger download
            const link = document.createElement("a");
            link.href = url;
            link.download = "winietki.pdf";
            link.click();

            // Cleanup
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
            <h1>Name Card PDF Generator</h1>
            <div className="container">
                <div className="upload-section">
                    <div className="upload-item">
                        <h2>1. Upload PDF Template</h2>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={handlePdfUpload}
                            disabled={isGenerating}
                        />
                    </div>

                    <div className="upload-item">
                        <h2>2. Upload CSV with Names</h2>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleCsvUpload}
                            disabled={isGenerating}
                        />
                        {csvData.length > 0 && (
                            <div className="csv-summary">
                                Loaded {csvData.length} names
                            </div>
                        )}
                    </div>

                    <div className="upload-item">
                        <h2>3. Upload Custom Font (Optional)</h2>
                        <input
                            type="file"
                            accept=".ttf,.otf"
                            onChange={handleFontUpload}
                            disabled={isGenerating}
                        />
                    </div>

                    <div className="text-options">
                        <div>
                            <label>Font size</label>
                            <input
                                type="number"
                                value={pdfFontSize}
                                onChange={handleFontScale}
                                disabled={isGenerating}
                            />
                        </div>
                        <div>
                            <label>Text color</label>
                            <input
                                type="color"
                                value={textColor}
                                onChange={handleTextColor}
                                disabled={isGenerating}
                            />
                        </div>
                        <div>
                            <label>Text placing</label>
                            <select
                                value={textPlacing[0]}
                                onChange={handleTextPlacing}
                                disabled={isGenerating}>
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div className="preview-section">
                    <h2>4. Position the Name (Click and drag on preview)</h2>

                    <div
                        className="pdf-preview-container"
                        ref={previewRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}>
                        <img
                            src={pdfPreviewUrl || undefined}
                            className="pdf-preview-img"
                            alt="PDF Preview"
                            style={{ width: "100%", height: "auto" }}
                            draggable="false"
                        />

                        {csvData.length > 0 && (
                            <div
                                className="name-preview"
                                style={{
                                    left: namePosition.x,
                                    top: namePosition.y,
                                    cursor: isDragging ? "grabbing" : "grab",
                                    fontFamily: customFontLoaded
                                        ? customFontFamily
                                        : "inherit",
                                    fontSize: `${fontScale}pt`,
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

                    <div className="font-preview-info">
                        {customFontLoaded ? (
                            <span>Using custom font: {fontFile?.name}</span>
                        ) : (
                            <span>
                                Using default font (upload a custom font to
                                preview)
                            </span>
                        )}
                    </div>

                    <div className="generate-section">
                        <button
                            onClick={generatePDFs}
                            disabled={
                                !pdfTemplate ||
                                csvData.length === 0 ||
                                isGenerating
                            }
                            className="generate-button">
                            {isGenerating
                                ? "Generating..."
                                : "Generate and Download PDF"}
                        </button>

                        {isGenerating && (
                            <div className="progress-bar-container">
                                <div
                                    className="progress-bar"
                                    style={{ width: `${progress}%` }}></div>
                                <span>{progress}%</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Winietki;
