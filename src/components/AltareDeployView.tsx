import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, GitBranch, Server, Terminal } from 'lucide-react';
import {
  ALTARE_BOT_TS,
  ALTARE_CONFIG_TS,
  ALTARE_DOCKERFILE,
  ALTARE_ENV_EXAMPLE,
  ALTARE_GITIGNORE,
  ALTARE_PACKAGE_JSON,
} from '../utils/botTemplates';

type PackageFileKey =
  | 'telefind.config.ts'
  | 'bot-telefind.ts'
  | 'package.json'
  | 'Dockerfile'
  | '.gitignore'
  | '.env.example';

interface FileDef {
  key: PackageFileKey;
  label: string;
  content: string;
  description: string;
}

const FILES: FileDef[] = [
  {
    key: 'telefind.config.ts',
    label: 'telefind.config.ts',
    content: ALTARE_CONFIG_TS,
    description: 'Archivo único de configuración donde pegas tus 4 credenciales antes de subir a un repo privado.',
  },
  {
    key: 'bot-telefind.ts',
    label: 'bot-telefind.ts',
    content: ALTARE_BOT_TS,
    description: 'Motor principal en Node.js + TypeScript con GramJS y comandos de BotFather.',
  },
  {
    key: 'package.json',
    label: 'package.json',
    content: ALTARE_PACKAGE_JSON,
    description: 'Dependencias mínimas (telegram, dotenv, tsx) y script npm start.',
  },
  {
    key: 'Dockerfile',
    label: 'Dockerfile',
    content: ALTARE_DOCKERFILE,
    description: 'Imagen Docker Node 22 Alpine lista para Altare.',
  },
  {
    key: '.gitignore',
    label: '.gitignore',
    content: ALTARE_GITIGNORE,
    description: 'Evita subir node_modules o archivos .env por error.',
  },
  {
    key: '.env.example',
    label: '.env.example',
    content: ALTARE_ENV_EXAMPLE,
    description: 'Plantilla opcional por si prefieres usar variables .env en lugar de telefind.config.ts.',
  },
];

export function AltareDeployView() {
  const [activeFile, setActiveFile] = useState<PackageFileKey>('telefind.config.ts');
  const [copied, setCopied] = useState(false);

  const currentFile = FILES.find((f) => f.key === activeFile) || FILES[0];

  async function handleCopy() {
    await navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function downloadFile(file: FileDef) {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.key;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleDownloadAll() {
    FILES.forEach((f, idx) => {
      setTimeout(() => downloadFile(f), idx * 180);
    });
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Despliegue directo desde GitHub en Altare (console.altare.gg)
            </h2>
            <p className="text-sm text-slate-600">
              Tanto este repositorio completo como el paquete ligero incluyen <span className="font-mono text-xs">telefind.config.ts</span> para que solo tengas que pegar tus 4 credenciales en ese archivo (en un repositorio privado de GitHub) y arrancar en Altare sin configurar nada más.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://console.altare.gg/"
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <span>Abrir Altare</span>
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={handleDownloadAll}
              className="h-10 px-4 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
            >
              <Download className="w-4 h-4" />
              <span>Descargar archivos</span>
            </button>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1">
            <p className="text-xs font-mono text-sky-700 font-semibold">01 · Edita telefind.config.ts</p>
            <p className="text-sm font-medium text-slate-900">Rellena tus 4 datos</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pega <span className="font-mono">apiId</span>, <span className="font-mono">apiHash</span>, <span className="font-mono">sessionString</span> y <span className="font-mono">botToken</span> dentro de <span className="font-mono">telefind.config.ts</span>. Usa siempre un repositorio privado en GitHub.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-mono text-sky-700 font-semibold">02 · Conecta GitHub en Altare</p>
            <p className="text-sm font-medium text-slate-900">Git Repo Address</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              En tu Egg de Node.js en <span className="font-mono">console.altare.gg</span> (Startup), pega la URL de tu repo privado en <span className="font-mono">Git Repo Address</span>.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-mono text-sky-700 font-semibold">03 · Start y listo</p>
            <p className="text-sm font-medium text-slate-900">Despliegue automático</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Usa <span className="font-mono">npm install && npm start</span> y pulsa <span className="font-medium">Start</span>. No necesitas crear archivos <span className="font-mono">.env</span> en Altare.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
            {FILES.map((file) => (
              <button
                key={file.key}
                type="button"
                onClick={() => setActiveFile(file.key)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeFile === file.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {file.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button
              type="button"
              onClick={() => downloadFile(currentFile)}
              className="h-9 px-3 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar {currentFile.label}</span>
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 bg-white">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentFile.description}</span>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-slate-500 font-mono">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="w-3.5 h-3.5" />
              GitHub
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Server className="w-3.5 h-3.5" />
              console.altare.gg
            </span>
          </div>
        </div>

        <pre className="p-4 text-xs font-mono leading-relaxed text-slate-800 bg-slate-50 overflow-x-auto max-h-[480px]">
          <code>{currentFile.content}</code>
        </pre>
      </div>
    </div>
  );
}
