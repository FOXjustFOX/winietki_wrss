import Papa from "papaparse";
import type { Person, CSVRow } from "./types";
import {
    findMatchingColumn,
    firstNameVariants,
    lastNameVariants,
    titleVariants,
} from "./constants";

export function parseCsvString(csvContent: string): Person[] {
    const result = Papa.parse<CSVRow>(csvContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
    });

    const headers = result.meta.fields || [];
    const firstNameCol = findMatchingColumn(headers, firstNameVariants);
    const lastNameCol = findMatchingColumn(headers, lastNameVariants);
    const titleCol = findMatchingColumn(headers, titleVariants);
    const useDefaultPositions = !firstNameCol && !lastNameCol;

    return (result.data as CSVRow[])
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
                    firstName: (
                        typeof columns[0] === "string" ? columns[0] : ""
                    ).trim(),
                    lastName: (
                        columns.length > 1 && typeof columns[1] === "string"
                            ? columns[1]
                            : ""
                    ).trim(),
                    title: (
                        columns.length > 2 && typeof columns[2] === "string"
                            ? columns[2]
                            : ""
                    ).trim(),
                };
            }
            return {
                firstName:
                    firstNameCol && typeof row[firstNameCol] === "string"
                        ? row[firstNameCol]!.trim()
                        : "",
                lastName:
                    lastNameCol && typeof row[lastNameCol] === "string"
                        ? row[lastNameCol]!.trim()
                        : "",
                title: titleCol ? (row[titleCol] || "").trim() : "",
            };
        })
        .filter((person) => person.firstName !== "" || person.lastName !== "");
}
