import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Plus,
  Presentation,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ALEPA_DISCIPLINES, getDisciplineShortName } from '../data/alepaSyllabus';
import { deleteLocalFile, getLocalFile, saveLocalFile } from '../lib/localFiles';
import { MaterialFileType, StudyMaterial } from '../types';

const TYPE_LABELS: Record<MaterialFileType, string> = {
  pdf: 'PDF',
  pptx: 'PowerPoint',
  xlsx: 'Excel',
  drive: 'Google Drive',
  video: 'Videoaula',
};

function getTypeIcon(type: MaterialFileType) {
  switch (type) {
    case 'pdf':
      return FileText;
    case 'pptx':
      return Presentation;
    case 'xlsx':
      return FileSpreadsheet;
    case 'drive':
      return FolderOpen;
    case 'video':
      return Video;
  }
}

function buildEmbedUrl(material: StudyMaterial): string | null {
  const url = material.url.trim();
  if (!url || url.startsWith('local://')) return null;

  // Google Drive file or folder links
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  const docsMatch = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
  if (docsMatch) {
    return `https://docs.google.com/${docsMatch[1]}/d/${docsMatch[2]}/preview`;
  }

  // YouTube embed
  const ytWatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (ytWatch) {
    return `https://www.youtube.com/embed/${ytWatch[1]}`;
  }
  const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (ytShort) {
    return `https://www.youtube.com/embed/${ytShort[1]}`;
  }

  // Direct PowerPoint / Excel URLs via Office Online Viewer
  if ((material.fileType === 'pptx' || material.fileType === 'xlsx') && /\.(pptx?|xlsx?)$/i.test(url)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }

  // Direct PDF URLs (including local /assets/ PDFs)
  if (material.fileType === 'pdf' && (/\.pdf($|\?)/i.test(url) || url.startsWith('/assets/'))) {
    return url;
  }

  return null;
}

