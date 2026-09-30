import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import NotFound from './pages/NotFound'
import Photos from './pages/Photos'
import Projects from './pages/Projects'
import ResumePage from './pages/ResumePage'

/** The owner's editing area. Its own chunk, so no visitor downloads it. */
const Studio = lazy(() => import('./admin/Studio'))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="resume" element={<ResumePage />} />
          <Route path="projects" element={<Projects />} />
          <Route path="photos" element={<Photos />} />
          <Route
            path="studio"
            element={
              <Suspense fallback={null}>
                <Studio />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
