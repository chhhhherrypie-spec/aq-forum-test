import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '同好交流论坛',
  description:
    '答题加入，分享文字、图片、视频和日常。属于同频伙伴的私密交流社区。',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
