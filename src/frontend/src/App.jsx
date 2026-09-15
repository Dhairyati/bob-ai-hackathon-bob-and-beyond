import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PredictionProvider } from './PredictionContext';
import Sidebar from './components/Sidebar';
import AlertCenter from './pages/AlertCenter';
import EngineDetail from './pages/EngineDetail';
import FleetAnalytics from './pages/FleetAnalytics';
import FleetDashboard from './pages/FleetDashboard';
import MaintenancePlan from './pages/MaintenancePlan';
import MaintenanceTimeline from './pages/MaintenanceTimeline';
import ModelPerformance from './pages/ModelPerformance';
import ReadinessDashboard from './pages/ReadinessDashboard';
import UploadPredict from './pages/UploadPredict';
import WhatIfSimulator from './pages/WhatIfSimulator';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <BrowserRouter>
      <PredictionProvider>
      <div className="app-layout">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className={`main-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <Routes>
            <Route path="/" element={<FleetDashboard />} />
            <Route path="/engine/:id" element={<EngineDetail />} />
            <Route path="/analytics" element={<FleetAnalytics />} />
            <Route path="/upload" element={<UploadPredict />} />
            <Route path="/alerts" element={<AlertCenter />} />
            <Route path="/model" element={<ModelPerformance />} />
            <Route path="/whatif" element={<WhatIfSimulator />} />
            <Route path="/timeline" element={<MaintenanceTimeline />} />
            <Route path="/readiness" element={<ReadinessDashboard />} />
            <Route path="/maintenance-plan" element={<MaintenancePlan />} />
          </Routes>
        </main>
      </div>
      </PredictionProvider>
    </BrowserRouter>
  );
}
