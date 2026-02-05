import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
} from "@react-email/components";

interface ContactEmailProps {
  name: string;
  email: string;
  company: string;
  service: string;
  projectGoals: string;
  estimatedBudget: string;
  referralSource: string;
}

export default function ContactEmail({
  name,
  email,
  company,
  service,
  projectGoals,
  estimatedBudget,
  referralSource,
}: ContactEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>New Contact Form Submission</Heading>
          <Text style={text}>
            You have received a new inquiry from the StudioSC contact form.
          </Text>
          <Hr style={hr} />
          <Section style={section}>
            <Text style={label}>Name:</Text>
            <Text style={value}>{name}</Text>
          </Section>
          <Section style={section}>
            <Text style={label}>Email:</Text>
            <Text style={value}>{email}</Text>
          </Section>
          <Section style={section}>
            <Text style={label}>Company:</Text>
            <Text style={value}>{company}</Text>
          </Section>
          <Section style={section}>
            <Text style={label}>Service Interest:</Text>
            <Text style={value}>{service}</Text>
          </Section>
          <Section style={section}>
            <Text style={label}>Project Goals:</Text>
            <Text style={value}>{projectGoals}</Text>
          </Section>
          <Section style={section}>
            <Text style={label}>Estimated Budget:</Text>
            <Text style={value}>{estimatedBudget}</Text>
          </Section>
          <Section style={section}>
            <Text style={label}>How they heard about us:</Text>
            <Text style={value}>{referralSource}</Text>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            This email was sent from the StudioSC contact form.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "560px",
};

const h1 = {
  fontSize: "24px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#484848",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
};

const section = {
  marginBottom: "16px",
};

const label = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#666666",
  marginBottom: "4px",
};

const value = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#484848",
  marginTop: "0",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
};

const footer = {
  fontSize: "12px",
  lineHeight: "24px",
  color: "#999999",
  marginTop: "20px",
};
