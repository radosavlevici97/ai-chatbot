export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      {/* Subtle gradient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute -bottom-1/2 right-0 h-[400px] w-[400px] rounded-full bg-primary/[0.02] blur-3xl" />
      </div>
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
