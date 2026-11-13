import React, { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileText,
  Home,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthView } from './components/AuthView';
import { DashboardView } from './components/DashboardView';
import { DisciplinesView } from './components/DisciplinesView';
import { ScheduleView } from './components/ScheduleView';
import { SimuladosView } from './components/SimuladosView';
import { ErrorNotebookView } from './components/ErrorNotebookView';
import { MaterialsView } from './components/MaterialsView';
import { PerformanceView } from './components/PerformanceView';
import { CONCURSO_PROFILE, formatDateKey } from './data/alepaSyllabus';
import { useStudyAlert } from './hooks/useStudyAlert';
import { NavSection } from './types';

function CampusShell() {
  const {
    user,
    profile,
    authLoading,
    logout,
    resendVerification,
    refreshAuthState,
    syncError,
    clearSyncError,
    studySessions,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<NavSection>('dashboard');
  const [timerPreset, setTimerPreset] = useState<{ disciplineId?: string; topicTitle?: string }>({});
  const [verificationSent, setVerificationSent] = useState(false);

  const todayKey = formatDateKey(new Date());
  const dailyGoal = profile?.dailyGoalMinutes || CONCURSO_PROFILE.dailyGoalMinutes;
  const minutesToday = studySessions
    .filter((s) => s.dateKey === todayKey)
    .reduce((acc, s) => acc + s.durationMinutes, 0);

  const {
    settings: alertSettings,
    updateSettings: updateAlertSettings,
    activeAlertMessage,
    dismissAlert,
    notificationPermission,
    requestNotificationPermission,
    fireStudyAlert,
  } = useStudyAlert(minutesToday, dailyGoal);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="font-display text-xl font-bold text-slate-900">Meu Campus – ALEPA</p>
          <p className="text-sm text-slate-500">Carregando área de estudos...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  const desktopNavItems: Array<{ id: NavSection; label: string }> = [
    { id: 'disciplines', label: 'Disciplinas' },
    { id: 'schedule', label: 'Cronograma' },
    { id: 'simulados', label: 'Simulados' },
    { id: 'revisions', label: 'Revisões' },
    { id: 'materials', label: 'Materiais' },
  ];

  const mobileTabs: Array<{ id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Início', icon: Home },
    { id: 'disciplines', label: 'Edital', icon: BookOpen },
    { id: 'schedule', label: '2h/dia', icon: CalendarDays },
    { id: 'simulados', label: 'Questões', icon: CheckSquare },
    { id: 'materials', label: 'Arquivos', icon: FileText },
  ];

  const handleStartFocusTimer = (disciplineId: string, topicTitle: string) => {
    setTimerPreset({ disciplineId, topicTitle });
    setActiveTab('schedule');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Desktop Top Bar (3-zone Contract) + Compact Mobile Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left"
          >
            Meu Campus – ALEPA
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {desktopNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  activeTab === item.id
                    ? 'border-[#0B3321] text-slate-900 font-semibold'
                    : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={logout}
              title={`Sair (${profile?.displayName || user.email || ''})`}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#0B3321] hover:bg-[#134b32] rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-12 space-y-6">
        {activeTab !== 'dashboard' && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="font-medium text-[#0B3321] hover:underline"
              >
                Painel do Estudante
              </button>
              <span aria-hidden="true">/</span>
              <span className="text-slate-900 font-medium">
                {activeTab === 'disciplines' && 'Disciplinas'}
                {activeTab === 'schedule' && 'Cronograma 2h'}
                {activeTab === 'simulados' && 'Simulados'}
                {activeTab === 'revisions' && 'Revisões'}
                {activeTab === 'materials' && 'Materiais'}
                {activeTab === 'performance' && 'Desempenho'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('performance')}
              className={`inline-flex items-center gap-1.5 font-medium hover:text-slate-900 ${
                activeTab === 'performance' ? 'text-[#0B3321] underline' : 'text-slate-600'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Histórico de desempenho</span>
            </button>
          </div>
        )}

        {activeAlertMessage && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-[#146C43] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Alerta de Estudos · Meu Campus ALEPA</p>
                <p className="text-xs text-slate-700 mt-0.5">{activeAlertMessage}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  dismissAlert();
                  setActiveTab('schedule');
                }}
                className="min-h-[38px] px-3.5 py-1.5 bg-[#0B3321] text-white text-xs font-semibold rounded-xl"
              >
                Iniciar estudos
              </button>
              <button
                type="button"
                onClick={dismissAlert}
                className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-xl"
              >
                Dispensar
              </button>
            </div>
          </div>
        )}

        {!user.emailVerified && (
          <div
            role="status"
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-950">
                <p className="font-semibold">Confirme seu e-mail para liberar a sincronização na nuvem</p>
                <p className="text-xs text-amber-900 mt-0.5">
                  Enviamos um link de confirmação para <strong>{user.email}</strong>. Após clicar no link, toque em
                  “Já verifiquei”.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  await resendVerification();
                  setVerificationSent(true);
                }}
                className="min-h-[40px] px-3 py-1.5 text-xs font-medium bg-white border border-amber-300 rounded-xl text-amber-900"
              >
                {verificationSent ? 'Reenviado' : 'Reenviar link'}
              </button>
              <button
                type="button"
                onClick={refreshAuthState}
                className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold bg-amber-800 text-white rounded-xl inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Já verifiquei</span>
              </button>
            </div>
          </div>
        )}

        {syncError && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-4"
          >
            <span>{syncError}</span>
            <button type="button" onClick={clearSyncError} className="text-xs font-semibold underline">
              Fechar
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            onNavigate={setActiveTab}
            onStartFocusTimer={handleStartFocusTimer}
            alertSettings={alertSettings}
          />
        )}
        {activeTab === 'disciplines' && <DisciplinesView />}
        {activeTab === 'schedule' && (
          <ScheduleView
            initialDisciplineId={timerPreset.disciplineId}
            initialTopicTitle={timerPreset.topicTitle}
            alertSettings={alertSettings}
            onUpdateAlertSettings={updateAlertSettings}
            notificationPermission={notificationPermission}
            onRequestNotificationPermission={requestNotificationPermission}
            onTestAlert={() => fireStudyAlert(undefined, true)}
          />
        )}
        {activeTab === 'simulados' && <SimuladosView />}
        {activeTab === 'revisions' && <ErrorNotebookView />}
        {activeTab === 'materials' && <MaterialsView />}
        {activeTab === 'performance' && <PerformanceView />}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb Zone, <= 15% viewport cap) */}
      <nav
        aria-label="Navegação mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 h-16"
      >
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] ${
                isActive ? 'text-[#0B3321] font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-tight mt-1">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CampusShell />
    </AuthProvider>
  );
}
