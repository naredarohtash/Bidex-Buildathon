export declare const baseStringSchema: (
  description: string,
  maxLength?: number,
  minLength?: number,
  nullable?: boolean,
  pattern?: string | RegExp | null,
  expectedFormat?: string | null
) => any;

export declare const baseNumberSchema: (description: string, nullable?: boolean) => any;
export declare const baseBooleanSchema: (description: string) => any;
export declare const baseEnumSchema: (description: string, allowedValues: string[]) => any;
export declare const baseIntegerSchema: (description: string, nullable?: boolean) => any;
export declare const baseObjectSchema: (description: string, additionalProperties?: boolean, nullable?: boolean) => any;
export declare const baseDateTimeSchema: (description: string, nullable?: boolean) => any;
