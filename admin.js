const CONFIG_KEY = "paper_reading_github_config_v1";
const DATA_FILE_PATH = "data/papers.json";
const API_VERSION = "2022-11-28";

const $ = (id) => document.getElementById(id);

function setStatus(message, isError = false) {
  $("adminStatus").textContent = message;
  $("adminStatus").classList.toggle("error", isError);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
  $("owner").value = saved.owner || inferOwnerFromGitHubPages() || "";
  $("repo").value = saved.repo || inferRepoFromGitHubPages() || "";
  $("branch").value = saved.branch || "main";
  $("token").value = saved.token || "";
  setStatus("已读取本机保存的设置。");
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
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
    date: $("date").value,
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
    const papers = JSON.parse(content || "[]");
    return {
      sha: file.sha,
      papers: Array.isArray(papers) ? papers : []
    };
  } catch (error) {
    if (error.status === 404) {
      return { sha: null, papers: [] };
    }
    throw error;
  }
}

async function writeData(config, papers, sha) {
  const url = buildApiURL(config);
  const body = {
    message: `Add paper: ${papers[0]?.title || "paper reading record"}`,
    content: utf8ToBase64(JSON.stringify(papers, null, 2) + "\n"),
    branch: config.branch
  };

  if (sha) body.sha = sha;

  return githubFetch(url, config, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

async function submitPaper() {
  try {
    const config = getConfig();
    const paper = getPaperFromForm();

    validateConfig(config);
    validatePaper(paper);

    setStatus("正在读取 GitHub 上的 data/papers.json...");
    const current = await readCurrentData(config);

    const exists = current.papers.some(p =>
      String(p.title || "").trim() === paper.title &&
      String(p.date || "").trim() === paper.date
    );

    if (exists && !confirm("同一天已有同标题论文，仍然继续添加吗？")) {
      setStatus("已取消提交。");
      return;
    }

    const nextPapers = [paper, ...current.papers];

    setStatus("正在提交到 GitHub...");
    await writeData(config, nextPapers, current.sha);

    setStatus("提交成功！GitHub Pages 更新后即可在展示页看到。");
    clearForm(false);
  } catch (error) {
    console.error(error);
    setStatus(`提交失败：${error.message}`, true);
  }
}

function clearForm(resetDate = true) {
  [
    "title", "authors", "year", "link", "topic", "problem", "method",
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
$("submitBtn").addEventListener("click", submitPaper);
$("previewBtn").addEventListener("click", previewJSON);
$("clearFormBtn").addEventListener("click", () => clearForm());

$("date").value = today();
loadConfig();