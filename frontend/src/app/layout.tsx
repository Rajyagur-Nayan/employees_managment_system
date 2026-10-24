import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Smart Attendance System',
  description: 'AI-powered face recognition attendance system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
