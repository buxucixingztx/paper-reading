const CONFIG_KEY = "paper_reading_github_config_v3";
const OLD_CONFIG_KEY_V2 = "paper_reading_github_config_v2";
const OLD_CONFIG_KEY_V1 = "paper_reading_github_config_v1";
const DATA_FILE_PATH = "data/papers.json";
const API_VERSION = "2022-11-28";
const DEFAULT_CATEGORIES = ["VLA", "VLN", "WM", "WAM", "LLM", "RAG", "Agent", "Robotics", "Other"];

let cachedPapers = [];
let cachedSha = null;
let editingId = null;

const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  $("adminStatus").textContent = message;
  $("adminStatus").classList.toggle("error", isError);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `paper_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function inferCategory(paper) {
  const explicit = String(paper.category || "").trim();
  if (explicit) return explicit;

  const text = `${paper.topic || ""} ${paper.tags || ""} ${paper.title || ""}`.toUpperCase();
  for (const c of ["VLA", "VLN", "WAM", "WM"]) {
    if (text.includes(c)) return c;
  }
  return "未分类";
}

function normalizePaper(paper) {
  const normalized = { ...paper };
  if (!normalized.id) normalized.id = createId();
  if (!String(normalized.category || "").trim()) normalized.category = inferCategory(normalized);
  return normalized;
}

function normalizePapers(papers) {
  let changed = false;
  const next = papers.map(p => {
    const normalized = normalizePaper(p);
    if (!p.id || !String(p.category || "").trim()) changed = true;
    return normalized;
  });
  return { papers: next, changed };
}

function getConfig() {
  return {
    owner: $("owner").value.trim(),
    repo: $("repo").value.trim(),
    branch: $("branch").value.trim() || "main",
    token: $("token").value.trim()
  };
}

function saveConfig() {
  const config = getConfig();
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  setStatus("已保存到当前浏览器。");
}

function loadConfig() {
  const saved = JSON.parse(
    localStorage.getItem(CONFIG_KEY) ||
    localStorage.getItem(OLD_CONFIG_KEY_V2) ||
    localStorage.getItem(OLD_CONFIG_KEY_V1) ||
    "{}"
  );
  $("owner").value = saved.owner || inferOwnerFromGitHubPages() || "";
  $("repo").value = saved.repo || inferRepoFromGitHubPages() || "";
  $("branch").value = saved.branch || "main";
  $("token").value = saved.token || "";
  setStatus("已读取本机保存的设置。");
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(OLD_CONFIG_KEY_V2);
  localStorage.removeItem(OLD_CONFIG_KEY_V1);
  $("token").value = "";
  setStatus("已清除本机保存的设置。");
}

function inferOwnerFromGitHubPages() {
  const host = location.hostname;
  if (host.endsWith(".github.io")) return host.split(".")[0];
  return "";
}

function inferRepoFromGitHubPages() {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts[0] || "";
}

function getPaperFromForm() {
  return {
    id: editingId || createId(),
    date: $("date").value,
    category: $("category").value.trim(),
    title: $("title").value.trim(),
    authors: $("authors").value.trim(),
    year: $("year").value.trim(),
    link: $("link").value.trim(),
    topic: $("topic").value.trim(),
    problem: $("problem").value.trim(),
    method: $("method").value.trim(),
    dataset: $("dataset").value.trim(),
    metric: $("metric").value.trim(),
    contribution: $("contribution").value.trim(),
    limitation: $("limitation").value.trim(),
    takeaway: $("takeaway").value.trim(),
    tags: $("tags").value.trim(),
    status: $("status").value
  };
}

function validateConfig(config) {
  if (!config.owner || !config.repo || !config.branch || !config.token) {
    throw new Error("请先填写 GitHub 用户名、仓库名、分支和 Token。");
  }
}

function validatePaper(paper) {
  if (!paper.title) {
    throw new Error("请至少填写论文标题。");
  }
  if (!paper.date) {
    throw new Error("请填写阅读日期。");
  }
  if (!paper.category) {
    throw new Error("请填写论文类别，例如 VLA / VLN / WM / WAM。");
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildApiURL(config) {
  const path = encodeURIComponent(DATA_FILE_PATH).replaceAll("%2F", "/");
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`;
}

