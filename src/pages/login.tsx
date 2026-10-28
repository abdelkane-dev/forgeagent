import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, isDemo } from '@/api'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { LogoMark } from '@/components/brand/logo'
import { Field } from '@/components/common/field'
import { HexLoader } from '@/components/common/hex-loader'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Mode = 'login' | 'signup' | 'reset'

/** Official marks, as their sign-in guidelines ask. */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5Z" />
    </svg>
  )
}

/**
 * Sign-in screen of a self-hosted instance. Front-end only: the real session
 * is created by the back-end (POST /v1/auth/login) once VITE_API_URL is set.
 */
export default function Login() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const mode = (params.get('mode') as Mode) || 'login'
  const [name, setName] = useState('')
  const [email, setEmail] = useState(() => params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState(() => {
    const e = params.get('error')
    const initial: Record<string, string> = e ? { form: e } : {}
    return initial
  })
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: api.auth.providers, staleTime: 60_000 })
  const signup = providers.data?.signup ?? 'open'
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const qc = useQueryClient()
  const next = params.get('next')
  const invite = params.get('invite')

  const welcome = (user: Awaited<ReturnType<typeof api.auth.login>>, created = false) => {
    qc.setQueryData(['me'], user)
    toast.success(created ? 'Compte créé, bienvenue' : `Bonjour ${user.name}`)
    navigate(next && next.startsWith('/app') ? next : '/app')
  }

  /** One click on a demo account: fills the form and signs in. */
  const demoSignIn = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail)
    setPassword(demoPassword)
    setErrors({})
    setPending(true)
    try {
      welcome(await api.auth.login(demoEmail, demoPassword))
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Connexion impossible' })
    } finally {
      setPending(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (mode === 'signup' && name.trim().length < 2) errs.name = 'Indiquez votre nom.'
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Adresse email invalide.'
    if (mode !== 'reset' && password.length < (mode === 'signup' || invite ? 10 : 1)) errs.password = mode === 'signup' || invite ? '10 caractères minimum.' : 'Saisissez votre mot de passe.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setPending(true)
    try {
      if (mode === 'reset') {
        await api.auth.resetRequest(email)
        return setSent(true)
      }
      const user =
        invite && mode === 'login'
          ? await api.auth.acceptInvite(email, invite, password)
          : mode === 'signup'
            ? await api.auth.signup(name, email, password)
            : await api.auth.login(email, password)
      welcome(user, mode === 'signup')
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Connexion impossible' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.04em]">
            <LogoMark /> ForgeAgent
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Retour au site
          </Link>
        </div>
        <main className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center py-12">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.04em]">
            {mode === 'signup' ? (signup === 'first' ? 'Créer le compte administrateur' : 'Créer votre compte') : mode === 'reset' ? 'Réinitialiser le mot de passe' : 'Connexion à votre instance'}
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {mode === 'reset' ? 'Nous vous enverrons un lien valable 30 minutes.' : 'Instance auto-hébergée : vos identifiants ne quittent jamais votre serveur.'}
          </p>
          {mode !== 'reset' && (
            <UnderlineTabs
              label="Mode"
              className="mt-8"
              value={mode}
              onChange={(v) => {
                setParams(v === 'login' ? {} : { mode: v })
                setErrors({})
              }}
              items={[
                { value: 'login', label: 'Connexion' },
                ...(signup !== 'invite' ? [{ value: 'signup' as const, label: 'Inscription' }] : []),
              ]}
            />
          )}
          {sent ? (
            <div className="mt-8 rounded-lg bg-card p-5 text-[15px]" role="status">
              Si un compte existe pour <b className="font-semibold">{email}</b>, un lien de réinitialisation vient de partir.
              <Button variant="link" className="mt-2 h-auto p-0" onClick={() => { setSent(false); setParams({}) }}>
                Revenir à la connexion
              </Button>
            </div>
          ) : (
            <form className="mt-8 grid gap-5" onSubmit={submit} noValidate>
              {mode === 'signup' && (
                <Field label="Nom" htmlFor="l-name" error={errors.name}>
                  <Input id="l-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
                </Field>
              )}
              <Field label="Adresse email" htmlFor="l-email" error={errors.email}>
                <Input id="l-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
              </Field>
              {mode !== 'reset' && (
                <Field label="Mot de passe" htmlFor="l-pass" error={errors.password} hint={mode === 'signup' || invite ? '10 caractères minimum.' : undefined}>
                  <div className="relative">
                    <Input id="l-pass" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" aria-invalid={!!errors.password} />
                    <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
              )}
              {errors.form && (
                <p role="alert" className="rounded-md bg-danger/12 px-3 py-2 text-[14px] text-danger">
                  {errors.form}
                </p>
              )}
              {invite && <p className="text-[14px] text-muted-foreground">Invitation : choisissez votre mot de passe pour activer votre compte.</p>}
              <Button type="submit" size="lg" disabled={pending} className="mt-1">
                {pending ? <HexLoader /> : mode === 'signup' ? 'Créer mon compte' : mode === 'reset' ? 'Envoyer le lien' : 'Se connecter'}
              </Button>
              {mode === 'login' && (
                <button type="button" onClick={() => setParams({ mode: 'reset' })} className="justify-self-start text-[14px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Mot de passe oublié ?
                </button>
              )}
              {mode === 'reset' && (
                <button type="button" onClick={() => setParams({})} className="justify-self-start text-[14px] font-medium text-muted-foreground hover:text-foreground">
                  Revenir à la connexion
                </button>
              )}
              {mode !== 'reset' && !invite && (
                <div className="grid gap-2">
                  <div className="my-1 flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden>
                    <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
                  </div>
                  {(['github', 'google'] as const).map((p) => {
                    const on = !!providers.data?.[p]
                    const label = p === 'github' ? 'Continuer avec GitHub' : 'Continuer avec Google'
                    return (
                      <Button
                        key={p}
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled={!on}
                        onClick={() => location.assign(api.auth.oauthUrl(p, next && next.startsWith('/app') ? next : undefined))}
                      >
                        {p === 'github' ? <GitHubMark /> : <GoogleMark />} {label}
                      </Button>
                    )
                  })}
                  {providers.data && (!providers.data.github || !providers.data.google) ? (
                    <p className="text-[13px] text-muted-foreground">
                      {!providers.data.github && !providers.data.google ? 'GitHub et Google ne sont pas encore activés' : !providers.data.github ? 'GitHub n’est pas encore activé' : 'Google n’est pas encore activé'} sur ce serveur : renseignez{' '}
                      {[!providers.data.github && 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET', !providers.data.google && 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET'].filter(Boolean).join(' et ')} dans .env, puis redémarrez l’API (README › Inscription et connexion).
                    </p>
                  ) : (
                    mode === 'signup' && <p className="text-[13px] text-muted-foreground">Avec GitHub ou un compte Gmail, le compte est créé à la première connexion. Seules les adresses vérifiées par le fournisseur sont acceptées.</p>
                  )}
                </div>
              )}
            </form>
          )}
          {providers.data?.demo && mode !== 'reset' && (
            <section className="mt-10 rounded-lg bg-card p-4" aria-label="Comptes de démonstration">
              <h2 className="text-[14px] font-semibold">Comptes de démonstration</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Mot de passe commun : <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">{providers.data.demo.password}</code>
              </p>
              <ul className="mt-3 grid gap-2">
                {providers.data.demo.accounts.map((a) => (
                  <li key={a.email} className="flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.email}</span>
                      <span className="block text-[12.5px] text-muted-foreground">{a.label}</span>
                    </span>
                    <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`Entrer en tant que ${a.email}`} onClick={() => demoSignIn(a.email, providers.data!.demo!.password)}>
                      Entrer
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {isDemo && (
            <p className="mt-6 text-[14px] text-muted-foreground">
              Mode démo sans back-end : <Link to="/app" className="font-semibold text-foreground underline underline-offset-4">ouvrez la console</Link> directement.
            </p>
          )}
        </main>
      </div>
      <div className="relative hidden overflow-hidden bg-ember lg:block" aria-hidden>
        <div className="hex absolute top-1/2 left-[18%] aspect-square w-[130%] -translate-y-1/2 bg-background/12" />
        <div className="hex absolute top-[22%] left-[40%] aspect-square w-[28%] bg-ember-ink" />
        <p className="absolute bottom-10 left-10 max-w-[22ch] text-[34px] leading-[1.05] font-extrabold tracking-[-0.04em] text-ember-ink">Vos agents, vos clés, votre serveur.</p>
      </div>
    </div>
  )
}
