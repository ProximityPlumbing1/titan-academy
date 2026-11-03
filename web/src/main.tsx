import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
// Fonts are served from our own domain: faster than Google Fonts, and they work offline.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/fraunces/500-italic.css';
import '@fontsource/fraunces/600-italic.css';
import './styles.css';
import { Loading } from './ui';
import { registerServiceWorker } from './offline';
import { AuthProvider, RequireAuth } from './auth';
import { LinkPage, LoginPage, SetupPage } from './pages/auth';
import { HomePage, JoinPage, LessonPage, ModulePage, QuizPage } from './pages/learner';
import { ReviewPage } from './pages/program';
import { CertificatePage, FinalPage, VerifyPage } from './pages/certificates';

// Admin, presenter and TV screens load on demand, so techs' phones don't download them.
const pick = <M, K extends keyof M>(load: () => Promise<M>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] as unknown as ComponentType })));
const live = () => import('./pages/live');
const admin = () => import('./pages/admin');
const FollowPage = pick(live, 'FollowPage');
const PresentPage = pick(live, 'PresentPage');
const TvPage = pick(live, 'TvPage');
const AdminLayout = pick(admin, 'AdminLayout');
const DashboardPage = pick(admin, 'DashboardPage');
const UsersPage = pick(admin, 'UsersPage');
const ClassesPage = pick(admin, 'ClassesPage');
const ContentPage = pick(admin, 'ContentPage');
const PreviewPage = pick(admin, 'PreviewPage');
const NeedsAnswersPage = pick(admin, 'NeedsAnswersPage');
const ProgramPage = pick(() => import('./pages/program'), 'ProgramPage');
const SignoffsAdminPage = pick(() => import('./pages/program'), 'SignoffsAdminPage');
const CertificatesAdminPage = pick(() => import('./pages/certificates'), 'CertificatesAdminPage');
const ScoreboardPage = pick(() => import('./pages/scoreboard'), 'ScoreboardPage');

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="headline text-4xl">Page not found</h1>
      <Link to="/" className="text-link underline">Go home</Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/invite/:token" element={<LinkPage kind="invite" />} />
          <Route path="/reset/:token" element={<LinkPage kind="reset" />} />
          <Route path="/tv/:code" element={<TvPage />} />
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/module/:id" element={<RequireAuth><ModulePage /></RequireAuth>} />
          <Route path="/module/:id/quiz" element={<RequireAuth><QuizPage /></RequireAuth>} />
          <Route path="/module/:id/lesson/:n" element={<RequireAuth><LessonPage /></RequireAuth>} />
          <Route path="/join" element={<RequireAuth><JoinPage /></RequireAuth>} />
          <Route path="/review" element={<RequireAuth><ReviewPage /></RequireAuth>} />
          <Route path="/final" element={<RequireAuth><FinalPage /></RequireAuth>} />
          <Route path="/certificate" element={<RequireAuth><CertificatePage /></RequireAuth>} />
          <Route path="/verify/:number" element={<VerifyPage />} />
          <Route path="/live/:code" element={<RequireAuth><FollowPage /></RequireAuth>} />
          <Route path="/present/:id" element={<RequireAuth staff><PresentPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth staff><AdminLayout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="program" element={<ProgramPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="signoffs" element={<SignoffsAdminPage />} />
            <Route path="certificates" element={<CertificatesAdminPage />} />
            <Route path="scoreboard" element={<ScoreboardPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="content/:id" element={<PreviewPage />} />
            <Route path="needs-answers" element={<NeedsAnswersPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorker();
