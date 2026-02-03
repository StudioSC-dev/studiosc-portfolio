# StudioSC Portfolio Website

A Next.js portfolio website for StudioSC, showcasing high-integrity engineering and quality assurance services.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Content**: MDX
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **SEO**: Next-SEO
- **Analytics**: Plausible
- **Email**: Resend + React Email
- **Forms**: React Hook Form + Zod
- **Testing**: Playwright
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd studiosc-portfolio
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your:

- `RESEND_API_KEY` - Your Resend API key for email functionality
- `PLAUSIBLE_DOMAIN` - Your Plausible domain (optional)
- `NEXT_PUBLIC_SITE_URL` - Your site URL (e.g., https://studiosc.dev)

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
studiosc-portfolio/
├── app/                    # Next.js App Router pages
│   ├── about/             # About Us page
│   ├── blog/              # Blog pages
│   ├── contact/           # Contact page
│   └── api/               # API routes
├── components/            # React components
│   ├── layout/           # Header, Footer
│   ├── home/             # Homepage components
│   ├── about/            # About page components
│   ├── contact/          # Contact form components
│   ├── blog/             # Blog components
│   └── ui/               # Reusable UI components
├── content/              # MDX blog posts
├── lib/                  # Utility functions
├── public/               # Static assets
└── types/                # TypeScript type definitions
```

## Features

- **Homepage**: Hero section with brand messaging and two-pillar layout
- **About Page**: Individual sections for Seth and Christine with Mini-CV format
- **Blog**: MDX-powered blog with dynamic routing
- **Contact Form**: Full-featured contact form with email integration
- **Responsive Design**: Mobile-first, fully responsive
- **SEO Optimized**: Comprehensive SEO setup with Next-SEO
- **Analytics**: Plausible analytics integration
- **Animations**: Smooth Framer Motion animations throughout

## Testing

Run Playwright E2E tests:

```bash
npm run test:e2e
```

Run tests in UI mode:

```bash
npm run test:e2e:ui
```

## Code Quality

This project uses:

- **ESLint** for linting
- **Prettier** for code formatting
- **Husky** for git hooks
- **lint-staged** for pre-commit checks

Code is automatically formatted and linted before commits.

## Deployment

This project is configured for deployment on Vercel. The GitHub Actions CI/CD pipeline will:

1. Run linting and type checking
2. Run Playwright E2E tests
3. Build the Next.js application

## Environment Variables

See `.env.example` for required environment variables.

## License

Private - StudioSC
