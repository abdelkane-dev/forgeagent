import { ArrowLeft, Eye, EyeOff, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { LogoMark } from '@/components/brand/logo'
import { Field } from '@/components/common/field'
import { HexLoader } from '@/components/common/hex-loader'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Mode = 'login' | 'signup' | 'reset'

/**
 * Sign-in screen of a self-hosted instance. Front-end only: the real session
 * is created by the back-end (POST /v1/auth/login) once VITE_API_URL is set.
 */
export default function Login() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const mode = (params.get('mode') as Mode) || 'login'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (mode === 'signup' && name.trim().length < 2) errs.name = 'Indiquez votre nom.'
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Adresse email invalide.'
    if (mode !== 'reset' && password.length < 8) errs.password = '8 caractères minimum.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setPending(true)
    setTimeout(() => {
      setPending(false)
      if (mode === 'reset') return setSent(true)
      toast.success(mode === 'login' ? 'Connecté' : 'Compte créé, bienvenue')
      navigate('/app')
    }, 700)
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
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.04em]">
            {mode === 'signup' ? 'Créer le compte administrateur' : mode === 'reset' ? 'Réinitialiser le mot de passe' : 'Connexion à votre instance'}
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
                { value: 'signup', label: 'Inscription' },
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
                <Field label="Mot de passe" htmlFor="l-pass" error={errors.password}>
                  <div className="relative">
                    <Input id="l-pass" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" aria-invalid={!!errors.password} />
                    <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
              )}
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
              {mode !== 'reset' && (
                <Button type="button" variant="outline" size="lg" onClick={() => toast('Configurez l’OAuth GitHub sur votre back-end (variables GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET).')}>
                  <GitBranch /> Continuer avec GitHub
                </Button>
              )}
            </form>
          )}
          <p className="mt-10 text-[14px] text-muted-foreground">
            Juste curieux ? <Link to="/app" className="font-semibold text-foreground underline underline-offset-4">Ouvrez la console en mode démo</Link>.
          </p>
        </main>
      </div>
      <div className="relative hidden overflow-hidden bg-cobalt lg:block" aria-hidden>
        <div className="hex absolute top-1/2 left-[18%] aspect-square w-[130%] -translate-y-1/2 bg-background/12" />
        <div className="hex absolute top-[22%] left-[40%] aspect-square w-[28%] bg-cobalt-ink" />
        <p className="absolute bottom-10 left-10 max-w-[22ch] text-[34px] leading-[1.05] font-extrabold tracking-[-0.04em] text-cobalt-ink">Vos agents, vos clés, votre serveur.</p>
      </div>
    </div>
  )
}