export function MaterialsView() {
  const { materials, addMaterial, deleteMaterial, user, profile } = useAuth();
  const [typeFilter, setTypeFilter] = useState<'all' | MaterialFileType>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');

  // Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [discId, setDiscId] = useState(ALEPA_DISCIPLINES[0].id);
  const [fileType, setFileType] = useState<MaterialFileType>('pdf');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Integrated Viewer State
  const [viewerMaterial, setViewerMaterial] = useState<StudyMaterial | null>(null);
  const [viewerBlobUrl, setViewerBlobUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<Array<{ name: string; rows: string[][] }>>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const filtered = materials.filter((m) => {
    if (typeFilter !== 'all' && m.fileType !== typeFilter) return false;
    if (disciplineFilter !== 'all' && m.disciplineId !== disciplineFilter) return false;
    return true;
  });

  const closeViewer = () => {
    if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
    setViewerMaterial(null);
    setViewerBlobUrl(null);
    setViewerFileName(null);
    setExcelSheets([]);
    setActiveSheetIdx(0);
    setViewerError(null);
  };

  const openViewer = async (material: StudyMaterial) => {
    closeViewer();
    setViewerMaterial(material);

    if (material.url.startsWith('local://')) {
      const localKey = material.url.replace('local://', '');
      const record = await getLocalFile(localKey);
      if (!record) {
        setViewerError(
          'Este arquivo local foi salvo em outro dispositivo. Para abrir em qualquer aparelho, vincule um link do Google Drive ou OneDrive.'
        );
        return;
      }

      setViewerFileName(record.fileName);
      const blob = new Blob([record.buffer], { type: record.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      setViewerBlobUrl(blobUrl);

      if (material.fileType === 'xlsx' || /\.(xlsx|xls|csv)$/i.test(record.fileName)) {
        try {
          const wb = XLSX.read(record.buffer, { type: 'array' });
          const parsedSheets = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false }) as string[][];
            return { name, rows: rows.slice(0, 150) };
          });
          setExcelSheets(parsedSheets);
        } catch {
          setViewerError('Não foi possível ler as abas desta planilha Excel.');
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.pdf')) setFileType('pdf');
    else if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) setFileType('pptx');
    else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) setFileType('xlsx');
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      let finalUrl = url.trim();
      let finalFileName = '';

      if (selectedFile) {
        const key = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await saveLocalFile(key, selectedFile);
        finalUrl = `local://${key}`;
        finalFileName = selectedFile.name;
      }

      if (!finalUrl) {
        throw new Error('Informe um link (Google Drive, PDF, Slides, Planilha) ou selecione um arquivo.');
      }

      await addMaterial({
        title,
        disciplineId: discId,
        fileType,
        url: finalUrl,
        fileName: finalFileName,
        description,
        isShared,
      });

      setShowAddModal(false);
      setTitle('');
      setUrl('');
      setDescription('');
      setSelectedFile(null);
      setFeedback('Material adicionado à biblioteca.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar material.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (material: StudyMaterial) => {
    if (material.url.startsWith('local://')) {
      await deleteLocalFile(material.url.replace('local://', ''));
    }
    await deleteMaterial(material.id);
  };

  const embedUrl = viewerMaterial ? buildEmbedUrl(viewerMaterial) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            PDF · PowerPoint (.pptx) · Excel (.xlsx) · Google Drive · Videoaulas
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Biblioteca de Materiais e Links
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="min-h-[44px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Adicionar arquivo ou link</span>
        </button>
      </div>

      {/* Filter Tabs by File Type */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'pdf', label: 'PDF' },
              { id: 'pptx', label: 'PowerPoint' },
              { id: 'xlsx', label: 'Excel' },
              { id: 'drive', label: 'Google Drive' },
              { id: 'video', label: 'Videoaulas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTypeFilter(tab.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                typeFilter === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Filtrar materiais por disciplina"
          value={disciplineFilter}
          onChange={(e) => setDisciplineFilter(e.target.value)}
          className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl"
        >
          <option value="all">Todas as disciplinas</option>
          {ALEPA_DISCIPLINES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.shortName}
            </option>
          ))}
        </select>
      </div>

      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm font-medium">
          {feedback}
        </div>
      )}

      {/* Materials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((mat) => {
          const Icon = getTypeIcon(mat.fileType);
          const isLocal = mat.url.startsWith('local://');
          const canDelete = !mat.isSystemDefault && mat.ownerId === user?.uid;

          return (
            <article
              key={mat.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[#0B3321]" />
                    <span className="font-semibold text-slate-800">{TYPE_LABELS[mat.fileType]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{getDisciplineShortName(mat.disciplineId)}</span>
                  </div>
                  <span>{isLocal ? 'Arquivo local' : mat.isShared ? 'Compartilhado' : 'Pessoal'}</span>
                </div>

                <h2 className="font-display text-lg font-bold text-slate-900">{mat.title}</h2>
                {mat.description && <p className="text-sm text-slate-600 line-clamp-2">{mat.description}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openViewer(mat)}
                    className="min-h-[40px] px-3.5 py-1.5 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Abrir no leitor</span>
                  </button>

                  {!isLocal && (
                    <a
                      href={mat.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-xl inline-flex items-center gap-1.5"
                    >
                      <span>Abrir link externo</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(mat)}
                    aria-label="Excluir material"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Integrated File & Link Viewer Modal */}
      {viewerMaterial && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  {TYPE_LABELS[viewerMaterial.fileType]} · {getDisciplineShortName(viewerMaterial.disciplineId)}
                </p>
                <h2 className="font-display text-lg font-bold text-slate-900 truncate">{viewerMaterial.title}</h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {viewerBlobUrl && (
                  <a
                    href={viewerBlobUrl}
                    download={viewerFileName || viewerMaterial.fileName || 'material'}
                    className="min-h-[40px] px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-medium rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar arquivo</span>
                  </a>
                )}
                {!viewerMaterial.url.startsWith('local://') && (
                  <a
                    href={viewerMaterial.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3.5 py-1.5 bg-[#0B3321] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                  >
                    <span>Abrir em nova aba</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={closeViewer}
                  aria-label="Fechar visualizador"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-50 overflow-auto p-4">
              {viewerError ? (
                <div className="h-full flex items-center justify-center p-6 text-center">
                  <p className="text-sm text-slate-700 max-w-md">{viewerError}</p>
                </div>
              ) : excelSheets.length > 0 ? (
                <div className="space-y-3 h-full flex flex-col">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit">
                    {excelSheets.map((s, idx) => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => setActiveSheetIdx(idx)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                          activeSheetIdx === idx ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <tbody>
                        {excelSheets[activeSheetIdx]?.rows.map((row, rIdx) => (
                          <tr key={rIdx} className={rIdx === 0 ? 'bg-slate-100 font-semibold' : 'border-t border-slate-100'}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="px-3 py-2 border-r border-slate-100 whitespace-nowrap">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : viewerBlobUrl && viewerMaterial.fileType === 'pdf' ? (
                <iframe
                  title={viewerMaterial.title}
                  src={viewerBlobUrl}
                  className="w-full h-full rounded-xl border border-slate-200 bg-white"
                />
              ) : viewerBlobUrl && viewerMaterial.fileType === 'pptx' ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <Presentation className="w-12 h-12 text-[#0B3321]" />
                  <div className="space-y-1 max-w-md">
                    <p className="font-display text-lg font-bold text-slate-900">
                      Apresentação PowerPoint pronta ({viewerFileName})
                    </p>
                    <p className="text-sm text-slate-600">
                      Arquivos .pptx locais podem ser baixados ou abertos diretamente no PowerPoint / Google Slides.
                      Para pré-visualização embutida direta no navegador, cole o link compartilhado do Google Drive ou
                      OneDrive.
                    </p>
                  </div>
                  <a
                    href={viewerBlobUrl}
                    download={viewerFileName || 'apresentacao.pptx'}
                    className="min-h-[44px] px-5 py-2.5 bg-[#0B3321] text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Abrir / Baixar {viewerFileName}</span>
                  </a>
                </div>
              ) : embedUrl ? (
                <iframe
                  title={viewerMaterial.title}
                  src={embedUrl}
                  allow="autoplay; fullscreen"
                  className="w-full h-full rounded-xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <ExternalLink className="w-10 h-10 text-[#0B3321]" />
                  <div className="space-y-1 max-w-md">
                    <p className="font-display text-lg font-bold text-slate-900">Portal / Link Externo</p>
                    <p className="text-sm text-slate-600">
                      Por segurança do portal de origem ({new URL(viewerMaterial.url).hostname}), este endereço abre em
                      uma nova guia do navegador.
                    </p>
                  </div>
                  <a
                    href={viewerMaterial.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-5 py-2.5 bg-[#0B3321] text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2"
                  >
                    <span>Abrir {viewerMaterial.title}</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Material Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="font-display text-xl font-bold text-slate-900">Adicionar Material ou Link</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Fechar"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Título do material</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Slides Regimento Interno ALEPA"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Formato</label>
                  <select
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value as MaterialFileType)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="pdf">PDF</option>
                    <option value="pptx">PowerPoint (.pptx)</option>
                    <option value="xlsx">Excel (.xlsx)</option>
                    <option value="drive">Google Drive</option>
                    <option value="video">Videoaula</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Disciplina</label>
                  <select
                    value={discId}
                    onChange={(e) => setDiscId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    {ALEPA_DISCIPLINES.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.shortName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Link (Google Drive, OneDrive, PDF, YouTube)
                </label>
                <input
                  type="url"
                  value={url}
                  disabled={Boolean(selectedFile)}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl disabled:bg-slate-100"
                />
              </div>

              <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <Upload className="w-4 h-4 text-[#0B3321]" />
                  <span>
                    {selectedFile
                      ? `Selecionado: ${selectedFile.name}`
                      : 'Ou selecione arquivo do aparelho (.pdf, .pptx, .xlsx)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.ppt,.pptx,.xls,.xlsx,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Descrição (opcional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              {profile?.role === 'teacher' && !selectedFile && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                  />
                  <span>Compartilhar link com toda a turma</span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0B3321] text-white text-sm font-semibold"
                >
                  {submitting ? 'Salvando...' : 'Salvar material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
