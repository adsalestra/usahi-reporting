import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={title:'USAHI | Marketing Reports',description:'USA Home Improvement reporting and client reviews',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
