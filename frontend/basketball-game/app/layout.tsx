import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '농구 챌린지 | 단국대 축제 주점',
  description: '농구공을 드래그해 골대에 넣고 최고 점수에 도전하세요.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
