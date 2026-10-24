import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
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
const AgentWorkspace = lazy(() => import('@/pages/app/agent'))
const Skills = lazy(() => import('@/pages/app/skills'))
const TestPage = lazy(() => import('@/pages/app/test'))
const IntegrationPage = lazy(() => import('@/pages/app/integration'))
const LogsPage = lazy(() => import('@/pages/app/logs'))
const Projects = lazy(() => import('@/pages/app/projects'))
const ProjectDetail = lazy(() => import('@/pages/app/project-detail'))
const Forge = lazy(() => import('@/pages/app/forge'))
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
                    <Route path="agents/:id" element={<AgentWorkspace />} />
                    <Route path="skills" element={<Skills />} />
                    <Route path="test" element={<TestPage />} />
                    <Route path="integration" element={<IntegrationPage />} />
                    <Route path="logs" element={<LogsPage />} />
                    <Route path="projects" element={<Projects />} />
                    <Route path="projects/:id" element={<ProjectDetail />} />
                    <Route path="forge" element={<Forge />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="notifications" element={<Notifications />} />
                    {/* v1 addresses */}
                    <Route path="playground" element={<Navigate to="/app/test" replace />} />
                    <Route path="integrations" element={<Navigate to="/app/integration" replace />} />
                    <Route path="observability" element={<Navigate to="/app/logs" replace />} />
                    <Route path="internal-team" element={<Navigate to="/app/forge" replace />} />
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
