// Shared shell for the auth screens — a centered "work order" sheet on the
// industrial theme.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center py-6 md:py-12 animate-powerOn">
      <div className="w-full max-w-md card-ind">
        <div className="h-2 w-full hazard-stripes" aria-hidden="true" />
        <div className="p-6 md:p-8">{children}</div>
      </div>
    </div>
  );
}
