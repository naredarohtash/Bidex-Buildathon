"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { loadCountriesIndex, type Country } from "@/lib/countries";
import Image from "next/image";
import { useTranslations } from "next-intl";

interface CountrySelectProps {
  value?: string;
  onValueChange: (value: string, phoneCode?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** ISO-2 codes to offer. Omitted, every country is offered. */
  allow?: string[];
}

export function CountrySelect({
  value,
  onValueChange,
  placeholder = "Select country...",
  disabled = false,
  className,
  allow,
}: CountrySelectProps) {
  const t = useTranslations("components");
  const [open, setOpen] = React.useState(false);
  const [countries, setCountries] = React.useState<Country[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Load countries on mount
  /* `allow` narrows the list to the places the caller can actually serve.
     Offering a country a form cannot accept is a dead end someone only finds
     at the end of it. */
  React.useEffect(() => {
    loadCountriesIndex()
      .then((data) => {
        if (!allow || allow.length === 0) return setCountries(data);
        const permitted = new Set(allow.map((c) => c.toUpperCase()));
        setCountries(data.filter((c) => permitted.has(String(c.iso2).toUpperCase())));
      })
      .finally(() => setLoading(false));
    // `allow` is a literal array at every call site; comparing by join keeps
    // this from re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(allow || []).join(",")]);

  const selectedCountry = value
    ? countries.find((c) => c.iso2 === value)
    : null;

  if (loading) {
    return (
      <Button
        variant="outline"
        disabled
        className={cn("w-full justify-between font-normal", className)}
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading_countries_ellipsis")}
        </span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selectedCountry ? (
            <span className="flex items-center gap-2">
              <Image
                src={`/img/flag/${selectedCountry.iso2.toLowerCase()}.webp`}
                alt={selectedCountry.name}
                width={20}
                height={15}
                className="rounded-sm object-cover"
              />
              {selectedCountry.name}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 z-[10050]" align="start">
        <Command>
          <CommandInput placeholder={t("search_country_ellipsis")} />
          <CommandList>
            <CommandEmpty>{t("no_country_found")}</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {countries.map((country) => (
                <CommandItem
                  key={country.iso2}
                  value={country.name}
                  onSelect={() => {
                    onValueChange(country.iso2, country.phonecode);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === country.iso2 ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Image
                    src={`/img/flag/${country.iso2.toLowerCase()}.webp`}
                    alt={country.name}
                    width={20}
                    height={15}
                    className="mr-2 rounded-sm object-cover"
                  />
                  {/* The name, and nothing after it. The dial code used to sit
                      down the right of every row and inside the trigger's
                      brackets — it is the phone field's business, and this is
                      the control people use to say where they live. It still
                      goes back to the caller in `onValueChange`, which is what
                      seeds the phone input; it just is not read out here. */}
                  <span className="flex-1">{country.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
