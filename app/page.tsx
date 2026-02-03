import type { Metadata } from "next";
import Hero from "@/components/home/Hero";
import TwoPillar from "@/components/home/TwoPillar";

export const metadata: Metadata = {
  title: "Home",
  description:
    "We build and harden digital products. StudioSC combines senior-level development with expert QA to deliver software that scales and survives the real world.",
};

export default function Home() {
  return (
    <>
      <Hero />
      <TwoPillar />
    </>
  );
}
