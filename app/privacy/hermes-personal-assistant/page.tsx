import type { Metadata } from "next";
import PageHeader from "@/components/layout/PageHeader";

export const metadata: Metadata = {
  title: "Hermes Personal Assistant Privacy Policy",
  description:
    "Privacy policy for the Google Workspace integration used by Hermes Personal Assistant.",
  alternates: {
    canonical: "/privacy/hermes-personal-assistant",
  },
};

export default function HermesPersonalAssistantPrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader
        label="Privacy"
        title="Hermes Personal Assistant"
        lead="This policy explains how the personal Google Workspace integration used by Hermes Personal Assistant accesses, uses, stores, and protects Google user data."
      />

      <article className="prose prose-stone max-w-none">
        <p className="text-sm text-muted">Last updated: September 30, 2026</p>

        <h2>Scope</h2>
        <p>
          Hermes Personal Assistant is a private, self-hosted automation
          assistant operated for its account owner. This policy applies only to
          its Google Workspace integration. It does not apply to other StudioSC
          products or services.
        </p>

        <h2>Operator and contact</h2>
        <p>
          This integration is operated as a personal project. Questions about
          this policy or a request to delete locally stored data can be sent to{" "}
          <a href="mailto:sethcharles28@gmail.com">sethcharles28@gmail.com</a>.
        </p>

        <h2>Google data and permissions</h2>
        <p>
          When the account owner connects Google Workspace, the integration may
          request the following permissions to perform user-directed tasks:
        </p>
        <ul>
          <li>
            <strong>Gmail</strong> — read messages and metadata; send messages;
            and modify message state when explicitly requested.
          </li>
          <li>
            <strong>Google Calendar</strong> — read calendars and events;
            create, update, or delete events when explicitly requested.
          </li>
          <li>
            <strong>Google Drive</strong> — search, read, upload, download,
            organize, share, or delete files when explicitly requested.
          </li>
          <li>
            <strong>Google Contacts</strong> — read contacts to identify people
            relevant to a user-directed task.
          </li>
          <li>
            <strong>Google Sheets and Docs</strong> — read, create, and update
            spreadsheets and documents when explicitly requested.
          </li>
        </ul>

        <h2>How Google data is used</h2>
        <p>
          Google data is used only to provide the task, automation, or briefing
          requested by the account owner. For example, scheduled inbox task
          capture reads selected messages and records actionable items locally;
          it does not change Gmail messages. Calendar, email, Drive, Sheets, and
          Docs changes are performed only when the account owner asks for them
          or has approved a specific automation.
        </p>

        <h2>Storage and security</h2>
        <p>
          This integration runs on a self-hosted Hermes installation controlled
          by the account owner. OAuth tokens and any locally retained task data
          are stored on that installation, not on this StudioSC portfolio
          website. Google data is otherwise processed only as needed to complete
          the requested task or automation.
        </p>

        <h2>Sharing and artificial intelligence</h2>
        <p>
          Google user data is not sold, rented, used for advertising, or used to
          determine creditworthiness. When the account owner has configured an
          AI model provider, the specific information needed to fulfill a
          requested task may be sent to that provider solely to produce the
          requested user-facing response or automation. Google user data is not
          used to train generalized artificial intelligence or machine learning
          models.
        </p>
        <p>
          Hermes Personal Assistant&apos;s use and transfer of information
          received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          The account owner can revoke Google access at any time from the{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Account permissions page
          </a>
          . Revocation stops future Google API access. The account owner can
          also remove OAuth tokens and locally retained task data from the
          self-hosted installation, or request help at the contact address
          above.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          Material changes to how this integration handles Google user data will
          be reflected on this page with an updated effective date.
        </p>
      </article>
    </div>
  );
}
