"use client";

/**
 * Pick a time zone, with the flag of the place it is in.
 *
 * It was a native `<select>` holding sixty-odd `<option>`s. A native option can
 * hold text and nothing else, so the zone list was the one place in this
 * product where a country appeared without its flag — and the only way to put
 * one in would have been the emoji, which is a waving rectangle on Apple's
 * platforms and two letters in a box on much of Windows. It also opened as a
 * sixty-row list with no search, from Madrid to Sydney, in a dropdown that took
 * over the screen.
 *
 * Built on the same Popover and Command the country picker uses, so the two
 * behave alike: type to filter, arrows to move, Enter to choose. The flag is
 * the flat asset (`Flag`), and UTC — which is not a country — keeps a globe.
 *
 * The offset is read live rather than stored, because half these zones change
 * theirs twice a year. See `zoneLabel`.
 */

import * as React from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Flag } from "@/components/ui/flag";
import { TIME_ZONES, findZone, utcOffset, type TimeZone } from "@/lib/time-zones";

/** The flag, or a globe for the one zone that belongs to everybody. */
function ZoneMark({ zone }: { zone: TimeZone }) {
  if (!zone.flagCode || zone.flagCode === "GLO") {
    return <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Flag code={zone.flagCode} title={zone.name} />;
}

export function TimeZoneSelect({
  value,
  onValueChange,
  placeholder = "Not set",
  disabled,
  className,
}: {
  value?: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  /* An old name still resolves to its entry — `Asia/Calcutta` is `Asia/Kolkata`
     — so a profile saved years ago opens on the right row rather than on
     nothing. */
  const selected = findZone(value);

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
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <ZoneMark zone={selected} />
              <span className="truncate">
                {selected.name} · {utcOffset(selected.id)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{value || placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[10060]" align="start">
        <Command>
          <CommandInput placeholder="Search a city or country…" />
          <CommandList>
            <CommandEmpty>No time zone found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {TIME_ZONES.map((zone) => (
                <CommandItem
                  key={zone.id}
                  /* Searched on both the place and the abbreviation, so "IST"
                     finds India and "Kolkata" finds it too. */
                  value={`${zone.name} ${zone.label} ${zone.id}`}
                  onSelect={() => {
                    onValueChange(zone.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected?.id === zone.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="mr-2 flex w-4 shrink-0 justify-center">
                    <ZoneMark zone={zone} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{zone.name}</span>
                  <span className="ml-2 shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                    {utcOffset(zone.id)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default TimeZoneSelect;
