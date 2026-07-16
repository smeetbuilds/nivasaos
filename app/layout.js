import "@/app/globals.css";

export const metadata = {
  title: { default: "NivasaOS", template: "%s · NivasaOS" },
  description: "Self-hosted property operations for boarding houses, apartments, and rentals."
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
