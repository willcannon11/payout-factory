import './globals.css';

export const metadata = {
  title: 'Payout Factory',
  description: 'Trading, HelmsBriscoe, and tax operating dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
