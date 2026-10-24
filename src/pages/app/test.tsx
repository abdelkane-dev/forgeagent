import { PickGate } from '@/components/agent/agent-picker'
import { useAgentPick } from '@/components/agent/use-agent-pick'
import { TestConsole } from '@/components/agent/test-console'
import { LinkButton } from '@/components/common/link-button'
import { PageHeader } from '@/components/common/page'
import { L } from '@/labels'

export default function TestPage() {
  const pick = useAgentPick()
  return (
    <>
      <PageHeader title={L.nav.test} description="Environnement de test : outils simulés, aucune action réelle, coûts suivis mais non budgétés. Les suites d’évaluation se gèrent dans l’espace de l’agent." />
      <PickGate pick={pick}>
        {(agent) => (
          <>
            <TestConsole key={agent.id} agent={agent} />
            <div className="mt-8">
              <LinkButton to={`/app/agents/${agent.id}?tab=tests`} variant="outline">
                Évaluations et historique des scores
              </LinkButton>
            </div>
          </>
        )}
      </PickGate>
    </>
  )
}
