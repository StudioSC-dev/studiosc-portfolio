import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { render } from "@react-email/render";
import ContactEmail from "@/lib/email";

const contactFormSchema = z.object({
  name: z.string().min(2),
  company: z.string().min(2),
  service: z.enum(["full-stack", "qa", "full-cycle", "employment"]),
  projectGoals: z.string().min(10),
  estimatedBudget: z.string().optional(),
  referralSource: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = contactFormSchema.parse(body);

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const serviceLabels: Record<string, string> = {
      "full-stack": "Full-Stack Development (The Build)",
      qa: "QA Strategy & Automation (The Quality)",
      "full-cycle": 'The "Full Cycle" (Dev + QA)',
      employment: "Full-time / Employment Inquiry",
    };

    const emailHtml = await render(
      ContactEmail({
        name: validatedData.name,
        company: validatedData.company,
        service: serviceLabels[validatedData.service],
        projectGoals: validatedData.projectGoals,
        estimatedBudget: validatedData.estimatedBudget || "Not provided",
        referralSource: validatedData.referralSource || "Not provided",
      })
    );

    const { data, error } = await resend.emails.send({
      from: "StudioSC Contact <onboarding@resend.dev>",
      to: ["hello@studiosc.dev"],
      subject: `New Contact Form Submission from ${validatedData.name}`,
      html: emailHtml,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Email sent successfully", id: data?.id },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid form data", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
