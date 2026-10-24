import { Link } from 'react-router'
import { LinkButton } from '@/components/common/link-button'

export default function NotFound({ inApp }: { inApp?: boolean }) {
  return (
    <div className={inApp ? 'py-16' : 'grid min-h-svh place-items-center px-4'}>
      <div className="max-w-md">
        <div className="hex mb-8 size-16 bg-ember" aria-hidden />
        <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.04em]">Page introuvable</h1>
        <p className="mt-2 text-[16px] text-muted-foreground">Ce lien ne mène nulle part. L’agent ou le projet a peut-être été supprimé.</p>
        <div className="mt-8 flex flex-wrap gap-2">
          <LinkButton to="/app">Tableau de bord</LinkButton>
          <LinkButton to="/" variant="outline">
            Accueil
          </LinkButton>
        </div>
        {!inApp && (
          <p className="mt-8 text-[14px] text-muted-foreground">
            Besoin d’aide ? <Link to="/docs" className="underline underline-offset-4">Documentation</Link>
          </p>
        )}
      </div>
    </div>
  )
}
