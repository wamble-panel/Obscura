import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage: "url('/brand/mark.png')",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center 42%',
          backgroundSize: 'min(300px, 46%) auto',
        }}
      />
      <div className="relative z-10 flex w-full justify-center">
        <LoginForm next={next && next.startsWith('/') ? next : '/dashboard'} allowSignup />
      </div>
    </main>
  )
}
