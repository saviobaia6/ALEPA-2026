import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  GraduationCap,
  Headphones,
  Link2,
  Loader2,
  LogOut,
  Plus,
  Presentation,
  RefreshCw,
  Scale,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  CAMPUS_LIBRARY_RECOMMENDATIONS,
  CAMPUS_ORGANIZATION_MATRIX,
  GERAL_DEFAULT_MATERIALS,
  GERAL_LIBRARY_CATEGORIES,
  isGeralMaterial,
} from '../data/alepaGeneralLibrary';
import {
  MEDIO_DEFAULT_MATERIALS,
  MEDIO_LIBRARY_CATEGORIES,
  MEDIO_PRIORITY_SOURCES,
} from '../data/alepaMedioLibrary';
import { isMedioDisciplineId } from '../data/alepaMedioSyllabus';
import {
  LIBRARY_CATEGORIES,
  OFFICIAL_PORTAL_LINKS,
  RESOURCE_TYPE_META,
} from '../data/alepaQuestions';
import { getDisciplineShortName } from '../data/alepaSyllabus';
import {
  DRIVE_MIME,
  DriveItem,
  GoogleSlidePage,
  downloadDriveFileBuffer,
  exportGoogleWorkspaceFile,
  fetchGooglePresentation,
  fetchGoogleSpreadsheet,
  getDriveFileMetadata,
  getDriveItemTypeLabel,
  isPresentationDriveItem,
  isSpreadsheetDriveItem,
  listDriveFiles,
  parseGoogleWorkspaceUrl,
} from '../lib/googleWorkspace';
import { deleteLocalFile, getLocalFile, saveLocalFile } from '../lib/localFiles';
import {
  CampusLevel,
  LibraryCategoryId,
  LibraryScope,
  LinkStatus,
  MaterialFileType,
  ResourceType,
  StudyMaterial,
} from '../types';

const RESOURCE_LABELS: Record<ResourceType, string> = {
  pdf: 'PDF',
  livro_digital: 'Livro Digital',
  video: 'Vídeo',
  podcast: 'Podcast',
  legislacao: 'Legislação',
  curso: 'Curso',
  questoes: 'Questões',
  simulado: 'Simulado',
};

const FILE_TYPE_LABELS: Record<MaterialFileType, string> = {
  pdf: 'PDF',
  pptx: 'PowerPoint / Slides',
  xlsx: 'Planilha / Excel',
  drive: 'Google Drive',
  video: 'Vídeo / Portal',
};

const LINK_STATUS_LABELS: Record<LinkStatus, string> = {
  ativo: 'Link ativo',
  instavel: 'Instável',
  atualizacao: 'Em atualização',
};

function GoogleLogoSvg() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function getMaterialIcon(mat: StudyMaterial) {
  if (mat.fileType === 'pptx') return Presentation;
  if (mat.fileType === 'xlsx') return FileSpreadsheet;
  if (mat.fileType === 'drive') return FolderOpen;

  switch (mat.resourceType) {
    case 'livro_digital':
      return BookOpen;
    case 'video':
      return Video;
    case 'podcast':
      return Headphones;
    case 'legislacao':
      return Scale;
    case 'curso':
      return GraduationCap;
    case 'questoes':
    case 'simulado':
      return ClipboardCheck;
    default:
      return FileText;
  }
}

function getDriveItemIcon(item: DriveItem) {
  if (item.mimeType === DRIVE_MIME.FOLDER) return Folder;
  if (isSpreadsheetDriveItem(item)) return FileSpreadsheet;
  if (isPresentationDriveItem(item)) return Presentation;
  return FileText;
}

function inferMaterialTypesFromUrl(rawUrl: string): {
  fileType: MaterialFileType;
  resourceType: ResourceType;
} {
  const parsed = parseGoogleWorkspaceUrl(rawUrl);
  const lower = rawUrl.toLowerCase();
  if (parsed.kind === 'folder') return { fileType: 'drive', resourceType: 'pdf' };
  if (parsed.kind === 'spreadsheet' || /\.(xlsx?|csv)(\?|$)/i.test(lower)) {
    return { fileType: 'xlsx', resourceType: 'pdf' };
  }
  if (parsed.kind === 'presentation' || /\.(pptx?|odp)(\?|$)/i.test(lower)) {
    return { fileType: 'pptx', resourceType: 'pdf' };
  }
  if (parsed.kind === 'drive_file') return { fileType: 'drive', resourceType: 'pdf' };
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return { fileType: 'video', resourceType: 'video' };
  }
  return { fileType: 'pdf', resourceType: 'pdf' };
}

function buildEmbedUrl(material: StudyMaterial): string | null {
  const url = material.url.trim();
  if (!url || url.startsWith('local://')) return null;

  const parsed = parseGoogleWorkspaceUrl(url);
  if (parsed.kind === 'drive_file' && parsed.id) {
    return `https://drive.google.com/file/d/${parsed.id}/preview`;
  }
  if (parsed.kind === 'spreadsheet' && parsed.id) {
    return `https://docs.google.com/spreadsheets/d/${parsed.id}/preview`;
  }
  if (parsed.kind === 'presentation' && parsed.id) {
    return `https://docs.google.com/presentation/d/${parsed.id}/preview`;
  }

  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docsMatch) {
    return `https://docs.google.com/document/d/${docsMatch[1]}/preview`;
  }

  const ytWatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (ytWatch) {
    return `https://www.youtube.com/embed/${ytWatch[1]}`;
  }
  const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (ytShort) {
    return `https://www.youtube.com/embed/${ytShort[1]}`;
  }

  if ((material.fileType === 'pptx' || material.fileType === 'xlsx') && /\.(pptx?|xlsx?)$/i.test(url)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }

  if (material.fileType === 'pdf' && (/\.pdf($|\?)/i.test(url) || url.startsWith('/assets/'))) {
    return url;
  }

  return null;
}

function driveItemToStudyMaterial(item: DriveItem): StudyMaterial {
  let fileType: MaterialFileType = 'drive';
  if (isSpreadsheetDriveItem(item)) fileType = 'xlsx';
  else if (isPresentationDriveItem(item)) fileType = 'pptx';
  else if (item.mimeType === DRIVE_MIME.PDF) fileType = 'pdf';

  let url = item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;
  if (item.mimeType === DRIVE_MIME.FOLDER) {
    url = item.webViewLink || `https://drive.google.com/drive/folders/${item.id}`;
  } else if (item.mimeType === DRIVE_MIME.SHEET) {
    url = item.webViewLink || `https://docs.google.com/spreadsheets/d/${item.id}/edit`;
  } else if (item.mimeType === DRIVE_MIME.SLIDE) {
    url = item.webViewLink || `https://docs.google.com/presentation/d/${item.id}/edit`;
  }

  return {
    id: `drive_${item.id}`,
    ownerId: 'google_drive',
    title: item.name,
    disciplineId: 'processo_legislativo',
    fileType,
    institution: 'Google Drive do Estudante',
    url,
    isShared: false,
    isOfficialContent: false,
    fileName: item.name,
  };
}

