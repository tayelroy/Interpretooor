"use client";

import { useState } from 'react';
import Dashboard from '../../pages/Dashboard';
import Verification from '../../pages/Verification';

export default function TranslatePage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  if (selectedJobId) {
    return <Verification onBack={() => setSelectedJobId(null)} />;
  }

  return <Dashboard onJobSelect={setSelectedJobId} />;
}
