import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, RequireAuth } from './auth';
import { LinkPage, LoginPage, SetupPage } from './pages/auth';
import { HomePage, JoinPage, ModulePage, QuizPage } from './pages/learner';
import { FollowPage, PresentPage, TvPage } from './pages/live';
import {
  AdminLayout, ClassesPage, ContentPage, DashboardPage, NeedsAnswersPage, PreviewPage, UsersPage,
} from './pages/admin';

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="headline text-4xl">Page not found</h1>
      <Link to="/" className="text-cyan underline">Go home</Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/invite/:token" element={<LinkPage kind="invite" />} />
          <Route path="/reset/:token" element={<LinkPage kind="reset" />} />
          <Route path="/tv/:code" element={<TvPage />} />
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/module/:id" element={<RequireAuth><ModulePage /></RequireAuth>} />
          <Route path="/module/:id/quiz" element={<RequireAuth><QuizPage /></RequireAuth>} />
          <Route path="/join" element={<RequireAuth><JoinPage /></RequireAuth>} />
          <Route path="/live/:code" element={<RequireAuth><FollowPage /></RequireAuth>} />
          <Route path="/present/:id" element={<RequireAuth staff><PresentPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth staff><AdminLayout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="content/:id" element={<PreviewPage />} />
            <Route path="needs-answers" element={<NeedsAnswersPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
