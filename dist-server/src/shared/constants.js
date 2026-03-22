// Available fonts configuration
// To add a new font: drop the .ttf file into public/fonts/ and add an entry here
export const AVAILABLE_FONTS = [
    { name: "Sans", path: "/fonts/default-font.ttf" },
    { name: "Tan Pearl", path: "/fonts/tan-pearl.ttf" },
];
// Helper functions for CSV column matching
export const firstNameVariants = [
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
export const lastNameVariants = [
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
export const titleVariants = [
    "title",
    "Tytuł",
    "tytuł",
    "tytul",
    "prefix",
    "Prefix",
    "honorific",
    "degree",
];
export const findMatchingColumn = (headers, variants) => {
    for (const header of headers) {
        if (variants.includes(header.trim())) {
            return header;
        }
    }
    return null;
};
//# sourceMappingURL=constants.js.map