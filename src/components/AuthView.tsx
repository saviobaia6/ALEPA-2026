import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User as UserIcon, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CONCURSO_PROFILE, getDaysUntilExam } from '../data/alepaSyllabus';
import { UserRole } from '../types';

export function AuthView() {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showProviderHelp, setShowProviderHelp] = useState(false);
  const [imgBannerFailed, setImgBannerFailed] = useState(false);
  const [imgEmblemFailed, setImgEmblemFailed] = useState(false);

  const daysLeft = getDaysUntilExam();

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed') {
      setShowProviderHelp(true);
      return 'O provedor E-mail/Senha ainda não foi ativado no Firebase Console. Ative-o ou entre imediatamente com o botão Google abaixo.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'E-mail ou senha inválidos. Verifique os dados ou crie uma conta nova.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'Este e-mail já possui cadastro. Use a aba Entrar.';
    }
    if (code === 'auth/weak-password') {
      return 'A senha precisa ter pelo menos 6 caracteres.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'A janela de autenticação Google foi fechada antes de concluir.';
    }
    return err instanceof Error ? err.message : 'Não foi possível autenticar agora.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
        if (!displayName.trim()) {
          throw new Error('Informe seu nome completo.');
        }
        await registerWithEmail(email, password, displayName, role);
      }
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Left Institutional Column */}
      <div className="lg:w-1/2 bg-[#0B3321] text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-4">
          {!imgEmblemFailed ? (
            <img
              src="/src/assets/images/alepa_campus_emblem_1794572279329.jpg"
              alt="Emblema Meu Campus ALEPA"
              referrerPolicy="no-referrer"
              onError={() => setImgEmblemFailed(true)}
              className="w-12 h-12 rounded-xl object-cover bg-white p-0.5 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-emerald-700 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <p className="font-display text-lg font-bold tracking-tight text-white">Meu Campus – ALEPA</p>
            <p className="text-xs text-slate-300 tracking-wide">
              Assembleia Legislativa do Estado do Pará · Nível Superior
            </p>
          </div>
        </div>

        <div className="relative z-10 my-10 lg:my-0 space-y-6 max-w-xl">
          <p className="text-xs font-medium tracking-wide text-emerald-300">
            {CONCURSO_PROFILE.editalNumber} · {CONCURSO_PROFILE.board} · Código {CONCURSO_PROFILE.code}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-white">
            Cargo 03 – Assessoramento Legislativo
          </h1>
          <p className="text-base text-slate-200 leading-relaxed max-w-lg">
            Plataforma de estudo direcionado para <strong>Técnico Legislativo ({CONCURSO_PROFILE.code})</strong>, com
            plano diário de 2 horas, checklist oficial do Anexo II, simulados no padrão CETAP, caderno de erros e
            biblioteca integrada de PDF, PowerPoint e Excel.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/15">
            <div>
              <p className="text-xs text-slate-300">Prova Objetiva</p>
              <p className="font-mono text-lg font-semibold tabular-nums mt-1">13/12/2026</p>
            </div>
            <div>
              <p className="text-xs text-slate-300">Contagem</p>
              <p className="font-mono text-lg font-semibold tabular-nums mt-1">{daysLeft} dias</p>
            </div>
            <div>
              <p className="text-xs text-slate-300">Meta Diária</p>
              <p className="font-mono text-lg font-semibold tabular-nums mt-1">2h / dia</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 hidden lg:block rounded-2xl overflow-hidden border border-white/15 bg-slate-900/40">
          {!imgBannerFailed ? (
            <div className="relative h-48">
              <img
                src="/src/assets/images/alepa_campus_banner_1794572280452.jpg"
                alt="Mesa de estudos jurídicos e legislação"
                referrerPolicy="no-referrer"
                onError={() => setImgBannerFailed(true)}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B3321]/90 via-[#0B3321]/30 to-transparent flex items-end p-4">
                <p className="text-xs text-slate-100">
                  Sincronização em nuvem entre computador e celular · Progresso, simulados e revisões preservados.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 text-xs text-slate-200">
              Sincronização contínua entre desktop e celular · Banco de melhoria e simulados CETAP.
            </div>
          )}
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900">
                {mode === 'login' ? 'Acessar Campus' : 'Criar Conta'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {mode === 'login'
                  ? 'Entre para sincronizar seu histórico entre dispositivos.'
                  : 'Cadastre-se como estudante ou professor da turma.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
              }}
              className={`min-h-[44px] text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cadastrar
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-sm flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-700" />
              <div className="space-y-2">
                <p>{errorMsg}</p>
                {showProviderHelp && (
                  <div className="text-xs text-red-800 pt-1 border-t border-red-200">
                    Para ativar login por e-mail/senha: acesse o <strong>Firebase Console</strong> →{' '}
                    <em>Authentication</em> → <em>Sign-in method</em> → <em>Email/Password</em> → <strong>Enable</strong>.
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="auth-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Nome completo
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-name"
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ex.: Ana Paula Oliveira"
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-sm font-medium text-slate-700 mb-1.5">Perfil de acesso</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('student')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        role === 'student'
                          ? 'border-[#0B3321] bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Estudante
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('teacher')}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        role === 'teacher'
                          ? 'border-[#0B3321] bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Professor
                    </button>
                  </div>
                  {role === 'teacher' && (
                    <p className="text-xs text-slate-500 mt-1.5">
                      Publicações compartilhadas com toda a turma são autorizadas à conta docente principal; suas
                      questões e materiais pessoais ficam sempre salvos na sua conta.
                    </p>
                  )}
                </div>
              </>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full min-h-[44px] pl-10 pr-11 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] px-4 py-2.5 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? 'Autenticando...' : mode === 'login' ? 'Entrar com E-mail e Senha' : 'Criar Conta e Enviar Verificação'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-500">ou acesso instantâneo</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full min-h-[46px] px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>Entrar com Conta Google (sincronização imediata)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
