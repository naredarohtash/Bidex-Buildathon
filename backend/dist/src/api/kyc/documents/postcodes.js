"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_POSTCODE = exports.POSTCODES = void 0;
exports.postcodeFor = postcodeFor;
exports.validatePostcode = validatePostcode;
const DIGITS = (n, example, label = "Postcode") => ({
    required: true,
    pattern: `^\\d{${n}}$`,
    placeholder: example,
    label,
    numeric: true,
});
const NONE = { required: false };
exports.POSTCODES = {
    IN: DIGITS(6, "110065", "PIN code"),
    PK: DIGITS(5, "44000"),
    BD: DIGITS(4, "1000"),
    NP: DIGITS(5, "44600"),
    LK: DIGITS(5, "00100"),
    AF: DIGITS(4, "1001"),
    BT: DIGITS(5, "11001"),
    MV: DIGITS(5, "20026"),
    ID: DIGITS(5, "10110"),
    MY: DIGITS(5, "50450"),
    PH: DIGITS(4, "1000"),
    TH: DIGITS(5, "10200"),
    VN: DIGITS(6, "100000"),
    KH: { required: true, pattern: "^\\d{5,6}$", placeholder: "120101", label: "Postcode", numeric: true },
    MM: DIGITS(5, "11181"),
    LA: DIGITS(5, "01000"),
    SG: DIGITS(6, "238859"),
    BN: { required: true, pattern: "^[A-Z]{2}\\d{4}$", placeholder: "KA1131", label: "Postcode" },
    CN: DIGITS(6, "100000"),
    JP: { required: true, pattern: "^\\d{3}-?\\d{4}$", placeholder: "100-0001", label: "Postal code" },
    KR: DIGITS(5, "03187"),
    TW: { required: true, pattern: "^\\d{3}(\\d{2,3})?$", placeholder: "100", label: "Postal code", numeric: true },
    HK: NONE,
    MO: NONE,
    MN: DIGITS(5, "14200"),
    KZ: DIGITS(6, "050000"),
    UZ: DIGITS(6, "100000"),
    KG: DIGITS(6, "720001"),
    TJ: DIGITS(6, "734001"),
    TM: DIGITS(6, "744000"),
    AE: NONE,
    SA: { required: true, pattern: "^\\d{5}(-\\d{4})?$", placeholder: "11564", label: "Postal code" },
    QA: NONE,
    KW: DIGITS(5, "13001"),
    BH: { required: true, pattern: "^\\d{3,4}$", placeholder: "317", label: "Block number", numeric: true },
    OM: DIGITS(3, "112"),
    JO: DIGITS(5, "11118"),
    TR: DIGITS(5, "34000"),
    IL: { required: true, pattern: "^\\d{5}(\\d{2})?$", placeholder: "9103401", label: "Postal code", numeric: true },
    LB: { required: true, pattern: "^\\d{4}( ?\\d{4})?$", placeholder: "1107 2020", label: "Postal code" },
    IQ: DIGITS(5, "10001"),
    NG: DIGITS(6, "100001"),
    ZA: DIGITS(4, "8001"),
    KE: DIGITS(5, "00100"),
    GH: NONE,
    EG: DIGITS(5, "11511"),
    MA: DIGITS(5, "10000"),
    TZ: DIGITS(5, "11101"),
    UG: NONE,
    ET: DIGITS(4, "1000"),
    MX: DIGITS(5, "06000"),
    BR: { required: true, pattern: "^\\d{5}-?\\d{3}$", placeholder: "01310-100", label: "CEP" },
    AR: {
        required: true,
        pattern: "^([A-Z]\\d{4}[A-Z]{3}|\\d{4})$",
        placeholder: "C1002AAP",
        label: "Postal code",
    },
    CO: DIGITS(6, "110111"),
    CL: DIGITS(7, "8320000"),
    PE: DIGITS(5, "15001"),
};
exports.DEFAULT_POSTCODE = {
    required: true,
    pattern: "^[A-Z0-9][A-Z0-9 -]{1,10}$",
    placeholder: "",
    label: "Postcode",
};
function postcodeFor(countryCode) {
    var _a;
    const code = String(countryCode || "").toUpperCase();
    return (_a = exports.POSTCODES[code]) !== null && _a !== void 0 ? _a : exports.DEFAULT_POSTCODE;
}
function validatePostcode(countryCode, value) {
    const spec = postcodeFor(countryCode);
    const raw = String(value || "").trim().toUpperCase();
    const what = midSentence(spec.label || "Postcode");
    if (!raw)
        return spec.required ? `Enter your ${what}` : null;
    if (!spec.required)
        return null;
    if (!spec.pattern)
        return null;
    return new RegExp(spec.pattern).test(raw)
        ? null
        : `That does not look like a ${what}${spec.placeholder ? ` — they look like ${spec.placeholder}` : ""}`;
}
function midSentence(label) {
    if (/^[A-Z][A-Z]/.test(label))
        return label;
    return label.charAt(0).toLowerCase() + label.slice(1);
}
