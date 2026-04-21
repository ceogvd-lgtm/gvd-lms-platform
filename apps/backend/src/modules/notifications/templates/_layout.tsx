import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type * as React from 'react';

/**
 * Shared email layout — wraps each template with a consistent header, body
 * container, and footer. Email clients are finicky so we use inline-friendly
 * styles and the standard React Email primitives which render to a
 * well-tested HTML subset.
 *
 * Color tokens match the GVD design system:
 *   primary: #2563EB   secondary: #7C3AED
 *   surface: #F8FAFC   border:    #E2E8F0
 *   text:    #020817   muted:     #64748B
 */
export interface EmailLayoutProps {
  /** Preheader — 1-line preview shown in email client inbox list. */
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="vi">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Text style={styles.brand}>
              GVD <span style={styles.brandAccent}>next-gen</span>
            </Text>
          </Section>

          {/* Main content */}
          <Section style={styles.card}>{children}</Section>

          {/* Footer */}
          <Section style={styles.footer}>
            <Hr style={styles.hr} />
            <Text style={styles.footerText}>
              GVD simvana — Hệ thống đào tạo thực hành kỹ thuật công nghiệp
            </Text>
            <Text style={styles.footerTextMuted}>
              Bạn nhận được email này vì đã đăng ký tài khoản GVD. Nếu bạn không thực hiện hành động
              này, vui lòng bỏ qua email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: '#F1F5F9',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Plus Jakarta Sans", Roboto, sans-serif',
    color: '#020817',
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '32px 16px',
  },
  header: {
    textAlign: 'center',
    paddingBottom: '24px',
  },
  brand: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#2563EB',
    margin: 0,
  },
  brandAccent: {
    color: '#7C3AED',
    fontWeight: 700,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '40px 32px',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
  },
  footer: {
    paddingTop: '24px',
    textAlign: 'center',
  },
  hr: {
    border: 'none',
    borderTop: '1px solid #E2E8F0',
    margin: '0 0 16px',
  },
  footerText: {
    fontSize: '13px',
    color: '#475569',
    margin: '0 0 4px',
  },
  footerTextMuted: {
    fontSize: '12px',
    color: '#94A3B8',
    margin: 0,
    lineHeight: '1.5',
  },
};
