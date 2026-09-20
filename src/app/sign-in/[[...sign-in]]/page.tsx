import { SignIn } from '@clerk/nextjs';

import { clerkAppearance } from '@/components/clerkAppearance';

export default function Page() {
  return (
    <div className="washi flex min-h-dvh items-center justify-center bg-sumi px-5 py-12">
      <SignIn appearance={clerkAppearance} />
    </div>
  );
}
