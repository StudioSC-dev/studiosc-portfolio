import type { Metadata } from "next";
import RangeHome from "@/components/home/RangeHome";

// The new home ahead of the switch (PRV-11): unlisted, never indexed, and
// linked from nowhere.
export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

export default function PreviewHomePage() {
  return <RangeHome />;
}
