import { lazy, Suspense } from 'react'
import { PickGate } from '@/components/agent/agent-picker'
import { useAgentPick } from '@/components/agent/use-agent-pick'
import { PageHeader } from '@/components/common/page'
import { LoadingBlock } from '@/components/common/states'
import { L } from '@/labels'

const IntegrationTab = lazy(() => import('./agent/tab-integration'))

export default function IntegrationPage() {
  const pick = useAgentPick()
  return (
    <>
      <PageHeader title={L.nav.integration} description="Reliez un agent à vos sites et services. Clés, secrets, origines et webhooks sont propres à chaque agent." />
      <PickGate pick={pick}>
        {(agent) => (
          <Suspense fallback={<LoadingBlock />}>
            <IntegrationTab key={agent.id} agent={agent} onTab={() => {}} />
          </Suspense>
        )}
      </PickGate>
    </>
  )
}
