import { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "BideX - Indian Binary Broker",
  },
};

export default function BinaryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen-mobile h-screen-mobile bg-background overflow-hidden">
      {children}
    </div>
  );
}
