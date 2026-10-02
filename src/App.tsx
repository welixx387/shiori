import { createBrowserRouter, createHashRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { ErrorPage, NotFound, RequireAuth, Root, SiteLayout } from './components/layout/Layout'
import Home from './pages/Home'

const page = (loader: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await loader()).default,
})

const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <SiteLayout />,
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <Home /> },
          { path: 'catalog', lazy: page(() => import('./pages/Catalog')) },
          { path: 'novel/:slug', lazy: page(() => import('./pages/NovelPage')) },
          { path: 'login', lazy: page(() => import('./pages/Auth')) },
          { path: 'register', lazy: page(() => import('./pages/Auth')) },
          { path: 'reset-password', lazy: page(() => import('./pages/ResetPassword')) },
          {
            path: 'profile/:tab?',
            lazy: async () => {
              const { default: Profile } = await import('./pages/Profile')
              return {
                Component: () => (
                  <RequireAuth>
                    <Profile />
                  </RequireAuth>
                ),
              }
            },
          },
          {
            path: 'admin/*',
            lazy: async () => {
              const { default: Admin } = await import('./pages/admin/Admin')
              return {
                Component: () => (
                  <RequireAuth admin>
                    <Admin />
                  </RequireAuth>
                ),
              }
            },
          },
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: 'read/:slug/:chapterId', lazy: page(() => import('./pages/Reader')) },
    ],
  },
]

const useHash = import.meta.env.VITE_ROUTER === 'hash'
const basename = useHash ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

const router = (useHash ? createHashRouter : createBrowserRouter)(routes, { basename })

export default function App() {
  return <RouterProvider router={router} />
}
