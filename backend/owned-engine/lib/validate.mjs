/**
 * Input validation — check a request body against a route's JSON-schema-style
 * `requestBody` definition. Covers the subset actually used in this codebase:
 * type (string/integer/number/boolean/object/array), required, minLength,
 * maxLength, enum. Returns { valid, errors:[{field, message}] }.
 *
 * (The current engine uses AJV; this owned version handles the observed subset
 * and can be extended or swapped for AJV without changing the pipeline.)
 */

function titleCase(camel) {
  return camel
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function checkType(value, type) {
  switch (type) {
    case "string": return typeof value === "string";
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value);
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    default: return true; // unknown type -> don't block
  }
}

export function validateBody(schema, body) {
  const errors = [];
  if (!schema || typeof schema !== "object") return { valid: true, errors };

  const props = schema.properties || {};
  const required = schema.required || [];
  const data = body && typeof body === "object" ? body : {};

  for (const field of required) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      errors.push({ field, message: `${titleCase(field)} is required.` });
    }
  }

  for (const [field, rule] of Object.entries(props)) {
    const value = data[field];
    if (value === undefined || value === null) continue; // absent optional field
    if (rule.type && !checkType(value, rule.type)) {
      errors.push({ field, message: `${titleCase(field)} must be a ${rule.type}.` });
      continue;
    }
    if (typeof value === "string") {
      if (rule.minLength != null && value.length < rule.minLength)
        errors.push({ field, message: `${titleCase(field)} must be at least ${rule.minLength} characters.` });
      if (rule.maxLength != null && value.length > rule.maxLength)
        errors.push({ field, message: `${titleCase(field)} must be at most ${rule.maxLength} characters.` });
    }
    if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
      errors.push({ field, message: `${titleCase(field)} must be one of: ${rule.enum.join(", ")}.` });
    }
  }

  return { valid: errors.length === 0, errors };
}