async function githubFetch(url, config, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${config.token}`,
      "X-GitHub-Api-Version": API_VERSION,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = data?.message || response.statusText || "GitHub API 请求失败";
    const error = new Error(`${response.status} ${message}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function readCurrentData(config) {
  const url = `${buildApiURL(config)}?ref=${encodeURIComponent(config.branch)}`;

  try {
    const file = await githubFetch(url, config);
    const content = base64ToUtf8(file.content || "");
    const rawPapers = JSON.parse(content || "[]");
    const normalized = normalizePapers(Array.isArray(rawPapers) ? rawPapers : []);
    return {
      sha: file.sha,
      papers: normalized.papers,
      normalizedChanged: normalized.changed
    };
  } catch (error) {
    if (error.status === 404) {
      return { sha: null, papers: [], normalizedChanged: false };
    }
    throw error;
  }
}

async function writeData(config, papers, sha, message) {
  const url = buildApiURL(config);
  const body = {
    message,
    content: utf8ToBase64(JSON.stringify(papers, null, 2) + "\n"),
    branch: config.branch
  };

  if (sha) body.sha = sha;

  const result = await githubFetch(url, config, {
    method: "PUT",
    body: JSON.stringify(body)
  });

  cachedSha = result?.content?.sha || cachedSha;
  cachedPapers = papers;
  buildManageCategoryFilter();
  renderManageTable();
  return result;
}

async function loadPapersFromGitHub(showMessage = true) {
  const config = getConfig();
  validateConfig(config);

  if (showMessage) setStatus("正在读取 GitHub 上的 data/papers.json...");
  const current = await readCurrentData(config);

  cachedPapers = current.papers;
  cachedSha = current.sha;

  if (current.normalizedChanged) {
    setStatus("检测到旧数据缺少 id 或 category，正在自动补齐并提交一次...");
    await writeData(config, cachedPapers, cachedSha, "Normalize paper IDs and categories");
  }

  buildManageCategoryFilter();
  renderManageTable();

  if (showMessage) {
    setStatus(`已读取 ${cachedPapers.length} 条论文记录。`);
  }
}

async function submitPaper() {
  try {
    const config = getConfig();
    const paper = getPaperFromForm();

    validateConfig(config);
    validatePaper(paper);

    setStatus("正在同步 GitHub 最新数据...");
    const current = await readCurrentData(config);
    cachedPapers = current.papers;
    cachedSha = current.sha;

    let nextPapers;
    let message;

    if (editingId) {
      const index = cachedPapers.findIndex(p => p.id === editingId);
      if (index === -1) {
        throw new Error("没有找到正在编辑的论文，可能已被删除。请刷新后重试。");
      }

      nextPapers = cachedPapers.map(p => p.id === editingId ? paper : p);
      message = `Update paper: ${paper.title}`;
    } else {
      const exists = cachedPapers.some(p =>
        String(p.title || "").trim() === paper.title &&
        String(p.date || "").trim() === paper.date
      );

      if (exists && !confirm("同一天已有同标题论文，仍然继续添加吗？")) {
        setStatus("已取消提交。");
        return;
      }

      nextPapers = [paper, ...cachedPapers];
      message = `Add paper: ${paper.title}`;
    }

    setStatus("正在提交到 GitHub...");
    await writeData(config, nextPapers, cachedSha, message);

    setStatus(editingId ? "修改成功！展示页稍后会同步更新。" : "新增成功！展示页稍后会同步更新。");
    clearForm();
    setModeAdd();
  } catch (error) {
    console.error(error);
    setStatus(`提交失败：${error.message}`, true);
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function getCategoryList() {
  const categories = new Set(DEFAULT_CATEGORIES);
  cachedPapers.forEach(p => categories.add(inferCategory(p)));
  categories.delete("");
  return Array.from(categories).sort((a, b) => {
    const ai = DEFAULT_CATEGORIES.indexOf(a);
    const bi = DEFAULT_CATEGORIES.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "zh-CN");
  });
}

function buildManageCategoryFilter() {
  const currentValue = $("manageCategoryFilter").value;
  const categories = getCategoryList();
  $("manageCategoryFilter").innerHTML = `<option value="">全部类别</option>` +
    categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
  if (categories.includes(currentValue)) $("manageCategoryFilter").value = currentValue;
}

function renderManageTable() {
  const keyword = normalize($("manageSearch").value);
  const selectedCategory = $("manageCategoryFilter").value;

  const rows = [...cachedPapers]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .filter(p => {
      const category = inferCategory(p);
      const text = normalize(JSON.stringify({ ...p, category }));
      const matchKeyword = !keyword || text.includes(keyword);
      const matchCategory = !selectedCategory || category === selectedCategory;
      return matchKeyword && matchCategory;
    });

  $("manageTable").innerHTML = rows.map(p => {
    const category = inferCategory(p);
    return `
      <tr>
        <td>${escapeHTML(p.date)}</td>
        <td><span class="category-badge">${escapeHTML(category)}</span></td>
        <td>
          <div class="paper-title">${escapeHTML(p.title)}</div>
          ${p.link ? `<div class="meta"><a href="${escapeHTML(p.link)}" target="_blank" rel="noopener">打开原文</a></div>` : ""}
        </td>
        <td>${escapeHTML(p.authors || "")}</td>
        <td>
          <div>${escapeHTML(p.topic || "")}</div>
          <div class="meta">${escapeHTML(p.tags || "")}</div>
        </td>
        <td>${escapeHTML(p.status || "")}</td>
        <td>
          <div class="row-actions">
            <button class="secondary" data-action="edit" data-id="${escapeHTML(p.id)}">编辑</button>
            <button class="danger" data-action="delete" data-id="${escapeHTML(p.id)}">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  if (rows.length === 0) {
    $("manageTable").innerHTML = `
      <tr>
        <td colspan="7" class="note">没有找到匹配的论文。请先点击“读取已有论文”，或调整搜索关键词。</td>
      </tr>
    `;
  }
}

function fillForm(paper) {
  const ids = [
    "date", "category", "title", "authors", "year", "link", "topic", "problem", "method",
    "dataset", "metric", "contribution", "limitation", "takeaway", "tags", "status"
  ];

  ids.forEach(id => {
    if ($(id)) $(id).value = id === "category" ? inferCategory(paper) : (paper[id] || "");
  });

  if (!paper.status) $("status").value = "精读";
}

function setModeEdit(paper) {
  editingId = paper.id;
  fillForm(paper);
  $("submitBtn").textContent = "保存修改到 GitHub";
  $("cancelEditBtn").disabled = false;
  $("modePill").textContent = "编辑模式";
  $("modePill").classList.add("editing");
  setStatus(`正在编辑：${paper.title}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setModeAdd() {
  editingId = null;
  $("submitBtn").textContent = "新增到 GitHub";
  $("cancelEditBtn").disabled = true;
  $("modePill").textContent = "新增模式";
  $("modePill").classList.remove("editing");
}

async function deletePaper(id) {
  try {
    const config = getConfig();
    validateConfig(config);

    setStatus("正在同步 GitHub 最新数据...");
    const current = await readCurrentData(config);
    cachedPapers = current.papers;
    cachedSha = current.sha;

    const paper = cachedPapers.find(p => p.id === id);
    if (!paper) {
      throw new Error("没有找到这篇论文，可能已经被删除。请刷新列表。");
    }

    if (!confirm(`确定删除这篇论文吗？\n\n${paper.title}`)) {
      setStatus("已取消删除。");
      return;
    }

    const nextPapers = cachedPapers.filter(p => p.id !== id);
    setStatus("正在提交删除操作到 GitHub...");
    await writeData(config, nextPapers, cachedSha, `Delete paper: ${paper.title}`);

    if (editingId === id) {
      clearForm();
      setModeAdd();
    }

    setStatus("删除成功！展示页稍后会同步更新。");
  } catch (error) {
    console.error(error);
    setStatus(`删除失败：${error.message}`, true);
  }
}

function clearForm(resetDate = true) {
  [
    "category", "title", "authors", "year", "link", "topic", "problem", "method",
    "dataset", "metric", "contribution", "limitation", "takeaway", "tags"
  ].forEach(id => $(id).value = "");

  $("status").value = "精读";
  if (resetDate) $("date").value = today();
  $("preview").textContent = "";
}

function previewJSON() {
  $("preview").textContent = JSON.stringify(getPaperFromForm(), null, 2);
}

$("saveConfigBtn").addEventListener("click", saveConfig);
$("loadConfigBtn").addEventListener("click", loadConfig);
$("clearConfigBtn").addEventListener("click", clearConfig);
$("refreshBtn").addEventListener("click", () => loadPapersFromGitHub(true).catch(error => setStatus(`读取失败：${error.message}`, true)));
$("reloadPapersBtn").addEventListener("click", () => loadPapersFromGitHub(true).catch(error => setStatus(`读取失败：${error.message}`, true)));
$("submitBtn").addEventListener("click", submitPaper);
$("previewBtn").addEventListener("click", previewJSON);
$("clearFormBtn").addEventListener("click", () => {
  clearForm();
  setModeAdd();
});
$("cancelEditBtn").addEventListener("click", () => {
  clearForm();
  setModeAdd();
  setStatus("已退出编辑模式。");
});
$("manageSearch").addEventListener("input", renderManageTable);
$("manageCategoryFilter").addEventListener("change", renderManageTable);

$("manageTable").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;
  const paper = cachedPapers.find(p => p.id === id);

  if (action === "edit") {
    if (!paper) {
      setStatus("没有找到这篇论文，请刷新列表。", true);
      return;
    }
    setModeEdit(paper);
  }

  if (action === "delete") {
    deletePaper(id);
  }
});

$("date").value = today();
loadConfig();
buildManageCategoryFilter();
renderManageTable();

// 如果配置已存在，自动尝试读取已有论文；失败时不打断页面使用。
if ($("owner").value && $("repo").value && $("token").value) {
  loadPapersFromGitHub(false).catch(() => {});
}