export function MaterialsView({ campus }: { campus: CampusLevel }) {
  const {
    materials,
    addMaterial,
    deleteMaterial,
    user,
    profile,
    workspaceAccessToken,
    connectGoogleWorkspace,
    clearWorkspaceToken,
  } = useAuth();

  const isMedio = campus === 'medio';
  const [libraryScope, setLibraryScope] = useState<LibraryScope>(isMedio ? 'medio' : 'superior');
  const [showOrgMatrix, setShowOrgMatrix] = useState<boolean>(false);

  const activeCategories =
    libraryScope === 'geral'
      ? GERAL_LIBRARY_CATEGORIES
      : libraryScope === 'medio'
        ? MEDIO_LIBRARY_CATEGORIES
        : LIBRARY_CATEGORIES;

  const [selectedCategory, setSelectedCategory] = useState<'all' | LibraryCategoryId>('all');
  const [resourceFilter, setResourceFilter] = useState<'all' | ResourceType>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'official' | 'complementary'>('all');

  // Google Drive, Planilhas, PowerPoint & Pasta Browser State
  const [quickLinkInput, setQuickLinkInput] = useState('');
  const [driveBrowserOpen, setDriveBrowserOpen] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSearch, setDriveSearch] = useState('');
  const [driveFilterKind, setDriveFilterKind] = useState<'all' | 'folders' | 'sheets' | 'slides' | 'pdfs'>('all');
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: 'Meu Google Drive' },
  ]);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);

  // Add Modal State (with all 11 metadata fields)
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [modalScope, setModalScope] = useState<LibraryScope>(libraryScope);
  const [categoryId, setCategoryId] = useState<LibraryCategoryId>(activeCategories[0].id);

  useEffect(() => {
    const targetScope: LibraryScope = isMedio ? 'medio' : 'superior';
    setLibraryScope(targetScope);
    setModalScope(targetScope);
    setSelectedCategory('all');
    setCategoryId(
      targetScope === 'medio' ? MEDIO_LIBRARY_CATEGORIES[0].id : LIBRARY_CATEGORIES[5].id
    );
  }, [isMedio]);

  const modalCategories =
    modalScope === 'geral'
      ? GERAL_LIBRARY_CATEGORIES
      : modalScope === 'medio'
        ? MEDIO_LIBRARY_CATEGORIES
        : LIBRARY_CATEGORIES;

  const handleChangeScope = (nextScope: LibraryScope) => {
    setLibraryScope(nextScope);
    setModalScope(nextScope);
    setSelectedCategory('all');
    if (nextScope === 'geral') {
      setCategoryId(GERAL_LIBRARY_CATEGORIES[0].id);
    } else if (nextScope === 'medio') {
      setCategoryId(MEDIO_LIBRARY_CATEGORIES[0].id);
    } else {
      setCategoryId(LIBRARY_CATEGORIES[5].id);
    }
  };
  const [editalTopic, setEditalTopic] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('pdf');
  const [fileType, setFileType] = useState<MaterialFileType>('pdf');
  const [institution, setInstitution] = useState('');
  const [url, setUrl] = useState('');
  const [pricing, setPricing] = useState<'gratuito' | 'pago'>('gratuito');
  const [publishedAt, setPublishedAt] = useState('2026-11-13');
  const [lastVerifiedAt, setLastVerifiedAt] = useState('2026-11-13');
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('ativo');
  const [isOfficialContent, setIsOfficialContent] = useState(true);
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Integrated Viewer State (Local + Google Drive Folders + Google Sheets + Google Slides / PowerPoint)
  const [viewerMaterial, setViewerMaterial] = useState<StudyMaterial | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerBlobUrl, setViewerBlobUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | null>(null);
  const [excelSheets, setExcelSheets] = useState<Array<{ name: string; rows: string[][] }>>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [googleSlides, setGoogleSlides] = useState<GoogleSlidePage[]>([]);
  const [slidesViewMode, setSlidesViewMode] = useState<'preview' | 'outline'>('preview');
  const [sheetViewMode, setSheetViewMode] = useState<'api' | 'preview'>('api');
  const [viewerFolderItems, setViewerFolderItems] = useState<DriveItem[]>([]);
  const [viewerFolderTrail, setViewerFolderTrail] = useState<Array<{ id: string; name: string }>>([]);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const currentFolder = driveBreadcrumbs[driveBreadcrumbs.length - 1];

  const loadDriveFolderContents = useCallback(
    async (
      folderId: string | null,
      tokenOverride?: string | null,
      filterOverride?: 'all' | 'folders' | 'sheets' | 'slides' | 'pdfs',
      searchOverride?: string
    ) => {
      const token = tokenOverride ?? workspaceAccessToken;
      if (!token) return;

      setDriveLoading(true);
      setDriveError(null);
      try {
        const files = await listDriveFiles({
          accessToken: token,
          folderId,
          searchQuery: searchOverride ?? driveSearch,
          filterKind: filterOverride ?? driveFilterKind,
        });
        setDriveItems(files);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao carregar arquivos do Google Drive.';
        if (msg === 'AUTH_EXPIRED') {
          clearWorkspaceToken();
          setDriveError('A sessão do Google Drive expirou. Clique em "Conectar Google Drive" para renovar.');
        } else {
          setDriveError(msg);
        }
      } finally {
        setDriveLoading(false);
      }
    },
    [workspaceAccessToken, driveSearch, driveFilterKind, clearWorkspaceToken]
  );

  useEffect(() => {
    if (driveBrowserOpen && workspaceAccessToken) {
      void loadDriveFolderContents(currentFolder.id);
    }
  }, [driveBrowserOpen, workspaceAccessToken, currentFolder.id, driveFilterKind, loadDriveFolderContents]);

  const handleConnectDrive = async (): Promise<string | null> => {
    setDriveConnecting(true);
    setDriveError(null);
    try {
      const token = await connectGoogleWorkspace();
      if (token) {
        setDriveBrowserOpen(true);
        await loadDriveFolderContents(currentFolder.id, token);
      }
      return token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível conectar ao Google Drive.';
      setDriveError(msg);
      return null;
    } finally {
      setDriveConnecting(false);
    }
  };

  const openFolderInBrowser = async (folderId: string, fallbackName = 'Pasta do Drive', tokenOverride?: string | null) => {
    const token = tokenOverride ?? workspaceAccessToken;
    setDriveBrowserOpen(true);
    setDriveError(null);

    if (!token) {
      setDriveBreadcrumbs([
        { id: null, name: 'Meu Google Drive' },
        { id: folderId, name: fallbackName },
      ]);
      return;
    }

    let resolvedName = fallbackName;
    try {
      const meta = await getDriveFileMetadata(token, folderId);
      if (meta.name) resolvedName = meta.name;
    } catch {
      // Keep fallback name if folder metadata isn't readable
    }

    setDriveBreadcrumbs([
      { id: null, name: 'Meu Google Drive' },
      { id: folderId, name: resolvedName },
    ]);
    await loadDriveFolderContents(folderId, token);
  };

  const prefillModalFromUrlOrItem = async (targetUrl: string, presetTitle?: string, presetFileType?: MaterialFileType) => {
    const parsed = parseGoogleWorkspaceUrl(targetUrl);
    const inferred = inferMaterialTypesFromUrl(parsed.cleanUrl || targetUrl);
    setUrl(parsed.cleanUrl || targetUrl);
    setFileType(presetFileType || inferred.fileType);
    setResourceType(inferred.resourceType);
    setIsOfficialContent(false);
    setInstitution(
      parsed.kind === 'folder' || parsed.kind === 'drive_file'
        ? 'Google Drive do Estudante'
        : parsed.kind === 'spreadsheet'
          ? 'Google Planilhas'
          : parsed.kind === 'presentation'
            ? 'Google Slides / PowerPoint'
            : ''
    );

    if (presetTitle) {
      setTitle(presetTitle);
    } else if (parsed.id && workspaceAccessToken) {
      try {
        const meta = await getDriveFileMetadata(workspaceAccessToken, parsed.id);
        setTitle(meta.name);
      } catch {
        setTitle(parsed.kind === 'folder' ? 'Pasta de Estudos no Google Drive' : '');
      }
    } else if (parsed.kind === 'folder') {
      setTitle('Pasta de Estudos no Google Drive');
    }

    setSelectedFile(null);
    setShowAddModal(true);
  };

  const handleOpenQuickLink = async () => {
    const raw = quickLinkInput.trim();
    if (!raw) return;
    const parsed = parseGoogleWorkspaceUrl(raw);

    if (parsed.kind === 'folder' && parsed.id) {
      if (!workspaceAccessToken) {
        const token = await handleConnectDrive();
        if (token) {
          await openFolderInBrowser(parsed.id, 'Pasta vinculada', token);
        } else {
          await openFolderInBrowser(parsed.id, 'Pasta vinculada', null);
        }
      } else {
        await openFolderInBrowser(parsed.id, 'Pasta vinculada');
      }
      return;
    }

    const inferred = inferMaterialTypesFromUrl(parsed.cleanUrl);
    const tempMat: StudyMaterial = {
      id: `quick_${Date.now()}`,
      ownerId: user?.uid || 'local',
      title:
        parsed.kind === 'spreadsheet'
          ? 'Planilha Google'
          : parsed.kind === 'presentation'
            ? 'Apresentação Google Slides / PowerPoint'
            : 'Material / Link do Google Drive',
      disciplineId: 'processo_legislativo',
      fileType: inferred.fileType,
      institution: 'Google Workspace',
      url: parsed.cleanUrl,
      isShared: false,
      isOfficialContent: false,
    };

    if (parsed.id && workspaceAccessToken) {
      try {
        const meta = await getDriveFileMetadata(workspaceAccessToken, parsed.id);
        tempMat.title = meta.name;
      } catch {
        // Keep friendly fallback title
      }
    }

    await openViewer(tempMat);
  };

  const geralMaterials = materials.filter((m) => isGeralMaterial(m));
  const medioMaterials = materials.filter(
    (m) =>
      !isGeralMaterial(m) &&
      (isMedioDisciplineId(m.disciplineId) || Boolean(m.libraryCategoryId?.startsWith('nm_cat_')))
  );
  const superiorMaterials = materials.filter(
    (m) =>
      !isGeralMaterial(m) &&
      !isMedioDisciplineId(m.disciplineId) &&
      !m.libraryCategoryId?.startsWith('nm_cat_')
  );

  const campusMaterials =
    libraryScope === 'geral'
      ? geralMaterials
      : libraryScope === 'medio'
        ? medioMaterials
        : superiorMaterials;

  // Safeguard unused reference check
  void MEDIO_DEFAULT_MATERIALS;
  void GERAL_DEFAULT_MATERIALS;

  const filtered = campusMaterials.filter((m) => {
    if (selectedCategory !== 'all') {
      const cat = activeCategories.find((c) => c.id === selectedCategory);
      const matchesCat = m.libraryCategoryId
        ? m.libraryCategoryId === selectedCategory
        : cat
          ? m.disciplineId === cat.disciplineId
          : false;
      if (!matchesCat) return false;
    }
    if (resourceFilter !== 'all') {
      const matRes = m.resourceType || (m.fileType === 'video' ? 'video' : 'pdf');
      if (matRes !== resourceFilter) return false;
    }
    if (originFilter === 'official' && !m.isOfficialContent) return false;
    if (originFilter === 'complementary' && m.isOfficialContent) return false;
    return true;
  });

  const closeViewer = () => {
    if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
    setViewerMaterial(null);
    setViewerLoading(false);
    setViewerBlobUrl(null);
    setViewerFileName(null);
    setExcelSheets([]);
    setActiveSheetIdx(0);
    setGoogleSlides([]);
    setSlidesViewMode('preview');
    setSheetViewMode('api');
    setViewerFolderItems([]);
    setViewerFolderTrail([]);
    setViewerError(null);
  };

  const loadFolderInsideViewer = async (folderId: string, folderName: string, resetTrail = false) => {
    if (!workspaceAccessToken) return;
    setViewerLoading(true);
    setViewerError(null);
    try {
      const items = await listDriveFiles({
        accessToken: workspaceAccessToken,
        folderId,
      });
      setViewerFolderItems(items);
      setViewerFolderTrail((prev) =>
        resetTrail ? [{ id: folderId, name: folderName }] : [...prev, { id: folderId, name: folderName }]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao listar pasta do Google Drive.';
      if (msg === 'AUTH_EXPIRED') {
        clearWorkspaceToken();
        setViewerError('A autorização do Google Drive expirou. Clique em "Conectar Google Drive" para continuar.');
      } else {
        setViewerError(msg);
      }
    } finally {
      setViewerLoading(false);
    }
  };

  const openViewer = async (material: StudyMaterial) => {
    closeViewer();
    setViewerMaterial(material);

    if (material.url.startsWith('local://')) {
      const localKey = material.url.replace('local://', '');
      const record = await getLocalFile(localKey);
      if (!record) {
        setViewerError(
          'Este arquivo local foi salvo em outro dispositivo. Para abrir em qualquer aparelho, vincule um link ou pasta do Google Drive.'
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
      return;
    }

    const parsed = parseGoogleWorkspaceUrl(material.url);
    if (!parsed.id) return;

    // 1. Google Drive Folder
    if (parsed.kind === 'folder') {
      if (workspaceAccessToken) {
        await loadFolderInsideViewer(parsed.id, material.title, true);
      }
      return;
    }

    // 2. Google Sheets (read tabs + cells via Google Sheets API v4)
    if (parsed.kind === 'spreadsheet') {
      if (!workspaceAccessToken) {
        setSheetViewMode('preview');
        return;
      }
      setViewerLoading(true);
      try {
        const data = await fetchGoogleSpreadsheet(workspaceAccessToken, parsed.id);
        setExcelSheets(data.sheets);
        setSheetViewMode('api');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'AUTH_EXPIRED') {
          clearWorkspaceToken();
        }
        setSheetViewMode('preview');
      } finally {
        setViewerLoading(false);
      }
      return;
    }

    // 3. Google Slides (fetch slide outline & speaker notes via Slides API v1, plus /preview iframe)
    if (parsed.kind === 'presentation') {
      if (!workspaceAccessToken) {
        setSlidesViewMode('preview');
        return;
      }
      setViewerLoading(true);
      try {
        const pres = await fetchGooglePresentation(workspaceAccessToken, parsed.id);
        setGoogleSlides(pres.slides);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'AUTH_EXPIRED') {
          clearWorkspaceToken();
        }
      } finally {
        setViewerLoading(false);
      }
      return;
    }

    // 4. Generic Google Drive File (.xlsx, .pptx, .pdf stored in Drive)
    if (parsed.kind === 'drive_file' && workspaceAccessToken) {
      setViewerLoading(true);
      try {
        const meta = await getDriveFileMetadata(workspaceAccessToken, parsed.id);
        setViewerFileName(meta.name);

        if (isSpreadsheetDriveItem(meta)) {
          const buffer = await downloadDriveFileBuffer(workspaceAccessToken, parsed.id);
          const blobUrl = URL.createObjectURL(new Blob([buffer], { type: meta.mimeType }));
          setViewerBlobUrl(blobUrl);
          const wb = XLSX.read(buffer, { type: 'array' });
          const parsedSheets = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false }) as string[][];
            return { name, rows: rows.slice(0, 150) };
          });
          setExcelSheets(parsedSheets);
          setSheetViewMode('api');
        } else if (meta.mimeType === DRIVE_MIME.PDF || meta.name.toLowerCase().endsWith('.pdf')) {
          const buffer = await downloadDriveFileBuffer(workspaceAccessToken, parsed.id);
          const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
          setViewerBlobUrl(blobUrl);
        } else if (isPresentationDriveItem(meta)) {
          const buffer = await downloadDriveFileBuffer(workspaceAccessToken, parsed.id);
          const blobUrl = URL.createObjectURL(new Blob([buffer], { type: meta.mimeType }));
          setViewerBlobUrl(blobUrl);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'AUTH_EXPIRED') {
          clearWorkspaceToken();
        }
        // Falls back cleanly to Drive /preview iframe
      } finally {
        setViewerLoading(false);
      }
    }
  };

  const handleDownloadWorkspaceExport = async (material: StudyMaterial, target: 'xlsx' | 'pptx') => {
    if (!workspaceAccessToken) return;
    const parsed = parseGoogleWorkspaceUrl(material.url);
    if (!parsed.id) return;
    setViewerLoading(true);
    try {
      const mime = target === 'xlsx' ? DRIVE_MIME.XLSX : DRIVE_MIME.PPTX;
      const buffer = await exportGoogleWorkspaceFile(workspaceAccessToken, parsed.id, mime);
      const blob = new Blob([buffer], { type: mime });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${material.title.replace(/[^a-zA-Z0-9_-]+/g, '_')}.${target}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setViewerError(err instanceof Error ? err.message : 'Não foi possível exportar este arquivo.');
    } finally {
      setViewerLoading(false);
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
    if (lower.endsWith('.pdf')) {
      setFileType('pdf');
      setResourceType('pdf');
    } else if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
      setFileType('pptx');
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
      setFileType('xlsx');
    }
  };

  const handleUrlInputChange = (nextUrl: string) => {
    setUrl(nextUrl);
    if (nextUrl.trim()) {
      const inferred = inferMaterialTypesFromUrl(nextUrl);
      setFileType(inferred.fileType);
    }
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
        throw new Error('Informe um link (Pasta do Google Drive, Planilha, PowerPoint, PDF) ou selecione um arquivo.');
      }

      const selectedCatObj = modalCategories.find((c) => c.id === categoryId) || modalCategories[0];

      await addMaterial({
        title,
        disciplineId: selectedCatObj.disciplineId,
        libraryCategoryId: selectedCatObj.id,
        editalTopic: editalTopic.trim() || selectedCatObj.title,
        resourceType,
        fileType,
        institution:
          institution.trim() ||
          (modalScope === 'geral'
            ? 'Biblioteca Geral (Comum aos 2 níveis)'
            : modalScope === 'medio'
              ? 'Acervo Nível Médio · Cargo 04 (PL.AL.060)'
              : 'Acervo Nível Superior · Cargo 03 (PL.AL.102)'),
        url: finalUrl,
        pricing,
        publishedAt,
        lastVerifiedAt,
        linkStatus,
        isOfficialContent,
        fileName: finalFileName,
        description,
        isShared,
      });

      setShowAddModal(false);
      setTitle('');
      setEditalTopic('');
      setInstitution('');
      setUrl('');
      setDescription('');
      setSelectedFile(null);
      setFeedback('Material / pasta catalogado na biblioteca digital.');
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
  const viewerParsed = viewerMaterial ? parseGoogleWorkspaceUrl(viewerMaterial.url) : null;
  const isViewerFolder = viewerParsed?.kind === 'folder';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            {libraryScope === 'geral'
              ? 'Biblioteca Geral · Materiais comuns aos dois níveis (tópicos coincidentes e núcleo normativo base)'
              : libraryScope === 'medio'
                ? 'ALEPA 2026 – Nível Médio · Cargo 04 – Assistência Administrativa (PL.AL.060) · Conteúdos específicos'
                : 'ALEPA 2026 – Nível Superior · Cargo 03 – Técnico Legislativo (PL.AL.102) · Conteúdos específicos'}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            {libraryScope === 'geral'
              ? 'Biblioteca Geral (Comum aos 2 Níveis)'
              : libraryScope === 'medio'
                ? 'Biblioteca Nível Médio (Cargo 04 · PL.AL.060)'
                : 'Biblioteca Nível Superior (Cargo 03 · PL.AL.102)'}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            setModalScope(libraryScope);
            setCategoryId(activeCategories[0].id);
            setShowAddModal(true);
          }}
          className="min-h-[44px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Catalogar material ou pasta</span>
        </button>
      </div>

      {/* Organização Recomendada das 3 Bibliotecas (Geral × Superior × Médio) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
              Estrutura da Biblioteca: Geral + Específicas por Cargo
            </h2>
            <p className="text-xs text-slate-600">
              Materiais comuns ficam na Biblioteca Geral; conteúdos específicos e simulados seguem separados por edital e nível de cobrança.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowOrgMatrix((v) => !v)}
            className="min-h-[38px] px-3.5 py-1.5 border border-slate-300 hover:border-[#0B3321] bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl whitespace-nowrap self-start lg:self-auto"
          >
            {showOrgMatrix ? 'Ocultar matriz de disciplinas' : 'Ver matriz: o que compartilhar por disciplina'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => handleChangeScope('geral')}
            className={`text-left p-4 rounded-xl border transition-colors flex flex-col justify-between gap-1.5 ${
              libraryScope === 'geral'
                ? 'border-[#0B3321] bg-[#0B3321] text-white'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${libraryScope === 'geral' ? 'text-emerald-300' : 'text-[#146C43]'}`}>
                Comum aos 2 níveis
              </span>
              <span className={`font-mono text-xs tabular-nums ${libraryScope === 'geral' ? 'text-emerald-200' : 'text-slate-500'}`}>
                {geralMaterials.length} itens
              </span>
            </div>
            <p className="font-display text-base font-bold">Biblioteca Geral</p>
            <p className={`text-xs ${libraryScope === 'geral' ? 'text-emerald-100/90' : 'text-slate-600'}`}>
              Português, Raciocínio Lógico, Informática (coincidentes) e base normativa comum.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleChangeScope('superior')}
            className={`text-left p-4 rounded-xl border transition-colors flex flex-col justify-between gap-1.5 ${
              libraryScope === 'superior'
                ? 'border-[#0B3321] bg-[#0B3321] text-white'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${libraryScope === 'superior' ? 'text-emerald-300' : 'text-[#146C43]'}`}>
                Específico · Cargo 03
              </span>
              <span className={`font-mono text-xs tabular-nums ${libraryScope === 'superior' ? 'text-emerald-200' : 'text-slate-500'}`}>
                {superiorMaterials.length} itens
              </span>
            </div>
            <p className="font-display text-base font-bold">Biblioteca Nível Superior</p>
            <p className={`text-xs ${libraryScope === 'superior' ? 'text-emerald-100/90' : 'text-slate-600'}`}>
              Conteúdos específicos do Cargo 03 – Técnico Legislativo (PL.AL.102).
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleChangeScope('medio')}
            className={`text-left p-4 rounded-xl border transition-colors flex flex-col justify-between gap-1.5 ${
              libraryScope === 'medio'
                ? 'border-[#0B3321] bg-[#0B3321] text-white'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold ${libraryScope === 'medio' ? 'text-emerald-300' : 'text-[#146C43]'}`}>
                Específico · Cargo 04
              </span>
              <span className={`font-mono text-xs tabular-nums ${libraryScope === 'medio' ? 'text-emerald-200' : 'text-slate-500'}`}>
                {medioMaterials.length} itens
              </span>
            </div>
            <p className="font-display text-base font-bold">Biblioteca Nível Médio</p>
            <p className={`text-xs ${libraryScope === 'medio' ? 'text-emerald-100/90' : 'text-slate-600'}`}>
              Conteúdos específicos do Cargo 04 – Assistência Administrativa (PL.AL.060).
            </p>
          </button>
        </div>

        {(showOrgMatrix || libraryScope === 'geral') && (
          <div className="pt-3 border-t border-slate-100 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {CAMPUS_LIBRARY_RECOMMENDATIONS.map((rec) => (
                <div key={rec.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <p className="text-xs font-bold text-[#0B3321]">{rec.title}</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{rec.description}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-3 font-semibold">Disciplina</th>
                    <th className="py-2.5 px-3 font-semibold">Compartilhamento</th>
                    <th className="py-2.5 px-3 font-semibold">Onde organizar</th>
                    <th className="py-2.5 px-3 font-semibold">Critério prático</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CAMPUS_ORGANIZATION_MATRIX.map((row) => (
                    <tr key={row.discipline} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">{row.discipline}</td>
                      <td
                        className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                          row.kind === 'sim'
                            ? 'text-[#146C43]'
                            : row.kind === 'parcial'
                              ? 'text-amber-800'
                              : 'text-red-800'
                        }`}
                      >
                        {row.ruleLabel}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        {row.libraryPlacement}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.guidance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Google Drive, Planilhas, PowerPoint & Pasta de Acesso */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-emerald-800">
              Google Workspace · Acesso direto a pastas, Planilhas Google, Excel (.xlsx), Google Slides e PowerPoint (.pptx)
            </p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Google Drive, Planilhas, PowerPoint e Pastas de Acesso
            </h2>
            <p className="text-xs text-slate-600">
              Cole o link de uma pasta do Google Drive, planilha ou apresentação para abrir aqui dentro ou salvar na
              sua biblioteca de estudo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {!workspaceAccessToken ? (
              <button
                type="button"
                disabled={driveConnecting}
                onClick={handleConnectDrive}
                className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-2.5 shadow-2xs whitespace-nowrap"
              >
                <GoogleLogoSvg />
                <span>{driveConnecting ? 'Conectando...' : 'Conectar Google Drive (Sign in with Google)'}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDriveBrowserOpen((v) => !v)}
                  className="min-h-[42px] px-4 py-2 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>{driveBrowserOpen ? 'Ocultar meu Drive' : 'Explorar Meu Google Drive'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  title="Trocar conta ou atualizar permissão"
                  className="min-h-[42px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Atualizar conta</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearWorkspaceToken();
                    setDriveItems([]);
                    setDriveBrowserOpen(false);
                  }}
                  title="Desconectar Google Drive nesta sessão"
                  className="min-h-[42px] px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Colar link ou pasta do Google Drive */}
        <div className="flex flex-col md:flex-row gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              value={quickLinkInput}
              onChange={(e) => setQuickLinkInput(e.target.value)}
              placeholder="Cole aqui o link da pasta do Drive (drive.google.com/drive/folders/...), Planilha Google ou PowerPoint/Slides..."
              className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B3321]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!quickLinkInput.trim()}
              onClick={handleOpenQuickLink}
              className="min-h-[44px] px-4 py-2 bg-[#146C43] hover:bg-[#0B3321] disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Abrir pasta / arquivo</span>
            </button>
            <button
              type="button"
              disabled={!quickLinkInput.trim()}
              onClick={() => prefillModalFromUrlOrItem(quickLinkInput)}
              className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Salvar na biblioteca</span>
            </button>
          </div>
        </div>

        {driveError && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-center justify-between gap-3">
            <span>{driveError}</span>
            <button
              type="button"
              onClick={handleConnectDrive}
              className="px-3 py-1.5 bg-[#0B3321] text-white font-semibold rounded-lg whitespace-nowrap"
            >
              Conectar Google
            </button>
          </div>
        )}

        {/* Embedded Google Drive Folder & Files Browser */}
        {driveBrowserOpen && (
          <div className="border border-slate-200 rounded-xl bg-slate-50/70 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Breadcrumbs */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {driveBreadcrumbs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextTrail = driveBreadcrumbs.slice(0, -1);
                      setDriveBreadcrumbs(nextTrail);
                      const parent = nextTrail[nextTrail.length - 1];
                      if (workspaceAccessToken) {
                        void loadDriveFolderContents(parent.id);
                      }
                    }}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700"
                    aria-label="Voltar pasta"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                )}

                {driveBreadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={`${crumb.id ?? 'root'}_${idx}`}>
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                    <button
                      type="button"
                      onClick={() => {
                        const nextTrail = driveBreadcrumbs.slice(0, idx + 1);
                        setDriveBreadcrumbs(nextTrail);
                        if (workspaceAccessToken) {
                          void loadDriveFolderContents(crumb.id);
                        }
                      }}
                      className={`px-2 py-1 rounded-lg font-medium ${
                        idx === driveBreadcrumbs.length - 1
                          ? 'bg-[#0B3321] text-white'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {currentFolder.id && (
                <button
                  type="button"
                  onClick={() =>
                    prefillModalFromUrlOrItem(
                      `https://drive.google.com/drive/folders/${currentFolder.id}`,
                      currentFolder.name,
                      'drive'
                    )
                  }
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:border-[#0B3321] text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-[#146C43]" />
                  <span>Salvar esta pasta na biblioteca</span>
                </button>
              )}
            </div>

            {!workspaceAccessToken ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3">
                <p className="text-sm font-medium text-slate-800">
                  Conecte sua conta Google para listar e abrir os arquivos desta pasta diretamente aqui.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleConnectDrive}
                    className="min-h-[42px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold rounded-xl inline-flex items-center gap-2"
                  >
                    <GoogleLogoSvg />
                    <span>Conectar Google Drive</span>
                  </button>
                  {currentFolder.id && (
                    <a
                      href={`https://drive.google.com/drive/folders/${currentFolder.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[42px] px-4 py-2 bg-[#0B3321] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <span>Abrir pasta no Google Drive</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Drive filter & search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit">
                    {(
                      [
                        { id: 'all', label: 'Todos' },
                        { id: 'folders', label: 'Pastas' },
                        { id: 'sheets', label: 'Planilhas' },
                        { id: 'slides', label: 'PowerPoint / Slides' },
                        { id: 'pdfs', label: 'PDFs' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDriveFilterKind(tab.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
                          driveFilterKind === tab.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={driveSearch}
                        onChange={(e) => setDriveSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void loadDriveFolderContents(currentFolder.id);
                          }
                        }}
                        placeholder="Buscar no Drive..."
                        className="min-h-[36px] pl-8 pr-3 py-1 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadDriveFolderContents(currentFolder.id)}
                      className="min-h-[36px] px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-medium rounded-lg"
                    >
                      Buscar
                    </button>
                  </div>
                </div>

                {driveLoading ? (
                  <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-600">
                    <Loader2 className="w-4 h-4 animate-spin text-[#0B3321]" />
                    <span>Carregando arquivos e pastas do Google Drive...</span>
                  </div>
                ) : driveItems.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                    Nenhuma pasta, planilha, apresentação ou PDF encontrado nesta visualização.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {driveItems.map((item) => {
                      const ItemIcon = getDriveItemIcon(item);
                      const isFolder = item.mimeType === DRIVE_MIME.FOLDER;
                      const matPreview = driveItemToStudyMaterial(item);
                      const modDate = item.modifiedTime
                        ? new Date(item.modifiedTime).toLocaleDateString('pt-BR')
                        : null;

                      return (
                        <div
                          key={item.id}
                          className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <ItemIcon
                              className={`w-4 h-4 shrink-0 mt-0.5 ${
                                isFolder ? 'text-[#146C43]' : 'text-[#0B3321]'
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 truncate">{item.name}</p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {getDriveItemTypeLabel(item)}
                                {modDate ? ` · Atualizado em ${modDate}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isFolder ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDriveBreadcrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
                                }}
                                className="min-h-[34px] px-2.5 py-1 bg-[#0B3321] text-white text-[11px] font-semibold rounded-lg whitespace-nowrap"
                              >
                                Abrir pasta
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openViewer(matPreview)}
                                className="min-h-[34px] px-2.5 py-1 bg-[#0B3321] text-white text-[11px] font-semibold rounded-lg whitespace-nowrap"
                              >
                                Abrir
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                prefillModalFromUrlOrItem(matPreview.url, item.name, matPreview.fileType)
                              }
                              title="Vincular à biblioteca da disciplina"
                              className="min-h-[34px] px-2.5 py-1 border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium rounded-lg whitespace-nowrap"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* Estrutura das Categorias da Biblioteca Digital */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-emerald-800">
              {libraryScope === 'geral'
                ? 'Biblioteca Geral · Tópicos coincidentes e núcleo normativo compartilhado'
                : libraryScope === 'medio'
                  ? 'Classificação do Cargo 04 – Auxiliar Técnico Legislativo (PL.AL.060)'
                  : 'Classificação do Cargo 03 – Técnico Legislativo (PL.AL.102)'}
            </p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              {libraryScope === 'geral'
                ? '8 Disciplinas Comuns / Parciais da Biblioteca Geral'
                : libraryScope === 'medio'
                  ? '11 Disciplinas da Biblioteca (Nível Médio · Anexo II)'
                  : '10 Disciplinas e Categorias da Biblioteca Digital'}
            </h2>
          </div>

          {selectedCategory !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className="text-xs font-semibold text-[#0B3321] hover:underline whitespace-nowrap"
            >
              Ver todas as {activeCategories.length} categorias
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {activeCategories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const countInCat = campusMaterials.filter((m) =>
              m.libraryCategoryId ? m.libraryCategoryId === cat.id : m.disciplineId === cat.disciplineId
            ).length;
            const sharingLabel = 'sharingLabel' in cat ? String((cat as { sharingLabel?: string }).sharingLabel) : null;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? 'all' : cat.id)}
                className={`text-left p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'border-[#0B3321] bg-[#0B3321] text-white'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
                  <span className={isSelected ? 'text-emerald-200 font-bold' : 'text-[#0B3321] font-bold'}>
                    {String(cat.order).padStart(2, '0')}
                  </span>
                  <span className={isSelected ? 'text-emerald-200' : 'text-slate-500'}>
                    {countInCat} {countInCat === 1 ? 'item' : 'itens'}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold leading-snug">{cat.title}</p>
                  {sharingLabel && (
                    <p className={`text-[10px] font-semibold mt-0.5 ${isSelected ? 'text-emerald-300' : 'text-[#146C43]'}`}>
                      {sharingLabel}
                    </p>
                  )}
                  <p className={`text-[11px] mt-1 line-clamp-2 ${isSelected ? 'text-emerald-100/90' : 'text-slate-500'}`}>
                    {cat.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Fontes Prioritárias (Nível Médio / Geral) ou Portais F01-F06 (Nível Superior) */}
      {libraryScope === 'medio' || libraryScope === 'geral' ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-emerald-800">
              Fontes prioritárias para Nível Médio – Cargo 04 (PL.AL.060)
            </p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Fontes Prioritárias Oficiais (CETAP, ALEPA, ENAP, Câmara, Senado, Arquivo Nacional e Planalto)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {MEDIO_PRIORITY_SOURCES.map((src) => (
              <article
                key={src.code}
                className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 bg-slate-50/40"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono font-semibold text-[#0B3321]">{src.code}</span>
                    <span className="font-semibold text-[#146C43]">{src.application}</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-slate-900">{src.institution}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{src.description}</p>
                </div>

                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 hover:border-[#0B3321] text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center justify-between gap-1.5"
                >
                  <span className="truncate">{src.actionLabel}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#146C43] shrink-0" />
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-emerald-800">Fontes públicas e repositórios institucionais</p>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Fontes Oficiais Cadastradas (F01 – F06)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {OFFICIAL_PORTAL_LINKS.map((portal) => (
              <article
                key={portal.code}
                className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 bg-slate-50/40"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-[#0B3321]">
                      {portal.code} · {portal.institution}
                    </span>
                    {portal.priorityTag && (
                      <span className="font-semibold text-emerald-800">{portal.priorityTag}</span>
                    )}
                  </div>
                  <h3 className="font-display text-base font-bold text-slate-900">{portal.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{portal.description}</p>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200/80">
                  {portal.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 hover:border-[#0B3321] text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                    >
                      <span>{link.label}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-[#146C43] shrink-0" />
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Filter Tabs by 8 Resource Types + Official Origin */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setResourceFilter('all')}
            className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              resourceFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos os 8 tipos
          </button>
          {RESOURCE_TYPE_META.map((rt) => (
            <button
              key={rt.id}
              type="button"
              onClick={() => setResourceFilter(rt.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                resourceFilter === rt.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit shrink-0">
          {(
            [
              { id: 'all', label: 'Tudo' },
              { id: 'official', label: 'Conteúdo Oficial' },
              { id: 'complementary', label: 'Complementar / Treino' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setOriginFilter(opt.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                originFilter === opt.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm font-medium">
          {feedback}
        </div>
      )}

      {/* Cataloged Materials Grid with full 11 metadata attributes */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-600 space-y-2">
          <p className="font-medium text-slate-800">Nenhum material catalogado para essa combinação de filtros.</p>
          <p className="text-xs text-slate-500">
            Você pode alterar os filtros acima ou clicar em "Catalogar material ou pasta" para cadastrar um novo recurso
            ou pasta do Google Drive nesta categoria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((mat) => {
            const Icon = getMaterialIcon(mat);
            const isLocal = mat.url.startsWith('local://');
            const parsedUrl = parseGoogleWorkspaceUrl(mat.url);
            const canDelete = !mat.isSystemDefault && mat.ownerId === user?.uid;
            const resLabel =
              mat.fileType === 'drive' && parsedUrl.kind === 'folder'
                ? 'Pasta do Google Drive'
                : mat.resourceType
                  ? RESOURCE_LABELS[mat.resourceType]
                  : FILE_TYPE_LABELS[mat.fileType];
            const catTitle =
              activeCategories.find((c) => c.id === mat.libraryCategoryId)?.title ||
              getDisciplineShortName(mat.disciplineId);

            return (
              <article
                key={mat.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-[#0B3321]" />
                      <span className="font-semibold text-slate-800">{resLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{catTitle}</span>
                    </div>
                    <span className={mat.isOfficialContent ? 'font-semibold text-[#146C43]' : 'text-amber-800 font-medium'}>
                      {mat.isOfficialContent ? 'Conteúdo oficial' : 'Treinamento complementar'}
                    </span>
                  </div>

                  <h2 className="font-display text-lg font-bold text-slate-900">{mat.title}</h2>
                  {mat.description && <p className="text-sm text-slate-600 line-clamp-2">{mat.description}</p>}

                  {/* Structured Catalog Metadata */}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                    <div className="col-span-2 truncate">
                      <dt className="inline font-semibold text-slate-700">Tópico do edital: </dt>
                      <dd className="inline">{mat.editalTopic || getDisciplineShortName(mat.disciplineId)}</dd>
                    </div>
                    <div className="truncate">
                      <dt className="inline font-semibold text-slate-700">Instituição: </dt>
                      <dd className="inline">{mat.institution || 'Institucional'}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-slate-700">Acesso: </dt>
                      <dd className="inline">
                        {mat.pricing === 'pago' ? 'Pago' : 'Gratuito'} · {LINK_STATUS_LABELS[mat.linkStatus || 'ativo']}
                      </dd>
                    </div>
                    <div className="font-mono tabular-nums">
                      <dt className="inline font-sans font-semibold text-slate-700">Publicado: </dt>
                      <dd className="inline">{mat.publishedAt || '2026-11-13'}</dd>
                    </div>
                    <div className="font-mono tabular-nums">
                      <dt className="inline font-sans font-semibold text-slate-700">Verificado: </dt>
                      <dd className="inline">{mat.lastVerifiedAt || '2026-11-13'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openViewer(mat)}
                      className="min-h-[40px] px-3.5 py-1.5 bg-[#0B3321] hover:bg-[#134b32] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {parsedUrl.kind === 'folder' ? (
                        <FolderOpen className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>{parsedUrl.kind === 'folder' ? 'Abrir pasta' : 'Abrir no leitor'}</span>
                    </button>

                    {!isLocal && (
                      <a
                        href={mat.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[40px] px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <span>Abrir link</span>
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
      )}

      {/* Integrated File, Google Drive Folder, Google Sheets & Google Slides / PowerPoint Viewer Modal */}
      {viewerMaterial && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  {FILE_TYPE_LABELS[viewerMaterial.fileType]} ·{' '}
                  {viewerMaterial.institution || getDisciplineShortName(viewerMaterial.disciplineId)}
                </p>
                <h2 className="font-display text-lg font-bold text-slate-900 truncate">{viewerMaterial.title}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {viewerParsed?.kind === 'spreadsheet' && workspaceAccessToken && (
                  <button
                    type="button"
                    onClick={() => handleDownloadWorkspaceExport(viewerMaterial, 'xlsx')}
                    className="min-h-[40px] px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-medium rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar .xlsx</span>
                  </button>
                )}

                {viewerParsed?.kind === 'presentation' && workspaceAccessToken && (
                  <button
                    type="button"
                    onClick={() => handleDownloadWorkspaceExport(viewerMaterial, 'pptx')}
                    className="min-h-[40px] px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-medium rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar .pptx</span>
                  </button>
                )}

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
              {viewerLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-sm text-slate-600">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0B3321]" />
                  <span>Carregando conteúdo do Google Workspace...</span>
                </div>
              ) : viewerError ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <p className="text-sm text-slate-700 max-w-md">{viewerError}</p>
                  {!workspaceAccessToken && (
                    <button
                      type="button"
                      onClick={handleConnectDrive}
                      className="min-h-[42px] px-4 py-2 bg-white border border-slate-300 text-slate-900 text-xs font-semibold rounded-xl inline-flex items-center gap-2"
                    >
                      <GoogleLogoSvg />
                      <span>Conectar Google Drive</span>
                    </button>
                  )}
                </div>
              ) : isViewerFolder ? (
                <div className="h-full flex flex-col space-y-4">
                  {!workspaceAccessToken ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                      <FolderOpen className="w-12 h-12 text-[#0B3321]" />
                      <div className="space-y-1 max-w-md">
                        <p className="font-display text-lg font-bold text-slate-900">Pasta do Google Drive</p>
                        <p className="text-sm text-slate-600">
                          Conecte sua conta Google para listar e abrir os PDFs, planilhas e apresentações desta pasta
                          diretamente aqui, ou abra a pasta no Google Drive.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={async () => {
                            const token = await handleConnectDrive();
                            if (token && viewerParsed?.id) {
                              const items = await listDriveFiles({
                                accessToken: token,
                                folderId: viewerParsed.id,
                              });
                              setViewerFolderItems(items);
                              setViewerFolderTrail([{ id: viewerParsed.id, name: viewerMaterial.title }]);
                            }
                          }}
                          className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold rounded-xl inline-flex items-center gap-2"
                        >
                          <GoogleLogoSvg />
                          <span>Conectar Google Drive</span>
                        </button>
                        <a
                          href={viewerMaterial.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] px-5 py-2.5 bg-[#0B3321] text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2"
                        >
                          <span>Abrir pasta no Drive</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {viewerFolderTrail.map((crumb, idx) => (
                          <React.Fragment key={`${crumb.id}_${idx}`}>
                            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            <button
                              type="button"
                              onClick={() => {
                                setViewerFolderTrail(viewerFolderTrail.slice(0, idx));
                                void loadFolderInsideViewer(crumb.id, crumb.name);
                              }}
                              className={`px-2.5 py-1 rounded-lg font-medium ${
                                idx === viewerFolderTrail.length - 1
                                  ? 'bg-[#0B3321] text-white'
                                  : 'bg-white border border-slate-200 text-slate-700'
                              }`}
                            >
                              {crumb.name}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>

                      {viewerFolderItems.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
                          Esta pasta está vazia ou você ainda não possui permissão de leitura nos itens.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto">
                          {viewerFolderItems.map((item) => {
                            const ItemIcon = getDriveItemIcon(item);
                            const isSubfolder = item.mimeType === DRIVE_MIME.FOLDER;
                            return (
                              <div
                                key={item.id}
                                className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3"
                              >
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <ItemIcon className="w-4 h-4 text-[#0B3321] shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-900 truncate">{item.name}</p>
                                    <p className="text-[11px] text-slate-500">{getDriveItemTypeLabel(item)}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isSubfolder) {
                                      void loadFolderInsideViewer(item.id, item.name);
                                    } else {
                                      void openViewer(driveItemToStudyMaterial(item));
                                    }
                                  }}
                                  className="min-h-[36px] px-3 py-1 bg-[#0B3321] text-white text-xs font-semibold rounded-lg shrink-0"
                                >
                                  {isSubfolder ? 'Abrir pasta' : 'Abrir arquivo'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : viewerParsed?.kind === 'spreadsheet' ? (
                <div className="h-full flex flex-col space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit">
                      {excelSheets.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSheetViewMode('api')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                            sheetViewMode === 'api' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          Dados ao vivo (Planilhas)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSheetViewMode('preview')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                          sheetViewMode === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Visualização Google Sheets
                      </button>
                    </div>

                    {!workspaceAccessToken && (
                      <button
                        type="button"
                        onClick={async () => {
                          const token = await handleConnectDrive();
                          if (token && viewerParsed.id) {
                            const data = await fetchGoogleSpreadsheet(token, viewerParsed.id);
                            setExcelSheets(data.sheets);
                            setSheetViewMode('api');
                          }
                        }}
                        className="min-h-[36px] px-3 py-1 bg-white border border-slate-300 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                      >
                        <GoogleLogoSvg />
                        <span>Ler abas via Google Sheets</span>
                      </button>
                    )}
                  </div>

                  {sheetViewMode === 'api' && excelSheets.length > 0 ? (
                    <div className="space-y-3 flex-1 flex flex-col min-h-0">
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
                  ) : embedUrl ? (
                    <iframe
                      title={viewerMaterial.title}
                      src={embedUrl}
                      allow="autoplay; fullscreen"
                      className="w-full flex-1 rounded-xl border border-slate-200 bg-white"
                    />
                  ) : null}
                </div>
              ) : viewerParsed?.kind === 'presentation' ? (
                <div className="h-full flex flex-col space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit">
                      <button
                        type="button"
                        onClick={() => setSlidesViewMode('preview')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                          slidesViewMode === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Apresentação de Slides
                      </button>
                      {googleSlides.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSlidesViewMode('outline')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                            slidesViewMode === 'outline' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          Roteiro de texto ({googleSlides.length} slides)
                        </button>
                      )}
                    </div>

                    {!workspaceAccessToken && (
                      <button
                        type="button"
                        onClick={async () => {
                          const token = await handleConnectDrive();
                          if (token && viewerParsed.id) {
                            const pres = await fetchGooglePresentation(token, viewerParsed.id);
                            setGoogleSlides(pres.slides);
                          }
                        }}
                        className="min-h-[36px] px-3 py-1 bg-white border border-slate-300 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                      >
                        <GoogleLogoSvg />
                        <span>Extrair texto via Google Slides</span>
                      </button>
                    )}
                  </div>

                  {slidesViewMode === 'outline' && googleSlides.length > 0 ? (
                    <div className="flex-1 overflow-y-auto space-y-3">
                      {googleSlides.map((slide) => (
                        <div key={slide.objectId} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                          <p className="font-mono text-xs font-bold text-[#0B3321]">Slide {slide.index}</p>
                          {slide.texts.length > 0 ? (
                            <ul className="space-y-1 text-sm text-slate-800">
                              {slide.texts.map((txt, tIdx) => (
                                <li key={tIdx} className="whitespace-pre-line">
                                  {txt}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-500">Slide visual sem texto extraído.</p>
                          )}
                          {slide.notes && (
                            <div className="pt-2 border-t border-slate-100 text-xs text-slate-600">
                              <span className="font-semibold">Anotações do apresentador: </span>
                              {slide.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : embedUrl ? (
                    <iframe
                      title={viewerMaterial.title}
                      src={embedUrl}
                      allow="autoplay; fullscreen"
                      className="w-full flex-1 rounded-xl border border-slate-200 bg-white"
                    />
                  ) : null}
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
              ) : viewerBlobUrl && viewerMaterial.fileType === 'pptx' && !embedUrl ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <Presentation className="w-12 h-12 text-[#0B3321]" />
                  <div className="space-y-1 max-w-md">
                    <p className="font-display text-lg font-bold text-slate-900">
                      Apresentação PowerPoint pronta ({viewerFileName})
                    </p>
                    <p className="text-sm text-slate-600">
                      Arquivos .pptx locais podem ser baixados ou abertos diretamente no PowerPoint / Google Slides.
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
                      Por segurança do portal de origem, este endereço abre em uma nova guia do navegador.
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

      {/* Add Material Modal (with full catalog fields + Drive folder support) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Catalogar Material ou Pasta na Biblioteca
              </h2>
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Título do material ou pasta</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Pasta ALEPA 2026 no Google Drive / Planilha de Revisão"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Destino na Biblioteca</label>
                <select
                  value={modalScope}
                  onChange={(e) => {
                    const next = e.target.value as LibraryScope;
                    setModalScope(next);
                    const nextList =
                      next === 'geral'
                        ? GERAL_LIBRARY_CATEGORIES
                        : next === 'medio'
                          ? MEDIO_LIBRARY_CATEGORIES
                          : LIBRARY_CATEGORIES;
                    setCategoryId(nextList[0].id);
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                >
                  <option value="geral">Biblioteca Geral · Materiais comuns aos dois níveis</option>
                  <option value="superior">Biblioteca Nível Superior · Específico Cargo 03 (PL.AL.102)</option>
                  <option value="medio">Biblioteca Nível Médio · Específico Cargo 04 (PL.AL.060)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Categoria / Disciplina (
                    {modalScope === 'geral'
                      ? 'Geral · 1–8'
                      : modalScope === 'medio'
                        ? 'Nível Médio · 1–11'
                        : 'Nível Superior · 1–10'}
                    )
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value as LibraryCategoryId)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    {modalCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {String(c.order).padStart(2, '0')} · {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tópico do edital</label>
                  <input
                    value={editalTopic}
                    onChange={(e) => setEditalTopic(e.target.value)}
                    placeholder="Ex.: Espécies normativas e tramitação"
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de material (8 tipos)</label>
                  <select
                    value={resourceType}
                    onChange={(e) => setResourceType(e.target.value as ResourceType)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    {RESOURCE_TYPE_META.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Formato do arquivo / origem</label>
                  <select
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value as MaterialFileType)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="drive">Google Drive (Pasta ou Arquivo)</option>
                    <option value="xlsx">Planilha (Google Sheets / Excel .xlsx)</option>
                    <option value="pptx">Apresentação (PowerPoint .pptx / Slides)</option>
                    <option value="pdf">PDF / Portal Web</option>
                    <option value="video">Videoaula / Áudio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Acesso</label>
                  <select
                    value={pricing}
                    onChange={(e) => setPricing(e.target.value as 'gratuito' | 'pago')}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="gratuito">Gratuito</option>
                    <option value="pago">Pago</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Instituição responsável</label>
                  <input
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="Ex.: Google Drive / ALEPA / CETAP / Senado"
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Situação do link</label>
                  <select
                    value={linkStatus}
                    onChange={(e) => setLinkStatus(e.target.value as LinkStatus)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="instavel">Instável</option>
                    <option value="atualizacao">Em atualização</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Data de publicação</label>
                  <input
                    type="date"
                    value={publishedAt}
                    onChange={(e) => setPublishedAt(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Data da última verificação</label>
                  <input
                    type="date"
                    value={lastVerifiedAt}
                    onChange={(e) => setLastVerifiedAt(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Link de acesso ou Pasta do Google Drive (Drive Folder, Planilha, PowerPoint/Slides, PDF)
                </label>
                <input
                  type="url"
                  value={url}
                  disabled={Boolean(selectedFile)}
                  onChange={(e) => handleUrlInputChange(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/... ou https://docs.google.com/..."
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

              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOfficialContent}
                    onChange={(e) => setIsOfficialContent(e.target.checked)}
                  />
                  <span>Indicar como conteúdo oficial (órgão/banca/legislação)</span>
                </label>

                {profile?.role === 'teacher' && !selectedFile && (
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isShared}
                      onChange={(e) => setIsShared(e.target.checked)}
                    />
                    <span>Compartilhar link com toda a turma</span>
                  </label>
                )}
              </div>

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
