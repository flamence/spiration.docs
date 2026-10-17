import Translate from '@docusaurus/Translate';
import React, { useState, useMemo } from 'react';
import styles from './ProjectGenerator.module.css';

function slugify(input) {
  return (input || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const DEFAULTS = {
  projectName: 'hello-world',
  extensionId: 'com.example.hello-world',
  displayName: 'Hello World',
  author: 'Me',
  language: 'cpp',
};

const LANGUAGE_META = {
  c:   { label: 'C',   srcPath: 'src/main.c',   header: '<spiration/api.h>',   cmakeLang: 'C',   stdVar: 'C_STANDARD', stdVal: '99' },
  cpp: { label: 'C++', srcPath: 'src/main.cpp', header: '<spiration/api.hpp>', cmakeLang: 'CXX', stdVar: 'CXX_STANDARD', stdVal: '17' },
};

function buildFiles({ projectName, extensionId, displayName, author, language }) {
  const { srcPath, header, cmakeLang, stdVar, stdVal } = LANGUAGE_META[language];

  const cmake = `cmake_minimum_required(VERSION 3.14)
project(${projectName} VERSION 0.1.0 LANGUAGES ${cmakeLang})

include(FetchContent)
FetchContent_Declare(
    spiration.api
    GIT_REPOSITORY https://github.com/flamence/spiration.api.git
    GIT_TAG main
)
FetchContent_MakeAvailable(spiration.api)

add_library(\${PROJECT_NAME} SHARED
    ${srcPath}
)

target_compile_definitions(\${PROJECT_NAME} PRIVATE SPIRATION_EXTENSION)

target_link_libraries(\${PROJECT_NAME} PRIVATE spiration::api)

set_target_properties(\${PROJECT_NAME} PROPERTIES
    ${stdVar} ${stdVal}
    ${stdVar}_REQUIRED ON
    RUNTIME_OUTPUT_DIRECTORY "\${CMAKE_CURRENT_BINARY_DIR}/bin"
    LIBRARY_OUTPUT_DIRECTORY "\${CMAKE_CURRENT_BINARY_DIR}/bin"
)

configure_file(
    "\${CMAKE_CURRENT_SOURCE_DIR}/res/extension.json"
    "\${CMAKE_CURRENT_BINARY_DIR}/extension.json"
    @ONLY
)

install(TARGETS \${PROJECT_NAME} RUNTIME DESTINATION "bin" LIBRARY DESTINATION "bin")
install(FILES "\${CMAKE_CURRENT_BINARY_DIR}/extension.json" DESTINATION ".")

`;

  const json = `{
    "id": "${extensionId}",
    "name": "${displayName}",
    "author": "${author}",
    "version": "@PROJECT_VERSION@",
    "main": "bin/@CMAKE_SHARED_LIBRARY_PREFIX@${projectName}@CMAKE_SHARED_LIBRARY_SUFFIX@",
    "api_version": 1
}

`;

  const source = `#include ${header}

static spiration_bool SPIRATION_CALL on_initialize(spiration_extension_desc* self) {
    // ...
    return SPIRATION_TRUE;
}

static void SPIRATION_CALL on_shutdown(spiration_extension_desc* self) {
    SPIRATION_UNUSED(self);
}

static spiration_extension_desc g_desc = {
    SPIRATION_STRUCT_VERSION,
    (uint32_t)sizeof(spiration_extension_desc),
    SPIRATION_PHASE_NORMAL,
    SPIRATION_API_VERSION,
    SPIRATION_STR_INIT("${extensionId}"),
    SPIRATION_STR_INIT("${displayName}"),
    SPIRATION_STR_INIT("0.1.0"),
    SPIRATION_STR_INIT(""),
    NULL, NULL,
    on_initialize, on_shutdown, NULL,
    {NULL}
};

SPIRATION_DEFINE_EXTENSION_ENTRY(&g_desc)

`;

  return [
    { path: 'CMakeLists.txt',     content: cmake },
    { path: 'res/extension.json', content: json  },
    { path: srcPath,              content: source },
  ];
}

function buildTree(rootName, files) {
  const root = { name: rootName, type: 'dir', children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        node.children.push({ name, type: 'file', path: f.path });
      } else {
        let dir = node.children.find(c => c.type === 'dir' && c.name === name);
        if (!dir) {
          dir = { name, type: 'dir', children: [] };
          node.children.push(dir);
        }
        node = dir;
      }
    }
  }
  const sort = (n) => {
    if (n.type !== 'dir') return;
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function TreeNode({ node, level = 0, selectedPath, onSelect }) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: `${0.5 + level * 0.9}rem` };

  if (node.type === 'dir') {
    return (
      <React.Fragment>
        <div
          className={`${styles.treeRow} ${styles.treeRowDir}`}
          style={indent}
          onClick={() => setOpen(o => !o)}
        >
          <span className={styles.caret}>{open ? '▼' : '▶'}</span>
          <span className={styles.icon}>{open ? '📂' : '📁'}</span>
          <span>{node.name}</span>
        </div>
        {open && node.children.map((c) => (
          <TreeNode key={c.path || c.name} node={c} level={level + 1}
                    selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </React.Fragment>
    );
  }

  const active = selectedPath === node.path;
  return (
    <div
      className={`${styles.treeRow} ${active ? styles.treeRowActive : ''}`}
      style={indent}
      onClick={() => onSelect(node.path)}
    >
      <span className={styles.caret} />
      <span className={styles.icon}>📄</span>
      <span>{node.name}</span>
    </div>
  );
}

export default function ProjectGenerator() {
  const [projectName, setProjectName] = useState(DEFAULTS.projectName);
  const [extensionId, setExtensionId] = useState(DEFAULTS.extensionId);
  const [displayName, setDisplayName] = useState(DEFAULTS.displayName);
  const [author, setAuthor] = useState(DEFAULTS.author);
  const [language, setLanguage] = useState(DEFAULTS.language);

  const [step, setStep] = useState('configure');
  const [selectedPath, setSelectedPath] = useState(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const projectSlug = slugify(projectName);
  const finalId = extensionId.trim();
  const finalDisplayName = displayName.trim();
  const finalAuthor = author.trim();

  const canGenerate =
    projectSlug !== '' &&
    finalId !== '' &&
    finalDisplayName !== '' &&
    finalAuthor !== '';

  const files = useMemo(() => buildFiles({
    projectName: projectSlug,
    extensionId: finalId,
    displayName: finalDisplayName,
    author: finalAuthor,
    language,
  }), [projectSlug, finalId, finalDisplayName, finalAuthor, language]);

  const tree = useMemo(() => buildTree(projectSlug, files), [projectSlug, files]);
  const activeFile = files.find(f => f.path === selectedPath) || files[0];

  function handleGenerate() {
    if (!canGenerate) return;
    setSelectedPath(files[0].path);
    setStep('browse');
  }

  async function copyActive() {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {  }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const mod = await import('jszip');
      const JSZip = mod.default || mod;
      const zip = new JSZip();
      const root = zip.folder(projectSlug);
      for (const f of files) root.file(f.path, f.content);
      const blob = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectSlug}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {  } finally {
      setDownloading(false);
    }
  }

  if (step === 'configure') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            <Translate id="theme.ProjectGenerator.title">项目生成器</Translate>
          </h3>
        </div>

        <div className={styles.body}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>
                <Translate id="theme.ProjectGenerator.field.name">名称</Translate>
              </span>
              <input
                className={styles.input}
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                aria-invalid={projectName.trim() === ''}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>
                <Translate id="theme.ProjectGenerator.field.id">标识符</Translate>
              </span>
              <input
                className={styles.input}
                value={extensionId}
                onChange={e => setExtensionId(e.target.value)}
                aria-invalid={extensionId.trim() === ''}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>
                <Translate id="theme.ProjectGenerator.field.displayName">显示名称</Translate>
              </span>
              <input
                className={styles.input}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                aria-invalid={displayName.trim() === ''}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>
                <Translate id="theme.ProjectGenerator.field.author">作者</Translate>
              </span>
              <input
                className={styles.input}
                value={author}
                onChange={e => setAuthor(e.target.value)}
                aria-invalid={author.trim() === ''}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>
                <Translate id="theme.ProjectGenerator.field.language">项目语言</Translate>
              </span>
              <select
                className={styles.input}
                value={language}
                onChange={e => setLanguage(e.target.value)}
              >
                {Object.entries(LANGUAGE_META).map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.primaryBtn}
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              <Translate id="theme.ProjectGenerator.action.generate">生成</Translate>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button className={styles.ghostBtn} onClick={() => setStep('configure')}>
            <Translate id="theme.ProjectGenerator.action.back">后退</Translate>
          </button>
          <span className={styles.pathLabel}>{projectSlug}/</span>
        </div>
        <button
          className={styles.primaryBtn}
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading
            ? <Translate id="theme.ProjectGenerator.action.packaging">打包中…</Translate>
            : <Translate id="theme.ProjectGenerator.action.package">打包</Translate>
          }
        </button>
      </div>

      <div className={styles.browser}>
        <div className={styles.sidebar}>
          <TreeNode node={tree} selectedPath={selectedPath} onSelect={setSelectedPath} />
        </div>

        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <span>{projectSlug}/{activeFile.path}</span>
            <button className={styles.ghostBtn} onClick={copyActive}>
              {copied
                ? <Translate id="theme.ProjectGenerator.action.copied">已复制 ✓</Translate>
                : <Translate id="theme.ProjectGenerator.action.copy">复制</Translate>
              }
            </button>
          </div>
          <pre className={styles.pre}><code>{activeFile.content}</code></pre>
        </div>
      </div>
    </div>
  );
}
