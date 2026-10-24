import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { AppShell } from '@/app/app-shell'
import { UiStateProvider } from '@/app/ui-state'
import { LoadingBlock } from '@/components/common/states'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/lib/theme'

const Landing = lazy(() => import('@/pages/landing'))
const Login = lazy(() => import('@/pages/login'))
const Docs = lazy(() => import('@/pages/docs'))
const NotFound = lazy(() => import('@/pages/not-found'))
const Dashboard = lazy(() => import('@/pages/app/dashboard'))
const Agents = lazy(() => import('@/pages/app/agents'))
const AgentNew = lazy(() => import('@/pages/app/agent-new'))
const AgentDetail = lazy(() => import('@/pages/app/agent-detail'))
const Workflows = lazy(() => import('@/pages/app/workflows'))
const Skills = lazy(() => import('@/pages/app/skills'))
const Knowledge = lazy(() => import('@/pages/app/knowledge'))
const Templates = lazy(() => import('@/pages/app/templates'))
const Projects = lazy(() => import('@/pages/app/projects'))
const ProjectDetail = lazy(() => import('@/pages/app/project-detail'))
const Integrations = lazy(() => import('@/pages/app/integrations'))
const Playground = lazy(() => import('@/pages/app/playground'))
const Evals = lazy(() => import('@/pages/app/evals'))
const Observability = lazy(() => import('@/pages/app/observability'))
const Security = lazy(() => import('@/pages/app/security'))
const Audit = lazy(() => import('@/pages/app/audit'))
const Usage = lazy(() => import('@/pages/app/usage'))
const Team = lazy(() => import('@/pages/app/team'))
const SettingsPage = lazy(() => import('@/pages/app/settings'))
const Notifications = lazy(() => import('@/pages/app/notifications'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
})

/** Scrolls to top on navigation, or to #hash targets when present. */
function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320)
      return () => window.clearTimeout(t)
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <UiStateProvider>
            <BrowserRouter>
              <ScrollManager />
              <Suspense fallback={<LoadingBlock className="px-6" />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/docs" element={<Docs />} />
                  <Route path="/docs/:section" element={<Docs />} />
                  <Route path="/app" element={<AppShell />}>
                    <Route index element={<Dashboard />} />
                    <Route path="agents" element={<Agents />} />
                    <Route path="agents/new" element={<AgentNew />} />
                    <Route path="agents/:id" element={<AgentDetail />} />
                    <Route path="workflows" element={<Workflows />} />
                    <Route path="skills" element={<Skills />} />
                    <Route path="knowledge" element={<Knowledge />} />
                    <Route path="templates" element={<Templates />} />
                    <Route path="projects" element={<Projects />} />
                    <Route path="projects/:id" element={<ProjectDetail />} />
                    <Route path="integrations" element={<Integrations />} />
                    <Route path="playground" element={<Playground />} />
                    <Route path="evals" element={<Evals />} />
                    <Route path="observability" element={<Observability />} />
                    <Route path="security" element={<Security />} />
                    <Route path="audit" element={<Audit />} />
                    <Route path="usage" element={<Usage />} />
                    <Route path="team" element={<Team />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="*" element={<NotFound inApp />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster position="bottom-right" />
          </UiStateProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
