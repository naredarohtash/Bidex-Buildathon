"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_BY_CODE = exports.COUNTRIES = exports.PASSPORT = void 0;
exports.normaliseNumber = normaliseNumber;
exports.findDocument = findDocument;
exports.validateNumber = validateNumber;
const postcodes_1 = require("./postcodes");
exports.PASSPORT = {
    id: "passport",
    label: "Passport",
    sides: 1,
    pattern: "^[A-Z0-9]{6,12}$",
    placeholder: "A1234567",
    hint: "The number on your photo page",
};
const COUNTRIES_BASE = [
    {
        code: "IN",
        name: "India",
        documents: [
            { id: "aadhaar", label: "Aadhaar Card", sides: 2, pattern: "^\\d{12}$", placeholder: "1234 5678 9012", hint: "12 digits, printed under your photo" },
            { id: "pan", label: "PAN Card", sides: 1, pattern: "^[A-Z]{5}\\d{4}[A-Z]$", placeholder: "ABCDE1234F", hint: "10 characters, e.g. ABCDE1234F" },
            { id: "voter_id", label: "Voter ID (EPIC)", sides: 2, pattern: "^[A-Z]{3}\\d{7}$", placeholder: "ABC1234567", hint: "3 letters then 7 digits" },
            { id: "driving_licence", label: "Driving Licence", sides: 2, pattern: "^[A-Z0-9-]{8,20}$", placeholder: "DL01 20110012345", hint: "As printed, including any dashes" },
        ],
    },
    {
        code: "PK",
        name: "Pakistan",
        documents: [
            { id: "cnic", label: "CNIC", sides: 2, pattern: "^\\d{13}$", placeholder: "12345-1234567-1", hint: "13 digits" },
            { id: "nicop", label: "NICOP (overseas)", sides: 2, pattern: "^\\d{13}$", placeholder: "12345-1234567-1", hint: "13 digits" },
        ],
    },
    {
        code: "BD",
        name: "Bangladesh",
        documents: [
            { id: "nid", label: "National ID (NID)", sides: 2, pattern: "^(\\d{10}|\\d{13}|\\d{17})$", placeholder: "1234567890", hint: "10, 13 or 17 digits" },
            { id: "driving_licence", label: "Driving Licence", sides: 2, pattern: "^[A-Z0-9-]{8,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "NP",
        name: "Nepal",
        documents: [
            { id: "citizenship", label: "Citizenship Certificate", sides: 2, pattern: "^[0-9/-]{6,20}$", placeholder: "12-01-70-12345", hint: "As printed, including dashes" },
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^[0-9-]{6,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "LK",
        name: "Sri Lanka",
        documents: [
            { id: "nic", label: "National Identity Card", sides: 2, pattern: "^(\\d{9}[VXvx]|\\d{12})$", placeholder: "199012345678", hint: "12 digits, or 9 digits and a V" },
            { id: "driving_licence", label: "Driving Licence", sides: 2, pattern: "^[A-Z0-9]{6,15}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "AF",
        name: "Afghanistan",
        documents: [
            { id: "tazkira", label: "Tazkira / e-Tazkira", sides: 2, pattern: "^[A-Z0-9/-]{5,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "BT",
        name: "Bhutan",
        documents: [
            { id: "cid", label: "Citizenship ID (CID)", sides: 2, pattern: "^\\d{11}$", placeholder: "10101001234", hint: "11 digits" },
        ],
    },
    {
        code: "MV",
        name: "Maldives",
        documents: [
            { id: "nic", label: "National Identity Card", sides: 2, pattern: "^A\\d{6}$", placeholder: "A123456", hint: "A followed by 6 digits" },
        ],
    },
    {
        code: "ID",
        name: "Indonesia",
        documents: [
            { id: "ktp", label: "KTP", sides: 1, pattern: "^\\d{16}$", placeholder: "3171234567890001", hint: "NIK, 16 digits" },
            { id: "sim", label: "SIM (Driving Licence)", sides: 2, pattern: "^[0-9-]{10,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "MY",
        name: "Malaysia",
        documents: [
            { id: "mykad", label: "MyKad", sides: 2, pattern: "^\\d{12}$", placeholder: "901231-14-5678", hint: "12 digits" },
        ],
    },
    {
        code: "PH",
        name: "Philippines",
        documents: [
            { id: "philid", label: "PhilID (National ID)", sides: 2, pattern: "^\\d{16}$", placeholder: "1234567890123456", hint: "PCN, 16 digits" },
            { id: "umid", label: "UMID", sides: 2, pattern: "^\\d{12}$", placeholder: "1234-5678901-2", hint: "12 digits" },
            { id: "drivers_licence", label: "Driver's Licence", sides: 2, pattern: "^[A-Z]\\d{2}-\\d{2}-\\d{6}$", placeholder: "N01-23-456789", hint: "As printed on the front" },
        ],
    },
    {
        code: "TH",
        name: "Thailand",
        documents: [
            { id: "thai_id", label: "Thai National ID", sides: 2, pattern: "^\\d{13}$", placeholder: "1234567890123", hint: "13 digits" },
        ],
    },
    {
        code: "VN",
        name: "Vietnam",
        documents: [
            { id: "cccd", label: "CCCD (chip ID)", sides: 2, pattern: "^\\d{12}$", placeholder: "001234567890", hint: "12 digits" },
            { id: "cmnd", label: "CMND (old ID)", sides: 2, pattern: "^\\d{9}$", placeholder: "123456789", hint: "9 digits" },
        ],
    },
    {
        code: "KH",
        name: "Cambodia",
        documents: [
            { id: "national_id", label: "Khmer National ID", sides: 2, pattern: "^\\d{9}$", placeholder: "123456789", hint: "9 digits" },
        ],
    },
    {
        code: "MM",
        name: "Myanmar",
        documents: [
            { id: "nrc", label: "NRC Card", sides: 2, pattern: "^[0-9A-Za-z/()က-႟ ]{5,40}$", placeholder: "12/ABCDE(N)123456", hint: "As printed" },
        ],
    },
    {
        code: "LA",
        name: "Laos",
        documents: [
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^[A-Z0-9]{6,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "SG",
        name: "Singapore",
        documents: [
            { id: "nric", label: "NRIC / FIN", sides: 2, pattern: "^[STFGM]\\d{7}[A-Z]$", placeholder: "S1234567D", hint: "Letter, 7 digits, letter" },
        ],
    },
    {
        code: "BN",
        name: "Brunei",
        documents: [
            { id: "ic", label: "Identity Card", sides: 2, pattern: "^[0-9-]{6,15}$", placeholder: "00-123456", hint: "As printed" },
        ],
    },
    {
        code: "CN",
        name: "China",
        documents: [
            { id: "resident_id", label: "Resident Identity Card", sides: 2, pattern: "^\\d{17}[\\dXx]$", placeholder: "110101199003071234", hint: "18 characters" },
        ],
    },
    {
        code: "JP",
        name: "Japan",
        documents: [
            { id: "drivers_licence", label: "Driver's Licence", sides: 2, pattern: "^\\d{12}$", placeholder: "123456789012", hint: "12 digits" },
            { id: "my_number", label: "My Number Card", sides: 2, pattern: "^\\d{12}$", placeholder: "123456789012", hint: "12 digits" },
            { id: "residence_card", label: "Residence Card", sides: 2, pattern: "^[A-Z]{2}\\d{8}[A-Z]{2}$", placeholder: "AB12345678CD", hint: "As printed" },
        ],
    },
    {
        code: "KR",
        name: "South Korea",
        documents: [
            { id: "rrc", label: "Resident Registration Card", sides: 2, pattern: "^\\d{6}-?\\d{7}$", placeholder: "900101-1234567", hint: "13 digits" },
            { id: "drivers_licence", label: "Driver's Licence", sides: 2, pattern: "^[0-9-]{10,20}$", placeholder: "", hint: "As printed" },
            { id: "arc", label: "Alien Registration Card", sides: 2, pattern: "^\\d{6}-?\\d{7}$", placeholder: "", hint: "13 digits" },
        ],
    },
    {
        code: "TW",
        name: "Taiwan",
        documents: [
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^[A-Z]\\d{9}$", placeholder: "A123456789", hint: "Letter then 9 digits" },
        ],
    },
    {
        code: "HK",
        name: "Hong Kong",
        documents: [
            { id: "hkid", label: "HKID", sides: 1, pattern: "^[A-Z]{1,2}\\d{6}\\(?[0-9A]\\)?$", placeholder: "A123456(7)", hint: "As printed, including the bracket" },
        ],
    },
    {
        code: "MO",
        name: "Macau",
        documents: [
            { id: "bir", label: "BIR Resident ID", sides: 2, pattern: "^\\d{7}\\(?\\d\\)?$", placeholder: "1234567(8)", hint: "As printed" },
        ],
    },
    {
        code: "MN",
        name: "Mongolia",
        documents: [
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^[A-Z]{2}\\d{8}$", placeholder: "AB12345678", hint: "2 letters then 8 digits" },
        ],
    },
    {
        code: "KZ",
        name: "Kazakhstan",
        documents: [
            { id: "id_card", label: "ID Card", sides: 2, pattern: "^\\d{12}$", placeholder: "123456789012", hint: "IIN, 12 digits" },
        ],
    },
    {
        code: "UZ",
        name: "Uzbekistan",
        documents: [
            { id: "id_card", label: "ID Card (biometric)", sides: 2, pattern: "^(\\d{14}|[A-Z]{2}\\d{7})$", placeholder: "12345678901234", hint: "PINFL 14 digits" },
        ],
    },
    {
        code: "KG",
        name: "Kyrgyzstan",
        documents: [
            { id: "id_card", label: "ID Card", sides: 2, pattern: "^\\d{14}$", placeholder: "12345678901234", hint: "INN, 14 digits" },
        ],
    },
    {
        code: "TJ",
        name: "Tajikistan",
        documents: [
            { id: "id_card", label: "ID Card", sides: 2, pattern: "^[A-Z0-9]{6,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "TM",
        name: "Turkmenistan",
        documents: [
            { id: "id_card", label: "ID Card", sides: 2, pattern: "^[A-Z0-9]{6,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "AE",
        name: "United Arab Emirates",
        documents: [
            { id: "emirates_id", label: "Emirates ID", sides: 2, pattern: "^784\\d{12}$", placeholder: "784-1990-1234567-1", hint: "15 digits starting 784" },
        ],
    },
    {
        code: "SA",
        name: "Saudi Arabia",
        documents: [
            { id: "national_id", label: "National ID (Hawiya)", sides: 2, pattern: "^1\\d{9}$", placeholder: "1234567890", hint: "10 digits starting with 1" },
            { id: "iqama", label: "Iqama (residence permit)", sides: 2, pattern: "^2\\d{9}$", placeholder: "2234567890", hint: "10 digits starting with 2" },
        ],
    },
    {
        code: "QA",
        name: "Qatar",
        documents: [
            { id: "qid", label: "Qatar ID (QID)", sides: 2, pattern: "^\\d{11}$", placeholder: "12345678901", hint: "11 digits" },
        ],
    },
    {
        code: "KW",
        name: "Kuwait",
        documents: [
            { id: "civil_id", label: "Civil ID", sides: 2, pattern: "^\\d{12}$", placeholder: "123456789012", hint: "12 digits" },
        ],
    },
    {
        code: "BH",
        name: "Bahrain",
        documents: [
            { id: "cpr", label: "CPR Card", sides: 2, pattern: "^\\d{9}$", placeholder: "123456789", hint: "9 digits" },
        ],
    },
    {
        code: "OM",
        name: "Oman",
        documents: [
            { id: "id_card", label: "Omani ID / Resident Card", sides: 2, pattern: "^\\d{8}$", placeholder: "12345678", hint: "8 digits" },
        ],
    },
    {
        code: "JO",
        name: "Jordan",
        documents: [
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^\\d{10}$", placeholder: "1234567890", hint: "10 digits" },
        ],
    },
    {
        code: "TR",
        name: "Turkey",
        documents: [
            { id: "tc_kimlik", label: "T.C. Kimlik Kartı", sides: 2, pattern: "^[1-9]\\d{10}$", placeholder: "12345678901", hint: "TCKN, 11 digits" },
            { id: "driving_licence", label: "Driving Licence", sides: 2, pattern: "^[A-Z0-9]{6,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "IL",
        name: "Israel",
        documents: [
            { id: "teudat_zehut", label: "Teudat Zehut", sides: 2, pattern: "^\\d{9}$", placeholder: "123456789", hint: "9 digits" },
        ],
    },
    {
        code: "LB",
        name: "Lebanon",
        documents: [
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^[A-Z0-9]{6,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "IQ",
        name: "Iraq",
        documents: [
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^[A-Z0-9]{6,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "NG",
        name: "Nigeria",
        documents: [
            { id: "nin", label: "NIN Slip / National ID", sides: 2, pattern: "^\\d{11}$", placeholder: "12345678901", hint: "11 digits" },
            { id: "drivers_licence", label: "Driver's Licence", sides: 2, pattern: "^[A-Z0-9]{8,20}$", placeholder: "", hint: "As printed" },
            { id: "pvc", label: "Voter's Card (PVC)", sides: 2, pattern: "^[A-Z0-9]{8,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "ZA",
        name: "South Africa",
        documents: [
            { id: "smart_id", label: "Smart ID Card", sides: 2, pattern: "^\\d{13}$", placeholder: "9001015800085", hint: "13 digits" },
            { id: "id_book", label: "Green ID Book", sides: 2, pattern: "^\\d{13}$", placeholder: "9001015800085", hint: "13 digits" },
            { id: "drivers_licence", label: "Driving Licence", sides: 2, pattern: "^[A-Z0-9]{8,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "KE",
        name: "Kenya",
        documents: [
            { id: "national_id", label: "National ID", sides: 2, pattern: "^\\d{7,8}$", placeholder: "12345678", hint: "7 or 8 digits" },
        ],
    },
    {
        code: "GH",
        name: "Ghana",
        documents: [
            { id: "ghana_card", label: "Ghana Card", sides: 2, pattern: "^GHA-\\d{9}-\\d$", placeholder: "GHA-123456789-0", hint: "GHA- then 9 digits" },
        ],
    },
    {
        code: "EG",
        name: "Egypt",
        documents: [
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^\\d{14}$", placeholder: "29001011234567", hint: "14 digits" },
        ],
    },
    {
        code: "MA",
        name: "Morocco",
        documents: [
            { id: "cnie", label: "CNIE", sides: 2, pattern: "^[A-Z]{1,2}\\d{5,6}$", placeholder: "AB123456", hint: "1-2 letters then digits" },
        ],
    },
    {
        code: "TZ",
        name: "Tanzania",
        documents: [
            { id: "nida", label: "NIDA National ID", sides: 2, pattern: "^\\d{20}$", placeholder: "", hint: "20 digits" },
        ],
    },
    {
        code: "UG",
        name: "Uganda",
        documents: [
            { id: "national_id", label: "National ID Card", sides: 2, pattern: "^C[MF][A-Z0-9]{12}$", placeholder: "CM12345678ABCD", hint: "Starts CM or CF" },
        ],
    },
    {
        code: "ET",
        name: "Ethiopia",
        documents: [
            { id: "fayda", label: "Fayda Digital ID", sides: 2, pattern: "^\\d{12}$", placeholder: "123456789012", hint: "12 digits" },
        ],
    },
    {
        code: "MX",
        name: "Mexico",
        documents: [
            { id: "ine", label: "INE / IFE Voter Card", sides: 2, pattern: "^[A-Z0-9]{9,18}$", placeholder: "1234567890123", hint: "CIC or OCR from the card" },
            { id: "curp", label: "CURP", sides: 1, pattern: "^[A-Z]{4}\\d{6}[HM][A-Z]{5}[A-Z0-9]\\d$", placeholder: "ABCD900101HDFXYZ01", hint: "18 characters" },
        ],
    },
    {
        code: "BR",
        name: "Brazil",
        documents: [
            { id: "cnh", label: "CNH (Driving Licence)", sides: 2, pattern: "^\\d{11}$", placeholder: "12345678901", hint: "11 digits" },
            { id: "rg", label: "RG Identity Card", sides: 2, pattern: "^[A-Z0-9.\\-]{5,20}$", placeholder: "", hint: "As printed" },
        ],
    },
    {
        code: "AR",
        name: "Argentina",
        documents: [
            { id: "dni", label: "DNI", sides: 2, pattern: "^\\d{7,8}$", placeholder: "12345678", hint: "7 or 8 digits" },
        ],
    },
    {
        code: "CO",
        name: "Colombia",
        documents: [
            { id: "cedula", label: "Cédula de Ciudadanía", sides: 2, pattern: "^\\d{6,10}$", placeholder: "1234567890", hint: "6 to 10 digits" },
        ],
    },
    {
        code: "CL",
        name: "Chile",
        documents: [
            { id: "cedula", label: "Cédula de Identidad", sides: 2, pattern: "^\\d{7,8}-[\\dkK]$", placeholder: "12345678-9", hint: "RUT with check digit" },
        ],
    },
    {
        code: "PE",
        name: "Peru",
        documents: [
            { id: "dni", label: "DNI", sides: 2, pattern: "^\\d{8}$", placeholder: "12345678", hint: "8 digits" },
        ],
    },
];
exports.COUNTRIES = COUNTRIES_BASE.map((c) => ({
    ...c,
    documents: [...c.documents, exports.PASSPORT],
    postcode: (0, postcodes_1.postcodeFor)(c.code),
}));
exports.COUNTRY_BY_CODE = new Map(exports.COUNTRIES.map((c) => [c.code, c]));
function normaliseNumber(value) {
    return String(value || "").toUpperCase().replace(/[\s]/g, "");
}
function findDocument(countryCode, documentId) {
    const country = exports.COUNTRY_BY_CODE.get(String(countryCode || "").toUpperCase());
    if (!country)
        return null;
    const document = country.documents.find((d) => d.id === documentId);
    return document ? { country, document } : null;
}
function validateNumber(doc, value) {
    const raw = normaliseNumber(value);
    if (!raw)
        return "Enter the number printed on your document";
    const re = new RegExp(doc.pattern);
    if (re.test(raw))
        return null;
    if (re.test(raw.replace(/-/g, "")))
        return null;
    return doc.hint ? `That does not look right — ${doc.hint.toLowerCase()}` : "Check the number and try again";
}
