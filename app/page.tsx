"use client";

import { useState } from 'react';
import Navigation from './components/Navigation';
import SmoothScroll from './components/SmoothScroll';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Verification from './pages/Verification';
import Write from './pages/Write';
import Reader from './pages/Reader';
import { AnimatePresence, motion } from 'motion/react';

export default function App() {
  const [currentPath, setCurrentPath] = useState('home');

  const renderContent = () => {
    switch (currentPath) {
      case 'home':
        return <Home />;
      case 'dashboard':
        return <Dashboard onJobSelect={() => setCurrentPath('verification')} />;
      case 'verification':
        return <Verification onBack={() => setCurrentPath('dashboard')} />;
      case 'write':
        return <Write />;
      case 'reader':
        return <Reader />;
      default:
        return <Home />;
    }
  };

  return (
    <SmoothScroll>
      <div className="min-h-screen relative selection:bg-pale-lavender selection:text-ink">
        <Navigation
          currentPath={currentPath === 'verification' ? 'dashboard' : currentPath}
          onNavigate={(path) => setCurrentPath(path)}
        />

        <main>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPath}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </SmoothScroll>
  );
}