export interface Person {
    firstName: string;
    lastName: string;
    title?: string;
}

export interface CSVRow {
    [key: string]: string | undefined;
}

export interface FontConfig {
    name: string;
    path: string;
}

export interface PdfGenerationOptions {
    templateBytes: Uint8Array | ArrayBuffer;
    persons: Person[];
    fontBytes: Uint8Array | ArrayBuffer;
    fontSize: number;
    textColor: string;
    textAlign: "left" | "center";
    positionX: number; // fraction 0-1 of page width
    positionY: number; // fraction 0-1 of page height
    outputFormat: "single" | "multiple";
    shouldFlatten: boolean;
}
