import './globals.css'
import { Toaster } from "@/components/ui/sonner"

export const metadata = {
  title: 'Smart Attendance & Workstation Monitoring System',
  description: 'AI-powered face recognition attendance and live workstation monitoring system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-slate-50 text-slate-900 antialiased min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
