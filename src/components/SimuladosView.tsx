import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MEDIO_CARGOS, getMedioDisciplines, isMedioDisciplineId } from '../data/alepaMedioSyllabus';
import { ALEPA_DISCIPLINES, getDisciplineShortName } from '../data/alepaSyllabus';
import { CampusLevel, ErrorReason, MedioCargoGroup, Question, QuestionOriginType } from '../types';

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

type OriginFilter = 'all' | 'official' | 'training';
type GeneratorStrategy = 'proportional' | 'balanced';

const ORIGIN_LABELS: Record<QuestionOriginType, string> = {
  official_cetap: 'Oficial · Provas Anteriores CETAP',
  official_camara: 'Oficial · Câmara dos Deputados',
  official_alepa: 'Oficial · Banco de Leis ALEPA',
  training_platform: 'Não oficial · Treinamento complementar',
};

function shuffleQuestions<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function SimuladosView({
  campus,
  medioCargoGroup = 'cargo_01_04',
}: {
  campus: CampusLevel;
  medioCargoGroup?: MedioCargoGroup;
}) {
  const { questions, saveSimuladoAttempt, addErrorEntry, addCustomQuestion, profile } = useAuth();

  const isMedio = campus === 'medio';
  const activeDisciplines = useMemo(
    () => (isMedio ? getMedioDisciplines(medioCargoGroup) : ALEPA_DISCIPLINES),
    [isMedio, medioCargoGroup]
  );
  const activeDisciplineIds = useMemo(() => new Set(activeDisciplines.map((d) => d.id)), [activeDisciplines]);

  const activeCargoLabel = useMemo(() => {
    if (!isMedio) return 'Cargo 03 – Técnico Legislativo (PL.AL.102 · Nível Superior)';
    const cargoObj =
      MEDIO_CARGOS.find((c) => c.group === medioCargoGroup && (medioCargoGroup !== 'cargo_01_04' || c.code === 'PL.AL.060')) ||
      MEDIO_CARGOS[0];
    return `${cargoObj.cargoNumber} – ${cargoObj.title} (${cargoObj.code} · Nível Médio)`;
  }, [isMedio, medioCargoGroup]);

  const campusQuestions = useMemo(
    () =>
      questions.filter((q) =>
        isMedio
          ? isMedioDisciplineId(q.disciplineId) && activeDisciplineIds.has(q.disciplineId)
          : !isMedioDisciplineId(q.disciplineId)
      ),
    [questions, isMedio, activeDisciplineIds]
  );

  // Automatic Simulado Generator State
  const [generatorOpen, setGeneratorOpen] = useState(true);
  const [genSelectedDiscs, setGenSelectedDiscs] = useState<string[]>(() =>
    activeDisciplines.map((d) => d.id)
  );
  const [genCount, setGenCount] = useState<number>(15);
  const [genStrategy, setGenStrategy] = useState<GeneratorStrategy>('proportional');
  const [genOrigin, setGenOrigin] = useState<OriginFilter>('all');
  const [genMode, setGenMode] = useState<'simulado' | 'treino'>('simulado');
  const [activeSessionTitle, setActiveSessionTitle] = useState<string | null>(null);

  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
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
  const [qDisc, setQDisc] = useState(activeDisciplines[0].id);
  const [qTopic, setQTopic] = useState('');
  const [qStatement, setQStatement] = useState('');
  const [qOptions, setQOptions] = useState<[string, string, string, string, string]>(['', '', '', '', '']);
  const [qCorrect, setQCorrect] = useState(0);
  const [qExplanation, setQExplanation] = useState('');
  const [qLegalBasis, setQLegalBasis] = useState('');
  const [qOriginType, setQOriginType] = useState<QuestionOriginType>('training_platform');
  const [qPublishClass, setQPublishClass] = useState(false);

  const startSession = (
    selectedDisc: string,
    selectedOrigin: OriginFilter,
    selectedMode: 'treino' | 'simulado'
  ) => {
    const pool = campusQuestions.filter((q) => {
      if (selectedDisc !== 'all' && q.disciplineId !== selectedDisc) return false;
      const isOff = Boolean(q.isOfficial);
      if (selectedOrigin === 'official' && !isOff) return false;
      if (selectedOrigin === 'training' && isOff) return false;
      return true;
    });
    const deck = selectedMode === 'simulado' ? pool.slice(0, 20) : pool;
    setActiveDeck(deck);
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
    setSecondsElapsed(0);
    setSaveFeedback(null);
    setActiveSessionTitle(null);
    setAddedErrors({});
  };

  useEffect(() => {
    setDisciplineFilter('all');
    setQDisc(activeDisciplines[0]?.id || (isMedio ? 'nm_portugues' : 'processo_legislativo'));
    setGenSelectedDiscs(activeDisciplines.map((d) => d.id));
    startSession('all', originFilter, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus, medioCargoGroup, campusQuestions.length]);

  const generatorPlan = useMemo(() => {
    const selectedSet = new Set(genSelectedDiscs);
    const selectedDiscObjects = activeDisciplines.filter((d) => selectedSet.has(d.id));
    const filteredPool = campusQuestions.filter((q) => {
      if (!selectedSet.has(q.disciplineId)) return false;
      const isOff = Boolean(q.isOfficial);
      if (genOrigin === 'official' && !isOff) return false;
      if (genOrigin === 'training' && isOff) return false;
      return true;
    });

    const poolByDisc = new Map<string, Question[]>();
    selectedDiscObjects.forEach((d) => {
      poolByDisc.set(
        d.id,
        filteredPool.filter((q) => q.disciplineId === d.id)
      );
    });

    const maxAvailable = filteredPool.length;
    const targetCount = Math.min(Math.max(1, genCount), maxAvailable);

    const quotas = new Map<string, number>();
    selectedDiscObjects.forEach((d) => quotas.set(d.id, 0));

    if (targetCount > 0 && selectedDiscObjects.length > 0) {
      const totalWeight = selectedDiscObjects.reduce(
        (sum, d) => sum + (genStrategy === 'proportional' ? Math.max(1, d.examQuestions) : 1),
        0
      );

      // Initial proportional floor allocation capped by available pool
      let assigned = 0;
      const remainders: Array<{ id: string; rem: number }> = [];
      selectedDiscObjects.forEach((d) => {
        const w = genStrategy === 'proportional' ? Math.max(1, d.examQuestions) : 1;
        const exact = (targetCount * w) / totalWeight;
        const avail = poolByDisc.get(d.id)?.length || 0;
        const base = Math.min(avail, Math.floor(exact));
        quotas.set(d.id, base);
        assigned += base;
        remainders.push({ id: d.id, rem: exact - Math.floor(exact) });
      });

      // Distribute remaining slots by highest fractional remainder while respecting pool caps
      remainders.sort((a, b) => b.rem - a.rem);
      let safety = 0;
      while (assigned < targetCount && safety < 200) {
        safety += 1;
        let progressed = false;
        for (const item of remainders) {
          if (assigned >= targetCount) break;
          const avail = poolByDisc.get(item.id)?.length || 0;
          const cur = quotas.get(item.id) || 0;
          if (cur < avail) {
            quotas.set(item.id, cur + 1);
            assigned += 1;
            progressed = true;
          }
        }
        if (!progressed) break;
      }
    }

    const breakdown = selectedDiscObjects.map((d) => ({
      discipline: d,
      planned: quotas.get(d.id) || 0,
      available: poolByDisc.get(d.id)?.length || 0,
    }));

    return {
      selectedCount: selectedDiscObjects.length,
      maxAvailable,
      targetCount,
      breakdown,
      poolByDisc,
    };
  }, [activeDisciplines, campusQuestions, genSelectedDiscs, genCount, genStrategy, genOrigin]);

  const handleToggleGenDiscipline = (discId: string) => {
    setGenSelectedDiscs((prev) =>
      prev.includes(discId) ? prev.filter((id) => id !== discId) : [...prev, discId]
    );
  };

  const handleGenerateCustomSimulado = () => {
    if (generatorPlan.targetCount === 0) return;

    const chosenQuestions: Question[] = [];
    generatorPlan.breakdown.forEach((item) => {
      if (item.planned > 0) {
        const shuffled = shuffleQuestions(generatorPlan.poolByDisc.get(item.discipline.id) || []);
        chosenQuestions.push(...shuffled.slice(0, item.planned));
      }
    });

    const finalDeck = shuffleQuestions(chosenQuestions);
    const discNames = generatorPlan.breakdown
      .filter((b) => b.planned > 0)
      .map((b) => `${b.discipline.shortName} (${b.planned})`)
      .join(', ');

    const genTitle = `Simulado Automático · ${isMedio ? 'Médio PL.AL.060' : 'Superior PL.AL.102'} (${finalDeck.length}q)`;
    setMode(genMode);
    setOriginFilter(genOrigin);
    setActiveDeck(finalDeck);
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
    setSecondsElapsed(0);
    setAddedErrors({});
    setActiveSessionTitle(genTitle);
    setSaveFeedback(
      `Simulado gerado com ${finalDeck.length} questões para ${activeCargoLabel.split('(')[0].trim()}: ${discNames}.`
    );
  };

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
        // handled gracefully if email is not verified yet
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
          activeSessionTitle ||
          (mode === 'simulado'
            ? `Simulado CETAP · ${isMedio ? 'Nível Médio (PL.AL.060)' : 'Nível Superior'} (${disciplineFilter === 'all' ? 'Geral' : getDisciplineShortName(disciplineFilter)})`
            : `Bateria de Treino · ${isMedio ? 'Nível Médio (PL.AL.060)' : 'Nível Superior'} (${disciplineFilter === 'all' ? 'Geral' : getDisciplineShortName(disciplineFilter)})`),
        mode,
        primaryDisciplineId:
          activeSessionTitle
            ? activeDisciplines[0]?.id || (isMedio ? 'nm_geral' : 'processo_legislativo')
            : disciplineFilter === 'all'
              ? isMedio
                ? 'nm_geral'
                : 'processo_legislativo'
              : disciplineFilter,
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
      const isOfficial = qOriginType !== 'training_platform';
      await addCustomQuestion({
        disciplineId: qDisc,
        topicTitle: qTopic,
        statement: qStatement,
        options: qOptions,
        correctIndex: qCorrect,
        explanation: qExplanation,
        legalBasis: qLegalBasis,
        source: ORIGIN_LABELS[qOriginType],
        originType: qOriginType,
        isOfficial,
        isPublished: qPublishClass,
      });
      setShowCreateModal(false);
      setQTopic('');
      setQStatement('');
      setQOptions(['', '', '', '', '']);
      setQExplanation('');
      setQLegalBasis('');
      setSaveFeedback('Nova questão adicionada com identificação de origem!');
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
  const officialCount = campusQuestions.filter((q) => q.isOfficial).length;
  const trainingCount = campusQuestions.length - officialCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            {isMedio
              ? 'ALEPA 2026 – Nível Médio · Cargo 04 – Assistência Administrativa (PL.AL.060) · Banco Independente'
              : 'ALEPA 2026 – Nível Superior · Cargo 03 – Técnico Legislativo (PL.AL.102) · Banco Independente'}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Banco de Questões e Simulados ({isMedio ? 'Nível Médio' : 'Nível Superior'})
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

      {/* Separação de Simulados por Cargo + Quantidade de Questões na Prova */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#146C43]">
              {isMedio
                ? 'Simulado separado por cargo · Nível Médio (Cargo 04 – PL.AL.060)'
                : 'Simulado separado por cargo · Nível Superior (Cargo 03 – PL.AL.102)'}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {isMedio
                ? 'Questões e simulados isolados para o Edital 001/2026 (Ensino Médio Completo), respeitando o conteúdo e o nível de cobrança da Fundação CETAP.'
                : 'Questões e simulados isolados para o Edital 002/2026 (Ensino Superior), respeitando o aprofundamento técnico do Cargo 03.'}
            </p>
          </div>
          <div className="text-left sm:text-right font-mono tabular-nums shrink-0">
            <span className="text-sm font-bold text-[#0B3321]">50 questões objetivas</span>
            <p className="text-[11px] text-slate-500">Valor total: 10,0 pontos (0,20 pt/questão)</p>
          </div>
        </div>

        {isMedio && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="font-mono font-bold text-[#0B3321]">20 questões</p>
              <p className="text-[11px] text-slate-600 mt-0.5">Conhec. Específicos (4,0 pts)</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="font-mono font-bold text-[#0B3321]">10 questões</p>
              <p className="text-[11px] text-slate-600 mt-0.5">Legislação e Ética (2,0 pts)</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="font-mono font-bold text-[#0B3321]">10 questões</p>
              <p className="text-[11px] text-slate-600 mt-0.5">Língua Portuguesa (2,0 pts)</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="font-mono font-bold text-[#0B3321]">05 questões</p>
              <p className="text-[11px] text-slate-600 mt-0.5">Raciocínio Lógico (1,0 pt)</p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="font-mono font-bold text-[#0B3321]">05 questões</p>
              <p className="text-[11px] text-slate-600 mt-0.5">Noções de Informática (1,0 pt)</p>
            </div>
          </div>
        )}
      </section>

      {/* Gerador Automático de Simulados por Conteúdo Programático do Cargo */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-[#146C43]">
              <Sparkles className="w-4 h-4" />
              <p className="text-xs font-semibold">Gerador Automático · Baseado no Conteúdo Programático</p>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
              Montar Simulado Personalizado ({activeCargoLabel})
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setGeneratorOpen((v) => !v)}
            className="min-h-[38px] px-3.5 py-1.5 border border-slate-300 hover:border-[#0B3321] bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{generatorOpen ? 'Recolher gerador' : 'Abrir gerador automático'}</span>
          </button>
        </div>

        {generatorOpen && (
          <div className="space-y-5">
            {/* Step 1: Disciplinas do Cargo Selecionado */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">
                  1. Selecione as disciplinas do conteúdo programático ({genSelectedDiscs.length}/{activeDisciplines.length} marcadas)
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setGenSelectedDiscs(activeDisciplines.map((d) => d.id))}
                    className="font-semibold text-[#0B3321] hover:underline"
                  >
                    Selecionar todas
                  </button>
                  <span aria-hidden="true" className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() =>
                      setGenSelectedDiscs(
                        activeDisciplines
                          .filter((d) => d.editalBlock === 'Conhecimentos Específicos')
                          .map((d) => d.id)
                      )
                    }
                    className="font-medium text-slate-700 hover:underline"
                  >
                    Somente Específicos
                  </button>
                  <span aria-hidden="true" className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() =>
                      setGenSelectedDiscs(
                        activeDisciplines
                          .filter((d) => d.editalBlock !== 'Conhecimentos Específicos')
                          .map((d) => d.id)
                      )
                    }
                    className="font-medium text-slate-700 hover:underline"
                  >
                    Somente Básicas
                  </button>
                  <span aria-hidden="true" className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setGenSelectedDiscs([])}
                    className="font-medium text-slate-500 hover:underline"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {activeDisciplines.map((d) => {
                  const checked = genSelectedDiscs.includes(d.id);
                  const availInDisc = campusQuestions.filter((q) => {
                    if (q.disciplineId !== d.id) return false;
                    const isOff = Boolean(q.isOfficial);
                    if (genOrigin === 'official' && !isOff) return false;
                    if (genOrigin === 'training' && isOff) return false;
                    return true;
                  }).length;

                  return (
                    <label
                      key={d.id}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-start gap-2.5 ${
                        checked
                          ? 'border-[#0B3321] bg-emerald-50/50 text-slate-900'
                          : 'border-slate-200 bg-slate-50/40 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleGenDiscipline(d.id)}
                        className="mt-0.5 accent-[#0B3321]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {d.priorityRank}º · {d.shortName}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                          {d.topics.length} tópicos · peso {d.examQuestions}q · {availInDisc} no banco
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Número de Questões, Distribuição, Origem e Modo */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
              <div className="space-y-1.5">
                <label htmlFor="gen-count-input" className="block text-xs font-semibold text-slate-800">
                  2. Número de questões
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[5, 10, 15, 20, 30, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setGenCount(preset)}
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-mono font-semibold rounded-lg border ${
                        genCount === preset
                          ? 'border-[#0B3321] bg-[#0B3321] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  <input
                    id="gen-count-input"
                    type="number"
                    min={1}
                    max={50}
                    value={genCount}
                    onChange={(e) => setGenCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    aria-label="Quantidade personalizada de questões"
                    className="w-16 min-h-[34px] px-2 py-1 text-xs font-mono border border-slate-300 rounded-lg text-center"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="gen-strategy-select" className="block text-xs font-semibold text-slate-800">
                  3. Distribuição pelo edital
                </label>
                <select
                  id="gen-strategy-select"
                  value={genStrategy}
                  onChange={(e) => setGenStrategy(e.target.value as GeneratorStrategy)}
                  className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  <option value="proportional">Proporcional ao peso na prova CETAP</option>
                  <option value="balanced">Equilibrada entre disciplinas marcadas</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="gen-origin-select" className="block text-xs font-semibold text-slate-800">
                  4. Fonte das questões
                </label>
                <select
                  id="gen-origin-select"
                  value={genOrigin}
                  onChange={(e) => setGenOrigin(e.target.value as OriginFilter)}
                  className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  <option value="all">Todas (Oficiais + Treinamento)</option>
                  <option value="official">Somente Oficiais (CETAP / Câmara / ALEPA)</option>
                  <option value="training">Somente Treinamento Complementar</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="gen-mode-select" className="block text-xs font-semibold text-slate-800">
                  5. Modo de aplicação
                </label>
                <select
                  id="gen-mode-select"
                  value={genMode}
                  onChange={(e) => setGenMode(e.target.value as 'simulado' | 'treino')}
                  className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  <option value="simulado">Simulado Cronometrado (Nota CETAP)</option>
                  <option value="treino">Modo Treino (Gabarito imediato)</option>
                </select>
              </div>
            </div>

            {/* Prévia de Distribuição & Botão Gerar */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-900">
                  Prévia automática:{' '}
                  <span className="font-mono text-[#0B3321]">
                    {generatorPlan.targetCount} {generatorPlan.targetCount === 1 ? 'questão' : 'questões'}
                  </span>{' '}
                  sorteadas entre{' '}
                  <span className="font-mono text-[#0B3321]">{generatorPlan.selectedCount}</span>{' '}
                  {generatorPlan.selectedCount === 1 ? 'disciplina' : 'disciplinas'}
                </p>
                <p className="text-[11px] text-slate-600">
                  {generatorPlan.breakdown.filter((b) => b.planned > 0).length > 0
                    ? generatorPlan.breakdown
                        .filter((b) => b.planned > 0)
                        .map((b) => `${b.discipline.shortName}: ${b.planned}q`)
                        .join(' · ')
                    : 'Selecione pelo menos uma disciplina com questões disponíveis.'}
                </p>
                {genCount > generatorPlan.maxAvailable && generatorPlan.maxAvailable > 0 && (
                  <p className="text-[11px] text-amber-800">
                    Para os filtros atuais há {generatorPlan.maxAvailable} questões únicas no banco (você pediu{' '}
                    {genCount}). Marque mais disciplinas ou cadastre novas questões para ampliar o sorteio.
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={generatorPlan.targetCount === 0}
                onClick={handleGenerateCustomSimulado}
                className="min-h-[44px] px-5 py-2.5 bg-[#0B3321] hover:bg-[#134b32] disabled:opacity-40 text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>Gerar e iniciar simulado ({generatorPlan.targetCount}q)</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 4 Fontes de Questões & Simulados: Oficiais vs. Treinamento */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Origens de Questões e Simulados (Oficiais × Treinamento Complementar)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Separação explícita entre questões oficiais (CETAP, Câmara e ALEPA) e plataformas não oficiais para treinamento.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <a
            href="https://www.pciconcursos.com.br/provas/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 rounded-xl border border-slate-200 hover:border-[#0B3321] bg-slate-50/50 flex flex-col justify-between gap-2"
          >
            <div>
              <p className="text-[11px] font-semibold text-[#146C43]">Oficial · Provas Anteriores</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">Fundação CETAP</p>
              <p className="text-xs text-slate-600 mt-0.5">Acervo de provas anteriores e gabaritos no PCI Provas.</p>
            </div>
            <span className="text-xs font-semibold text-[#0B3321] inline-flex items-center gap-1">
              Abrir PCI Provas <ExternalLink className="w-3 h-3" />
            </span>
          </a>

          <a
            href="https://www2.camara.leg.br/transparencia/servicos-ao-cidadao/educacao-cultura-e-responsabilidade-social"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 rounded-xl border border-slate-200 hover:border-[#0B3321] bg-slate-50/50 flex flex-col justify-between gap-2"
          >
            <div>
              <p className="text-[11px] font-semibold text-[#146C43]">Oficial · Questões Legislativas</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">Câmara dos Deputados</p>
              <p className="text-xs text-slate-600 mt-0.5">Educação legislativa e técnica parlamentar oficial.</p>
            </div>
            <span className="text-xs font-semibold text-[#0B3321] inline-flex items-center gap-1">
              Abrir Câmara <ExternalLink className="w-3 h-3" />
            </span>
          </a>

          <a
            href="https://bancodeleis.alepa.pa.gov.br/index.php?p=1&tipo=10"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 rounded-xl border border-slate-200 hover:border-[#0B3321] bg-slate-50/50 flex flex-col justify-between gap-2"
          >
            <div>
              <p className="text-[11px] font-semibold text-[#146C43]">Oficial · Legislação Estadual</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">Banco de Leis da ALEPA</p>
              <p className="text-xs text-slate-600 mt-0.5">Base normativa estadual para questões de legislação.</p>
            </div>
            <span className="text-xs font-semibold text-[#0B3321] inline-flex items-center gap-1">
              Abrir Banco de Leis <ExternalLink className="w-3 h-3" />
            </span>
          </a>

          <a
            href="https://www.pciconcursos.com.br/simulados/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-3.5 rounded-xl border border-amber-200 hover:border-amber-600 bg-amber-50/50 flex flex-col justify-between gap-2"
          >
            <div>
              <p className="text-[11px] font-semibold text-amber-800">Não oficial · Treinamento complementar</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">PCI Concursos Simulados</p>
              <p className="text-xs text-slate-600 mt-0.5">Plataforma externa de treino por disciplina.</p>
            </div>
            <span className="text-xs font-semibold text-amber-900 inline-flex items-center gap-1">
              Abrir PCI Simulados <ExternalLink className="w-3 h-3" />
            </span>
          </a>
        </div>
      </section>

      {/* Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setMode('treino');
                  startSession(disciplineFilter, originFilter, 'treino');
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
                  startSession(disciplineFilter, originFilter, 'simulado');
                }}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'simulado' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Simulado Cronometrado
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setOriginFilter('all');
                  startSession(disciplineFilter, 'all', mode);
                }}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  originFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Todas ({campusQuestions.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setOriginFilter('official');
                  startSession(disciplineFilter, 'official', mode);
                }}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  originFilter === 'official' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Oficiais ({officialCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setOriginFilter('training');
                  startSession(disciplineFilter, 'training', mode);
                }}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  originFilter === 'training' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Não oficiais / Treino ({trainingCount})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filtrar questões por disciplina"
              value={disciplineFilter}
              onChange={(e) => {
                setDisciplineFilter(e.target.value);
                startSession(e.target.value, originFilter, mode);
              }}
              className="min-h-[40px] px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-xl"
            >
              <option value="all">Todas as disciplinas ({campusQuestions.length})</option>
              {activeDisciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.priorityRank}º · {d.shortName} ({d.examQuestions}q na prova)
                </option>
              ))}
            </select>

            <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-500" />
                {formatDuration(secondsElapsed)}
              </span>
              <span>
                {answeredCount}/{activeDeck.length}
              </span>
              <button
                type="button"
                onClick={() => startSession(disciplineFilter, originFilter, mode)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-sans font-medium inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reiniciar</span>
              </button>
            </div>
          </div>
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
            onClick={() => startSession(disciplineFilter, originFilter, mode)}
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

            <div className="flex items-center gap-1.5 font-medium">
              {currentQuestion.isOfficial ? (
                <span className="inline-flex items-center gap-1 text-[#146C43]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{currentQuestion.source || 'Fonte Oficial'}</span>
                </span>
              ) : (
                <span className="text-amber-800">
                  {currentQuestion.source || 'Treinamento Complementar (Não oficial)'}
                </span>
              )}
            </div>
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
          Nenhuma questão encontrada para os filtros selecionados.
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
                    {activeDisciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.shortName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Origem da questão</label>
                  <select
                    value={qOriginType}
                    onChange={(e) => setQOriginType(e.target.value as QuestionOriginType)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="official_cetap">Oficial · Prova Anterior Fundação CETAP</option>
                    <option value="official_camara">Oficial · Questão Legislativa (Câmara)</option>
                    <option value="official_alepa">Oficial · Legislação (Banco de Leis ALEPA)</option>
                    <option value="training_platform">Não oficial · Treinamento complementar</option>
                  </select>
                </div>
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
