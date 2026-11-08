import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Toaster } from './components/Toaster';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { RoomPage } from './pages/RoomPage';
import { usePrefsStore } from './stores/prefsStore';

export default function App() {
  const lang = usePrefsStore((s) => s.lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/r/:code" element={<RoomPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  );
}
