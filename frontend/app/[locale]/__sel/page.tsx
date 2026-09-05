"use client";
import { useState } from "react";
import { CountrySelect } from "@/components/ui/country-select";
import { StateSelect } from "@/components/ui/state-select";
import { CitySelect } from "@/components/ui/city-select";

export default function Probe() {
  const [cc, setCc] = useState("");
  const [st, setSt] = useState("");
  const [ct, setCt] = useState("");
  return (
    <div className="p-8 space-y-4 max-w-md">
      <div data-probe="country"><CountrySelect value={cc} onValueChange={(v) => { setCc(v); setSt(""); setCt(""); }} /></div>
      <div data-probe="state"><StateSelect countryCode={cc} value={st} onValueChange={(v) => { setSt(v); setCt(""); }} disabled={!cc} /></div>
      <div data-probe="city"><CitySelect countryCode={cc} stateName={st} value={ct} onValueChange={setCt} disabled={!st} /></div>
      <pre data-probe="out">{JSON.stringify({ cc, st, ct })}</pre>
    </div>
  );
}
