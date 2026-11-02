import './globals.css';
import Header from '@/components/Header';

export const metadata = {
  title: 'CivicPulse - Report and track civic issues',
  description: 'Report potholes, broken footpaths, garbage and other civic issues, and track them until they are fixed.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
