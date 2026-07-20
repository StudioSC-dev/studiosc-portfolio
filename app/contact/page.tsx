import type { Metadata } from "next";
import PageHeader from "@/components/layout/PageHeader";
import ContactForm from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with StudioSC for custom software development, QA auditing, and technical consulting. We'll get back to you within 2 business days.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader
        label="Contact"
        title="Contact Us"
        lead="Let's build (and break) something great. We are currently accepting select inquiries for custom software development, QA auditing, and technical consulting. Tell us a bit about your project, and we'll get back to you within 2 business days."
      />
      <ContactForm />
    </div>
  );
}
