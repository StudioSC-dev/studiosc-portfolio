import type { Metadata } from "next";
import ContactHeader from "@/components/contact/ContactHeader";
import ContactForm from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with StudioSC for custom software development, QA auditing, and technical consulting. We'll get back to you within 2 business days.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <ContactHeader />
      <ContactForm />
    </div>
  );
}
