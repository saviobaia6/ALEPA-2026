import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Plus, RotateCcw, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ALEPA_DISCIPLINES, getDisciplineShortName } from '../data/alepaSyllabus';
import { ErrorReason, Question } from '../types';

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export function SimuladosView() {
  const { questions, saveSimuladoAttempt, addErrorEntry, addCustomQuestion, profile } = useAuth();

  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [mode, setMode] = useState<'treino' | 'simulado'>('treino');
  const [activeDeck, setActiveDeck] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [addedErrors, setAddedErrors] = useState<Record<string, boolean>>({});

  // Create Question Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [qDisc, setQDisc] = useState(ALEPA_DISCIPLINES[0].id);
  const [qTopic, setQTopic] = useState('');
  const [qStatement, setQStatement] = useState('');
  const [qOptions, setQOptions] = useState<[string, string, string, string, string]>(['', '', '', '', '']);
  const [qCorrect, setQCorrect] = useState(0);
  const [qExplanation, setQExplanation] = useState('');
  const [qLegalBasis, setQLegalBasis] = useState('');
  const [qPublishClass, setQPublishClass] = useState(false);

  const startSession = (selectedDisc: string, selectedMode: 'treino' | 'simulado') => {
    const pool =
      selectedDisc === 'all' ? questions : questions.filter((q) => q.disciplineId === selectedDisc);
    const deck = selectedMode === 'simulado' ? pool.slice(0, 20) : pool;
    setActiveDeck(deck);
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
    setSecondsElapsed(0);
    setSaveFeedback(null);
    setAddedErrors({});
  };

  useEffect(() => {
    if (activeDeck.length === 0) {
      startSession('all', 'treino');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  useEffect(() => {
    if (submitted || activeDeck.length === 0) return;
    const t = window.setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [submitted, activeDeck.length]);

  const currentQuestion = activeDeck[currentIndex];
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;

  const handleSelectOption = async (optionIdx: number) => {
    if (!currentQuestion || submitted) return;
    if (mode === 'treino' && answers[currentQuestion.id] !== undefined) return;

    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionIdx }));

    // In treino mode, automatically log wrong answer to Caderno de Erros
    if (mode === 'treino' && optionIdx !== currentQuestion.correctIndex) {
      try {
        await addErrorEntry({
          questionId: currentQuestion.id,
          disciplineId: currentQuestion.disciplineId,
          topicTitle: currentQuestion.topicTitle,
          questionStem: currentQuestion.statement,
          correctOption: `${LETTERS[currentQuestion.correctIndex]}) ${currentQuestion.options[currentQuestion.correctIndex]}`,
          selectedOption: `${LETTERS[optionIdx]}) ${currentQuestion.options[optionIdx]}`,
          errorReason: 'teoria',
          improvementNote: currentQuestion.explanation,
        });
        setAddedErrors((prev) => ({ ...prev, [currentQuestion.id]: true }));
      } catch {
        // user might need email verification; error handled gracefully
      }
    }
  };

  const handleFinishSimulado = async () => {
    if (activeDeck.length === 0) return;
    setSubmitted(true);
    let correctCount = 0;
    const wrongQuestions: Question[] = [];

    activeDeck.forEach((q) => {
      if (answers[q.id] === q.correctIndex) {
        correctCount += 1;
      } else if (answers[q.id] !== undefined) {
        wrongQuestions.push(q);
      }
    });

    const ratio = correctCount / activeDeck.length;
    const scoreOutOfTen = Number((ratio * 10).toFixed(2));

    try {
      await saveSimuladoAttempt({
        title:
          mode === 'simulado'
            ? `Simulado CETAP (${disciplineFilter === 'all' ? 'Geral' : getDisciplineShortName(disciplineFilter)})`
            : `Bateria de Treino (${disciplineFilter === 'all' ? 'Geral' : getDisciplineShortName(disciplineFilter)})`,
        mode,
        primaryDisciplineId: disciplineFilter === 'all' ? 'processo_legislativo' : disciplineFilter,
        totalQuestions: activeDeck.length,
        correctCount,
        score: scoreOutOfTen,
        durationSeconds: secondsElapsed,
      });

      for (const wq of wrongQuestions) {
        const chosenIdx = answers[wq.id];
        await addErrorEntry({
          questionId: wq.id,
          disciplineId: wq.disciplineId,
          topicTitle: wq.topicTitle,
          questionStem: wq.statement,
          correctOption: `${LETTERS[wq.correctIndex]}) ${wq.options[wq.correctIndex]}`,
          selectedOption: `${LETTERS[chosenIdx]}) ${wq.options[chosenIdx]}`,
          errorReason: 'banca_cetap' as ErrorReason,
          improvementNote: wq.explanation,
        });
      }

      setSaveFeedback(
        `Resultado salvo (${correctCount}/${activeDeck.length} · Nota ${scoreOutOfTen.toFixed(1)}/10). Questões erradas enviadas ao Caderno de Erros.`
      );
    } catch (err) {
      setSaveFeedback(err instanceof Error ? err.message : 'Resultado exibido localmente.');
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addCustomQuestion({
        disciplineId: qDisc,
        topicTitle: qTopic,
        statement: qStatement,
        options: qOptions,
        correctIndex: qCorrect,
        explanation: qExplanation,
        legalBasis: qLegalBasis,
        isPublished: qPublishClass,
      });
      setShowCreateModal(false);
      setQTopic('');
      setQStatement('');
      setQOptions(['', '', '', '', '']);
      setQExplanation('');
      setQLegalBasis('');
      setSaveFeedback('Nova questão adicionada ao banco!');
    } catch (err) {
      setSaveFeedback(err instanceof Error ? err.message : 'Erro ao criar questão.');
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const answeredCount = activeDeck.filter((q) => answers[q.id] !== undefined).length;
  const correctTotal = activeDeck.filter((q) => answers[q.id] === q.correctIndex).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            Padrão Fundação CETAP · 5 alternativas (A–E) · 0,2 pt por questão
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Banco de Questões e Simulados
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="min-h-[44px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar questão</span>
        </button>
      </div>

      {/* PCI Concursos External Simulados & Provas Anteriores */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Acervo Externo PCI Concursos · Simulados e Provas Anteriores
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Pratique provas anteriores da Fundação CETAP, concursos legislativos e simulados online complementares.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <a
            href="https://www.pciconcursos.com.br/simulados/"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>PCI Simulados</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://www.pciconcursos.com.br/provas/"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>PCI Provas Anteriores</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          </a>
        </div>
      </section>

      {/* Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('treino');
                startSession(disciplineFilter, 'treino');
              }}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'treino' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Modo Treino (Comentado)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('simulado');
                startSession(disciplineFilter, 'simulado');
              }}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                mode === 'simulado' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Simulado Cronometrado
            </button>
          </div>

          <select
            aria-label="Filtrar questões por disciplina"
            value={disciplineFilter}
            onChange={(e) => {
              setDisciplineFilter(e.target.value);
              startSession(e.target.value, mode);
            }}
            className="min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-xl"
          >
            <option value="all">Todas as disciplinas ({questions.length})</option>
            {ALEPA_DISCIPLINES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.priorityRank}º · {d.shortName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-500" />
            {formatDuration(secondsElapsed)}
          </span>
          <span>
            Respondidas: {answeredCount}/{activeDeck.length}
          </span>
          <button
            type="button"
            onClick={() => startSession(disciplineFilter, mode)}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-sans font-medium inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reiniciar</span>
          </button>
        </div>
      </div>

      {saveFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm font-medium">
          {saveFeedback}
        </div>
      )}

      {/* Summary after finishing */}
      {submitted && activeDeck.length > 0 && (
        <div className="bg-[#0B3321] text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-emerald-300 font-medium">Desempenho no simulado</p>
            <h2 className="font-display text-2xl font-bold mt-1">
              {correctTotal} de {activeDeck.length} acertos · Nota{' '}
              <span className="font-mono tabular-nums">{((correctTotal / activeDeck.length) * 10).toFixed(1)}</span> / 10,0
            </h2>
          </div>
          <button
            type="button"
            onClick={() => startSession(disciplineFilter, mode)}
            className="min-h-[44px] px-4 py-2 bg-white text-slate-900 text-sm font-semibold rounded-xl whitespace-nowrap"
          >
            Novo simulado
          </button>
        </div>
      )}

      {/* Question Card */}
      {currentQuestion ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pb-4 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-800">
                Questão {currentIndex + 1} de {activeDeck.length}
              </span>
              <span aria-hidden="true">·</span>
              <span>{getDisciplineShortName(currentQuestion.disciplineId)}</span>
              <span aria-hidden="true">·</span>
              <span>{currentQuestion.topicTitle}</span>
            </div>
            <span>{currentQuestion.source || 'Fundação CETAP'}</span>
          </div>

          <p className="text-base sm:text-lg text-slate-900 leading-relaxed font-medium">
            {currentQuestion.statement}
          </p>

          <div className="space-y-2.5">
            {currentQuestion.options.map((optText, idx) => {
              const isSelected = selectedAnswer === idx;
              const showCorrection = submitted || (mode === 'treino' && selectedAnswer !== undefined);
              const isCorrectOption = idx === currentQuestion.correctIndex;

              let btnStyle = 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800';
              if (showCorrection) {
                if (isCorrectOption) {
                  btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950';
                } else if (isSelected && !isCorrectOption) {
                  btnStyle = 'border-red-500 bg-red-50 text-red-950';
                }
              } else if (isSelected) {
                btnStyle = 'border-[#0B3321] bg-slate-900 text-white';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectOption(idx)}
                  className={`w-full text-left min-h-[50px] p-4 rounded-xl border transition-colors flex items-start gap-3 ${btnStyle}`}
                >
                  <span className="font-mono text-xs font-bold mt-0.5 shrink-0">{LETTERS[idx]})</span>
                  <span className="text-sm leading-relaxed flex-1">{optText}</span>
                  {showCorrection && isCorrectOption && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  )}
                  {showCorrection && isSelected && !isCorrectOption && (
                    <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          {(submitted || (mode === 'treino' && selectedAnswer !== undefined)) && (
            <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">
                  Gabarito Comentado · Alternativa {LETTERS[currentQuestion.correctIndex]}
                </p>
                {addedErrors[currentQuestion.id] && (
                  <span className="text-xs font-medium text-amber-800">
                    Adicionada ao Caderno de Erros
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{currentQuestion.explanation}</p>
              {currentQuestion.legalBasis && (
                <p className="text-xs font-mono text-slate-500 pt-1">
                  Fundamentação: {currentQuestion.legalBasis}
                </p>
              )}
            </div>
          )}

          {/* Pagination & Finish */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={currentIndex >= activeDeck.length - 1}
                onClick={() => setCurrentIndex((i) => Math.min(activeDeck.length - 1, i + 1))}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              >
                Próxima
              </button>
            </div>

            {!submitted && (
              <button
                type="button"
                onClick={handleFinishSimulado}
                className="min-h-[44px] px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl"
              >
                Encerrar e salvar desempenho
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-600">
          Nenhuma questão encontrada para o filtro selecionado.
        </div>
      )}

      {/* Modal Cadastrar Nova Questão */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="font-display text-xl font-bold text-slate-900">Cadastrar Questão (Padrão CETAP)</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Fechar modal"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Disciplina</label>
                  <select
                    value={qDisc}
                    onChange={(e) => setQDisc(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    {ALEPA_DISCIPLINES.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.shortName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tópico do Edital</label>
                  <input
                    required
                    value={qTopic}
                    onChange={(e) => setQTopic(e.target.value)}
                    placeholder="Ex.: Regimento Interno ALEPA"
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Enunciado da questão</label>
                <textarea
                  required
                  rows={3}
                  value={qStatement}
                  onChange={(e) => setQStatement(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-medium text-slate-700">Alternativas (marque a correta)</span>
                {LETTERS.map((letter, i) => (
                  <div key={letter} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correctIdx"
                      checked={qCorrect === i}
                      onChange={() => setQCorrect(i)}
                      aria-label={`Alternativa ${letter} correta`}
                    />
                    <span className="font-mono text-xs font-bold w-5">{letter})</span>
                    <input
                      required
                      value={qOptions[i]}
                      onChange={(e) => {
                        const copy = [...qOptions] as [string, string, string, string, string];
                        copy[i] = e.target.value;
                        setQOptions(copy);
                      }}
                      placeholder={`Texto da alternativa ${letter}`}
                      className="flex-1 min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-xl"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gabarito comentado</label>
                <textarea
                  required
                  rows={2}
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Base legal (opcional)</label>
                <input
                  value={qLegalBasis}
                  onChange={(e) => setQLegalBasis(e.target.value)}
                  placeholder="Ex.: CF/88, art. 66"
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              {profile?.role === 'teacher' && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={qPublishClass}
                    onChange={(e) => setQPublishClass(e.target.checked)}
                  />
                  <span>Publicar para todos os alunos da turma</span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0B3321] text-white text-sm font-semibold"
                >
                  Salvar questão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
